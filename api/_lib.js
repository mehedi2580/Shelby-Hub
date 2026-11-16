/**
 * Shelby Hub — shared data layer (Vercel Serverless Functions + local server)
 *
 * Live data comes from the SHELBYNET chain (Shelby's own Aptos-based network),
 * NOT from Aptos testnet:
 *   - GraphQL indexer: https://api.shelbynet.shelby.xyz/v1/graphql
 *   - REST API:        https://api.shelbynet.shelby.xyz/v1
 *
 * The Shelby contract (0x85fd…8e6a) lives on shelbynet. On Aptos testnet the
 * same address holds no resources and the indexer times out on filtered
 * queries, so testnet is not used for contract data.
 *
 * Notes on the current indexer schema (verified 2026-11-16):
 *   - There is NO events / events_aggregate table.
 *   - There is NO user_transactions_aggregate or
 *     fungible_asset_activities_aggregate.
 *   - user_transactions has NO hash / success / gas_used fields. Those come
 *     from the REST API (GET /transactions/by_version/{version}).
 *   - List queries are capped at 100 rows per request by the indexer.
 *   - The chain is busy (~80 txns/min for this contract), so windowed
 *     samples — not full-history counts — are the honest unit of data.
 *
 * The @shelby/sdk npm package no longer exists (404) and the old Shelby RPC
 * (api.testnet.shelby.xyz) is unreachable, so this layer uses only the
 * indexer + REST. No SDK is required.
 *
 * Auth: SHELBY_API_KEY is optional — the shelbynet indexer and REST API
 * answer without it. When set (Vercel env var / local env), it is sent as a
 * Bearer token. NEVER hardcode a key in this repo.
 */

export const SHELBY_CONTRACT =
  "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a";
export const SHELBYNET_GQL = "https://api.shelbynet.shelby.xyz/v1/graphql";
export const SHELBYNET_REST = "https://api.shelbynet.shelby.xyz/v1";
export const NETWORK = "SHELBYNET";

// Optional API key, env only. Empty string = unauthenticated (works).
const API_KEY = process.env.SHELBY_API_KEY || "";

// ── Low-level fetchers ──────────────────────────────────────────

export async function gql(query, variables = {}) {
  const res = await fetch(SHELBYNET_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

export async function restGet(path, timeoutMs = 8000) {
  const res = await fetch(`${SHELBYNET_REST}${path}`, {
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${path}`);
  return res.json();
}

// ── Transaction helpers ─────────────────────────────────────────

export function fnName(entryFunctionIdStr) {
  return entryFunctionIdStr?.split("::")?.slice(-1)[0] ?? "unknown";
}

export function mapTxn(t) {
  // The indexer returns naive timestamps (no timezone suffix); they are
  // UTC. Mark them explicitly, otherwise browsers parse them as local
  // time and every "x seconds ago" label is off by the UTC offset.
  const ts =
    typeof t.timestamp === "string" && !t.timestamp.endsWith("Z")
      ? `${t.timestamp}Z`
      : t.timestamp;
  return {
    version: Number(t.version),
    sender: t.sender,
    timestamp: ts,
    fn: fnName(t.entry_function_id_str),
    functionName:
      t.entry_function_function_name ?? fnName(t.entry_function_id_str),
    entryFunction: t.entry_function_id_str,
    sequenceNumber: t.sequence_number,
  };
}

const TXN_FIELDS = `version sender timestamp entry_function_id_str entry_function_function_name sequence_number`;

/** Most recent Shelby-contract transactions (indexer caps at 100 rows). */
export async function getRecentTxns(limit = 100) {
  const capped = Math.max(1, Math.min(Number(limit) || 100, 100));
  const data = await gql(
    `query RecentShelbyTxns($limit: Int!) {
      user_transactions(
        where: { entry_function_contract_address: { _eq: "${SHELBY_CONTRACT}" } }
        order_by: { version: desc }
        limit: $limit
      ) { ${TXN_FIELDS} }
    }`,
    { limit: capped },
  );
  return (data?.user_transactions ?? []).map(mapTxn);
}

/** Transactions sent by one address to the Shelby contract. */
export async function getTxnsBySender(address, limit = 200) {
  const capped = Math.max(1, Math.min(Number(limit) || 200, 200));
  // The indexer caps at 100 rows per request; page with offset for more.
  const pages = Math.ceil(capped / 100);
  const results = [];
  for (let p = 0; p < pages; p++) {
    const take = Math.min(100, capped - p * 100);
    const data = await gql(
      `query WalletTxns($sender: String!, $limit: Int!, $offset: Int!) {
        user_transactions(
          where: {
            sender: { _eq: $sender }
            entry_function_contract_address: { _eq: "${SHELBY_CONTRACT}" }
          }
          order_by: { version: desc }
          limit: $limit
          offset: $offset
        ) { ${TXN_FIELDS} }
      }`,
      { sender: address, limit: take, offset: p * 100 },
    );
    const rows = data?.user_transactions ?? [];
    results.push(...rows.map(mapTxn));
    if (rows.length < take) break; // no more rows
  }
  return results;
}

/** Enrich one txn with hash / success / gas_used from the REST API. */
export async function getTxnDetail(version) {
  const tx = await restGet(`/transactions/by_version/${version}`);
  return {
    hash: tx.hash,
    success: tx.success,
    gasUsed: Number(tx.gas_used ?? 0),
  };
}

// ── Contract resources (REST) ───────────────────────────────────

export async function getResources() {
  return restGet(`/accounts/${SHELBY_CONTRACT}/resources`);
}

export function findResource(resources, needle) {
  return resources.find((r) => r.type.includes(needle));
}

export function parseEpochs(resources) {
  const epoch = findResource(resources, "::epoch::Epoch")?.data ?? {};
  const num = (v) => (v === undefined || v === null ? null : Number(v));
  return {
    auditEpoch: num(epoch.current_audit_epoch),
    paymentEpoch: num(epoch.current_payment_epoch),
    stakingEpoch: num(epoch.current_staking_epoch),
  };
}

export function parseAccountSeq(resources) {
  const acct = findResource(resources, "0x1::account::Account")?.data ?? {};
  return acct.sequence_number ? Number(acct.sequence_number) : null;
}

// ── Rate / bucket helpers ───────────────────────────────────────

/** Transactions-per-minute measured from a timestamped sample. */
export function measureRate(txns) {
  if (!txns || txns.length < 2) return null;
  const newest = new Date(txns[0].timestamp).getTime();
  const oldest = new Date(txns[txns.length - 1].timestamp).getTime();
  const windowMin = (newest - oldest) / 60000;
  if (windowMin <= 0) return null;
  return Math.round((txns.length / windowMin) * 10) / 10;
}

/** Group txns into fixed-width time buckets (newest first input). */
export function bucketize(txns, bucketMs) {
  const buckets = new Map();
  for (const t of txns) {
    const ts = new Date(t.timestamp).getTime();
    if (Number.isNaN(ts)) continue;
    const start = Math.floor(ts / bucketMs) * bucketMs;
    buckets.set(start, (buckets.get(start) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, n]) => ({ t: new Date(t).toISOString(), n }));
}
