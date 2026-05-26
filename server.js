/**
 * Shelby Hub — API Server
 * Bridges the browser dashboard to the Shelby SDK (Node.js only)
 * and the Aptos/Shelby Indexer GraphQL APIs.
 *
 * Run:  node server.js
 * Then open:  http://localhost:3000
 */

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Network, AptosConfig, Aptos } from "@aptos-labs/ts-sdk";
import { ShelbyNodeClient } from "@shelby/sdk";

// ── Config ────────────────────────────────────────────────────
const PORT      = process.env.PORT || 3000;
const API_KEY   = process.env.SHELBY_API_KEY || "aptoslabs_bMHgaGAyMZr_9Zdd4otniy5EevkmqCFfaJsDqGnD39ovg";
const NETWORK   = Network.TESTNET;

const SHELBY_CONTRACT = "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a";
const SHELBYNET_INDEXER = "https://api.shelbynet.shelby.xyz/v1/graphql";
const TESTNET_INDEXER   = "https://api.testnet.aptoslabs.com/v1/graphql";
const SHELBY_RPC        = "https://api.testnet.shelby.xyz/shelby";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── SDK clients ───────────────────────────────────────────────
const shelbyClient = new ShelbyNodeClient({
  network: NETWORK,
  apiKey:  API_KEY,
});

const aptosConfig = new AptosConfig({
  network: NETWORK,
  clientConfig: { API_KEY },
});
const aptosClient = new Aptos(aptosConfig);

// ── Express app ───────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Helper: GraphQL fetch ─────────────────────────────────────
async function gql(endpoint, query, variables = {}) {
  const res = await fetch(endpoint, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// ── Helper: Shelby RPC HTTP ───────────────────────────────────
async function rpcGet(path) {
  const res = await fetch(`${SHELBY_RPC}${path}`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  return res.json();
}

// ── /api/network ──────────────────────────────────────────────
app.get("/api/network", async (req, res) => {
  try {
    const blobsData = await gql(TESTNET_INDEXER, `
      query ShelbyStats {
        fungible_asset_activities_aggregate(
          where: { entry_function_id_str: { _like: "%${SHELBY_CONTRACT}%register_blob%" } }
        ) {
          aggregate { count }
        }
      }
    `);

    let spCount = 0;
    try {
      const resources = await aptosClient.getAccountResources({
        accountAddress: SHELBY_CONTRACT,
      });
      const spRegistry = resources.find(r =>
        r.type.includes("storage_provider") || r.type.includes("StorageProvider")
      );
      if (spRegistry?.data?.providers) {
        spCount = Array.isArray(spRegistry.data.providers)
          ? spRegistry.data.providers.length
          : spRegistry.data.providers?.vec?.length ?? 0;
      }
    } catch (_) {}

    let totalBlobs = 0;
    let totalBytes = 0;
    try {
      const count = await shelbyClient.coordination.getBlobsCount();
      totalBlobs = Number(count ?? 0);
    } catch (_) {}

    try {
      const size = await shelbyClient.coordination.getTotalBlobsSize();
      totalBytes = Number(size ?? 0);
    } catch (_) {}

    if (totalBlobs === 0) {
      totalBlobs = blobsData?.fungible_asset_activities_aggregate?.aggregate?.count ?? 0;
    }

    res.json({
      ok: true,
      data: {
        totalBlobs,
        totalBytes,
        storageCapacityBytes: 10 * 1024 * 1024 * 1024 * 1024,
        spCount: spCount || null,
        network: NETWORK,
        rpcUrl: SHELBY_RPC,
        contractAddress: SHELBY_CONTRACT,
      },
    });
  } catch (err) {
    console.error("[/api/network]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/blobs/recent ─────────────────────────────────────────
app.get("/api/blobs/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const data = await gql(TESTNET_INDEXER, `
      query RecentBlobs($limit: Int!) {
        user_transactions(
          where: {
            entry_function_id_str: { _like: "%${SHELBY_CONTRACT}%" }
          }
          order_by: { timestamp: desc }
          limit: $limit
        ) {
          hash
          sender
          timestamp
          entry_function_id_str
          gas_used
          success
        }
      }
    `, { limit });

    const txns = data?.user_transactions ?? [];

    res.json({
      ok:   true,
      data: txns.map(t => ({
        hash:      t.hash,
        sender:    t.sender,
        timestamp: t.timestamp,
        fn:        t.entry_function_id_str?.split("::")?.slice(-1)[0] ?? "unknown",
        gasUsed:   t.gas_used,
        success:   t.success,
      })),
    });
  } catch (err) {
    console.error("[/api/blobs/recent]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/blobs/history ────────────────────────────────────────
app.get("/api/blobs/history", async (req, res) => {
  try {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().split("T")[0]);
    }

    const data = await gql(TESTNET_INDEXER, `
      query BlobHistory {
        user_transactions(
          where: {
            entry_function_id_str: { _like: "%${SHELBY_CONTRACT}%register_blob%" }
            timestamp: { _gte: "${days[0]}T00:00:00" }
          }
          order_by: { timestamp: asc }
          limit: 1000
        ) {
          timestamp
          success
        }
      }
    `);

    const txns = data?.user_transactions ?? [];

    const byDay = {};
    days.forEach(d => (byDay[d] = 0));
    txns.forEach(t => {
      const day = t.timestamp?.split("T")[0];
      if (day && byDay[day] !== undefined && t.success) byDay[day]++;
    });

    res.json({
      ok:   true,
      data: days.map(d => ({ date: d, blobs: byDay[d] })),
    });
  } catch (err) {
    console.error("[/api/blobs/history]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/nodes ────────────────────────────────────────────────
app.get("/api/nodes", async (req, res) => {
  try {
    const resources = await aptosClient.getAccountResources({
      accountAddress: SHELBY_CONTRACT,
    });

    const nodeResources = resources.filter(r =>
      r.type.toLowerCase().includes("storage") ||
      r.type.toLowerCase().includes("provider") ||
      r.type.toLowerCase().includes("placement")
    );

    const nodes = [];
    for (const r of nodeResources) {
      const data = r.data;
      const list = data?.providers ?? data?.storage_providers ?? data?.vec ?? [];
      if (Array.isArray(list)) {
        list.forEach((p, i) => {
          nodes.push({
            address: p?.addr ?? p?.address ?? `SP-${i}`,
            stake:   p?.stake ?? 0,
            status:  p?.is_active ? "online" : "registered",
            region:  "on-chain",
          });
        });
      }
    }

    res.json({
      ok:   true,
      data: nodes,
      rawResourceTypes: nodeResources.map(r => r.type),
    });
  } catch (err) {
    console.error("[/api/nodes]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/wallet/:address ──────────────────────────────────────
// Returns Shelby-specific activity for a given Aptos address:
// total txns, blobs registered, gas used, daily history (14d),
// tx type breakdown, and recent transactions.
app.get("/api/wallet/:address", async (req, res) => {
  const { address } = req.params;

  // Validate: Aptos addresses are 0x + 64 hex chars
  if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
    return res.status(400).json({ ok: false, error: "Invalid Aptos address format" });
  }

  try {
    // 1. All Shelby transactions from this sender
    const txData = await gql(TESTNET_INDEXER, `
      query WalletTxns($sender: String!) {
        user_transactions(
          where: {
            sender: { _eq: $sender }
            entry_function_id_str: { _like: "%${SHELBY_CONTRACT}%" }
          }
          order_by: { timestamp: desc }
          limit: 200
        ) {
          hash
          sender
          timestamp
          entry_function_id_str
          gas_used
          success
          sequence_number
        }
      }
    `, { sender: address });

    const txns = txData?.user_transactions ?? [];

    if (txns.length === 0) {
      return res.json({
        ok:   true,
        data: {
          totalTxns:   0,
          totalBlobs:  0,
          totalBytes:  0,
          gasUsed:     0,
          firstSeen:   null,
          lastActive:  null,
          txBreakdown: {},
          history:     [],
          recentTxns:  [],
        },
      });
    }

    // 2. Compute aggregates
    const totalTxns   = txns.length;
    const totalGas    = txns.reduce((s, t) => s + Number(t.gas_used || 0), 0);
    const firstSeen   = txns[txns.length - 1]?.timestamp ?? null;
    const lastActive  = txns[0]?.timestamp ?? null;

    // Transaction type breakdown
    const breakdown = { register_blob: 0, delete_blob: 0, audit_blob: 0, other: 0 };
    txns.forEach(t => {
      const fn = t.entry_function_id_str?.split("::")?.slice(-1)[0] ?? "";
      if (fn.includes("register"))   breakdown.register_blob++;
      else if (fn.includes("delete")) breakdown.delete_blob++;
      else if (fn.includes("audit"))  breakdown.audit_blob++;
      else                            breakdown.other++;
    });

    // 3. 14-day daily history
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().split("T")[0]);
    }
    const byDay = {};
    days.forEach(d => (byDay[d] = 0));
    txns.forEach(t => {
      const day = t.timestamp?.split("T")[0];
      if (day && byDay[day] !== undefined && t.success) byDay[day]++;
    });

    // 4. Try to get blob byte count from SDK
    let totalBytes = 0;
    try {
      const blobs = await shelbyClient.coordination.getBlobsByOwner(address);
      if (Array.isArray(blobs)) {
        totalBytes = blobs.reduce((s, b) => s + Number(b.size || 0), 0);
      }
    } catch (_) {
      // Estimate: ~500 KB per registered blob (rough average)
      totalBytes = breakdown.register_blob * 500 * 1024;
    }

    res.json({
      ok:   true,
      data: {
        totalTxns,
        totalBlobs:  breakdown.register_blob,
        totalBytes,
        gasUsed:     totalGas,
        firstSeen,
        lastActive,
        txBreakdown: breakdown,
        history:     days.map(d => ({ date: d, blobs: byDay[d] })),
        recentTxns:  txns.slice(0, 10).map(t => ({
          hash:      t.hash,
          fn:        t.entry_function_id_str?.split("::")?.slice(-1)[0] ?? "unknown",
          timestamp: t.timestamp,
          success:   t.success,
          gasUsed:   Number(t.gas_used || 0),
        })),
      },
    });
  } catch (err) {
    console.error("[/api/wallet]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/nodes/:id ───────────────────────────────────────────
// Returns detailed health data for a single storage provider node.
// :id can be a 0x address or a node name like SP-Node-01.
app.get("/api/nodes/:id", async (req, res) => {
  const nodeId = req.params.id;

  try {
    // 1. Try to find the node on-chain by address or name
    let onChainNode = null;
    try {
      const resources = await aptosClient.getAccountResources({
        accountAddress: SHELBY_CONTRACT,
      });
      const nodeResources = resources.filter(r =>
        r.type.toLowerCase().includes("storage") ||
        r.type.toLowerCase().includes("provider")
      );
      for (const r of nodeResources) {
        const list = r.data?.providers ?? r.data?.storage_providers ?? r.data?.vec ?? [];
        if (Array.isArray(list)) {
          const found = list.find(p =>
            (p?.addr ?? p?.address ?? "").toLowerCase() === nodeId.toLowerCase()
          );
          if (found) { onChainNode = found; break; }
        }
      }
    } catch (_) {}

    // 2. Fetch recent audit transactions for this node from indexer
    let auditTxns = [];
    if (/^0x[0-9a-fA-F]+$/.test(nodeId)) {
      try {
        const auditData = await gql(TESTNET_INDEXER, `
          query NodeAudits($sender: String!) {
            user_transactions(
              where: {
                sender: { _eq: $sender }
                entry_function_id_str: { _like: "%${SHELBY_CONTRACT}%audit%" }
              }
              order_by: { timestamp: desc }
              limit: 20
            ) {
              hash
              timestamp
              success
              gas_used
              entry_function_id_str
            }
          }
        `, { sender: nodeId });
        auditTxns = auditData?.user_transactions ?? [];
      } catch (_) {}
    }

    // 3. Build response — use real data where available, simulate the rest
    const passCount   = auditTxns.filter(t => t.success).length;
    const auditPassRate = auditTxns.length > 0
      ? Math.round((passCount / auditTxns.length) * 100)
      : null;

    const auditResults = auditTxns.slice(0, 10).map((t, i) => ({
      passed:      t.success,
      challengeId: t.hash,
      timestamp:   t.timestamp,
      responseMs:  t.success ? Math.floor(Math.random() * 180 + 40) : null,
      chunkId:     Math.floor(Math.random() * 9999 + 100),
    }));

    res.json({
      ok:   true,
      live: auditTxns.length > 0,
      data: {
        address:        nodeId,
        stakedApt:      onChainNode?.stake ?? null,
        isActive:       onChainNode?.is_active ?? null,
        auditPassRate,
        auditResults,
        // Latency / uptime / chunks: not available via public indexer — client generates simulated
        latencyHistory: null,
        uptimeHistory:  null,
        chunkHistory:   null,
      },
    });
  } catch (err) {
    console.error("[/api/nodes/:id]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/contract/resources ───────────────────────────────────
app.get("/api/contract/resources", async (req, res) => {
  try {
    const resources = await aptosClient.getAccountResources({
      accountAddress: SHELBY_CONTRACT,
    });
    res.json({
      ok:   true,
      data: resources.map(r => ({ type: r.type, data: r.data })),
    });
  } catch (err) {
    console.error("[/api/contract/resources]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/upload ───────────────────────────────────────────────
// Accepts a file (base64) and stores it as a blob on Shelby testnet
// using the official SDK. Returns blob ID, tx hash, and metadata.
app.post("/api/upload", async (req, res) => {
  const { fileName, fileType, fileSizeBytes, data } = req.body;

  if (!data || !fileName) {
    return res.status(400).json({ ok: false, error: "fileName and data are required" });
  }

  if (fileSizeBytes > 10 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: "File exceeds 10 MB limit" });
  }

  try {
    // Convert base64 to Buffer
    const fileBuffer = Buffer.from(data, "base64");

    // Upload using Shelby SDK
    const result = await shelbyClient.blob.store({
      data:        fileBuffer,
      contentType: fileType || "application/octet-stream",
      metadata: {
        fileName,
        uploadedVia: "shelby-hub-dashboard",
        uploadedAt:  new Date().toISOString(),
      },
    });

    res.json({
      ok:   true,
      data: {
        blobId:        result.blobId   ?? result.blob_id ?? result.id,
        txHash:        result.txHash   ?? result.tx_hash ?? result.transaction_hash,
        chunks:        result.chunks   ?? Math.ceil(fileSizeBytes / (256 * 1024)),
        spCount:       result.spCount  ?? result.sp_count ?? null,
        erasureFactor: result.erasure  ?? "10+4",
        confirmedAt:   result.confirmedAt ?? new Date().toISOString(),
        fileSizeBytes,
        fileName,
      },
    });
  } catch (err) {
    console.error("[/api/upload]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/health ───────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok:        true,
    server:    "shelby-hub",
    network:   NETWORK,
    rpc:       SHELBY_RPC,
    contract:  SHELBY_CONTRACT,
    timestamp: new Date().toISOString(),
  });
});

// ── Fallback: serve index.html ────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Shelby Hub API server running`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Network:  ${NETWORK}`);
  console.log(`   → RPC:      ${SHELBY_RPC}`);
  console.log(`   → Contract: ${SHELBY_CONTRACT}`);
  console.log(`\n   API endpoints:`);
  console.log(`   GET /api/health`);
  console.log(`   GET /api/network`);
  console.log(`   GET /api/blobs/recent`);
  console.log(`   GET /api/blobs/history`);
  console.log(`   GET /api/nodes`);
  console.log(`   GET /api/wallet/:address`);
  console.log(`   GET /api/contract/resources`);
  console.log(`   POST /api/upload\n`);
});
