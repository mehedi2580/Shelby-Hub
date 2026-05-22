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

// Shelby smart contract deployer address (from docs)
const SHELBY_CONTRACT = "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a";

// Shelbynet Indexer GraphQL endpoint
const SHELBYNET_INDEXER = "https://api.shelbynet.shelby.xyz/v1/graphql";
// Testnet Indexer GraphQL endpoint  
const TESTNET_INDEXER   = "https://api.testnet.aptoslabs.com/v1/graphql";
// Shelby RPC
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
app.use(express.static(__dirname)); // serve index.html, app.js, style.css

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
// Returns: blob count, total storage bytes, node count, avg latency
app.get("/api/network", async (req, res) => {
  try {
    // 1. Total blobs & storage size via Aptos Indexer
    const blobsData = await gql(TESTNET_INDEXER, `
      query ShelbyStats {
        fungible_asset_activities_aggregate(
          where: { entry_function_id_str: { _like: "%${SHELBY_CONTRACT}%register_blob%" } }
        ) {
          aggregate { count }
        }
      }
    `);

    // 2. Contract resource — storage providers registered on-chain
    let spCount = 0;
    try {
      const resources = await aptosClient.getAccountResources({
        accountAddress: SHELBY_CONTRACT,
      });
      // Look for the storage provider registry resource
      const spRegistry = resources.find(r =>
        r.type.includes("storage_provider") || r.type.includes("StorageProvider")
      );
      if (spRegistry?.data?.providers) {
        spCount = Array.isArray(spRegistry.data.providers)
          ? spRegistry.data.providers.length
          : spRegistry.data.providers?.vec?.length ?? 0;
      }
    } catch (_) { /* fall through */ }

    // 3. Try to get real blob count from SDK coordination client
    let totalBlobs = 0;
    let totalBytes = 0;
    try {
      const count = await shelbyClient.coordination.getBlobsCount();
      totalBlobs = Number(count ?? 0);
    } catch (_) { /* fall through */ }

    try {
      const size = await shelbyClient.coordination.getTotalBlobsSize();
      totalBytes = Number(size ?? 0);
    } catch (_) { /* fall through */ }

    // Fallback to GraphQL aggregate if SDK returns 0
    if (totalBlobs === 0) {
      totalBlobs = blobsData?.fungible_asset_activities_aggregate?.aggregate?.count ?? 0;
    }

    res.json({
      ok: true,
      data: {
        totalBlobs,
        totalBytes,
        storageCapacityBytes: 10 * 1024 * 1024 * 1024 * 1024, // 10 TiB (from docs)
        spCount: spCount || null, // null = unknown
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
// Returns the most recent blob registrations on-chain
app.get("/api/blobs/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    // Query Aptos testnet indexer for recent Shelby blob registration txns
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
// Returns daily blob registration counts for charting (last 14 days)
app.get("/api/blobs/history", async (req, res) => {
  try {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().split("T")[0]);
    }

    // Query txns grouped by day
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

    // Bucket by day
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
// Returns storage provider nodes from on-chain contract state
app.get("/api/nodes", async (req, res) => {
  try {
    const resources = await aptosClient.getAccountResources({
      accountAddress: SHELBY_CONTRACT,
    });

    // Find storage provider / placement group resources
    const nodeResources = resources.filter(r =>
      r.type.toLowerCase().includes("storage") ||
      r.type.toLowerCase().includes("provider") ||
      r.type.toLowerCase().includes("placement")
    );

    const nodes = [];
    for (const r of nodeResources) {
      const data = r.data;
      // Try to extract provider list
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

// ── /api/contract/resources ───────────────────────────────────
// Raw contract resource dump — useful for debugging
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
  console.log(`   GET /api/contract/resources\n`);
});
