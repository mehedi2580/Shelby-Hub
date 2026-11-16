/**
 * GET /api/blobs/recent?limit=100
 * Most recent Shelby-contract transactions from the shelbynet indexer.
 * Limit defaults to 100 (the indexer's per-request cap) and is clamped
 * to 1..100. The dashboard's event feed uses the first few rows and the
 * activity-mix chart counts function names across the whole sample.
 */
import { getRecentTxns } from "../_lib.js";

export default async function handler(req, res) {
  const limit = Math.max(1, Math.min(parseInt(req.query?.limit) || 100, 100));
  try {
    const txns = await getRecentTxns(limit);
    res.status(200).json({ ok: true, data: txns });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
