/**
 * GET /api/wallet/:address
 * Wallet activity against the Shelby contract from the shelbynet
 * indexer: up to 200 most recent transactions (the indexer's cap is
 * 100 rows per request, so two pages are fetched), a function-name
 * breakdown, and a 14-day daily histogram of the sampled txns.
 * The 10 most recent transactions are enriched with hash / success /
 * gas_used from the REST API. Totals the public API cannot provide
 * are null: gasUsed (summing would need enriching every txn) and
 * totalBytes (per-blob sizes are not in the indexer).
 */
import {
  getTxnsBySender,
  getTxnDetail,
  fnName,
} from "../_lib.js";

const MAX_TXNS = 200;
const ENRICH_TOP = 10;

export default async function handler(req, res) {
  const address = req.query?.address;
  if (!address || typeof address !== "string" || !address.startsWith("0x")) {
    return res.status(400).json({ ok: false, error: "valid 0x address required" });
  }
  try {
    const txns = await getTxnsBySender(address, MAX_TXNS);
    const truncated = txns.length >= MAX_TXNS;

    const registerFns = new Set([
      "register_blob",
      "register_blob_with_sponsor",
      "commit_object",
      "commit_object_v2",
    ]);
    const totalBlobs = txns.filter((t) => registerFns.has(t.fn)).length;

    const txBreakdown = { register_blob: 0, delete_blob: 0, audit_blob: 0, other: 0 };
    for (const t of txns) {
      if (t.fn.includes("register") || t.fn.includes("commit")) txBreakdown.register_blob++;
      else if (t.fn.includes("delete")) txBreakdown.delete_blob++;
      else if (t.fn.includes("audit")) txBreakdown.audit_blob++;
      else txBreakdown.other++;
    }

    // 14-day daily histogram of sampled txns.
    const days = [];
    const byDay = new Map();
    for (const t of txns) {
      const d = new Date(t.timestamp).toISOString().split("T")[0];
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
      days.push({ date: d, blobs: byDay.get(d) ?? 0 });
    }

    // Enrich the most recent txns with hash / success / gas.
    const recentRaw = txns.slice(0, ENRICH_TOP);
    const recentTxns = await Promise.all(
      recentRaw.map(async (t) => {
        try {
          const d = await getTxnDetail(t.version);
          return { ...t, hash: d.hash, success: d.success, gasUsed: d.gasUsed };
        } catch {
          return { ...t, hash: null, success: null, gasUsed: null };
        }
      }),
    );

    res.status(200).json({
      ok: true,
      data: {
        totalTxns: txns.length,
        truncated,
        totalBlobs,
        totalBytes: null,
        // When truncated, the sample's oldest txn is NOT the wallet's
        // first activity — report unknown rather than a wrong date.
        firstSeen: truncated ? null : txns.length ? txns[txns.length - 1].timestamp : null,
        lastActive: txns.length ? txns[0].timestamp : null,
        gasUsed: null,
        txBreakdown,
        history: days,
        recentTxns,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
