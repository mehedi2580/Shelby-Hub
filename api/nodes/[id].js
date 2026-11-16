/**
 * GET /api/nodes/:id
 * Detail for one storage-provider address. With no on-chain provider
 * registry, stake / latency / uptime / chunk histories are unavailable
 * (null). The audit feed is real: the address's audit-function
 * transactions from the shelbynet indexer, enriched with success flags
 * from the REST API. (The node grid is empty until a registry exists,
 * so this endpoint is currently dormant in the UI.)
 */
import { getTxnDetail, gql, SHELBY_CONTRACT } from "../_lib.js";

export default async function handler(req, res) {
  const id = req.query?.id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ ok: false, error: "node id required" });
  }
  try {
    let auditTxns = [];
    if (id.startsWith("0x")) {
      // Audit-function transactions sent by this address.
      const data = await gql(
        `query NodeAudits($sender: String!) {
          user_transactions(
            where: {
              sender: { _eq: $sender }
              entry_function_contract_address: { _eq: "${SHELBY_CONTRACT}" }
              entry_function_function_name: { _ilike: "%audit%" }
            }
            order_by: { version: desc }
            limit: 10
          ) { version sender timestamp entry_function_id_str entry_function_function_name sequence_number }
        }`,
        { sender: id },
      );
      auditTxns = data?.user_transactions ?? [];
    }
    const enriched = await Promise.all(
      auditTxns.map(async (t) => {
        try {
          const d = await getTxnDetail(t.version);
          return {
            passed: d.success,
            challengeId: d.hash,
            timestamp: t.timestamp,
            responseMs: null,
            chunkId: null,
          };
        } catch {
          return {
            passed: null,
            challengeId: null,
            timestamp: t.timestamp,
            responseMs: null,
            chunkId: null,
          };
        }
      }),
    );
    const decided = enriched.filter((a) => a.passed !== null);
    const passed = decided.filter((a) => a.passed).length;
    res.status(200).json({
      ok: true,
      live: true,
      data: {
        address: id,
        stakedApt: null,
        isActive: null,
        auditPassRate:
          decided.length > 0 ? Math.round((passed / decided.length) * 100) : null,
        auditResults: enriched,
        latencyHistory: null,
        uptimeHistory: null,
        chunkHistory: null,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
