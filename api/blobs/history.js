/**
 * GET /api/blobs/history
 * Recent write activity from a live sample of the latest 100 Shelby
 * transactions (~1 minute at the current ~80 txns/min rate), grouped
 * into 10-second buckets, plus the measured transactions-per-minute
 * rate. A 14-day history cannot be built honestly: the indexer caps
 * list queries at 100 rows and exposes no aggregates, and at the
 * current rate 14 days hold over a million transactions.
 */
import { getRecentTxns, bucketize, measureRate } from "../_lib.js";

export default async function handler(req, res) {
  try {
    const txns = await getRecentTxns(100);
    const buckets = bucketize(txns, 10_000);
    const newest = txns.length ? new Date(txns[0].timestamp).getTime() : null;
    const oldest = txns.length
      ? new Date(txns[txns.length - 1].timestamp).getTime()
      : null;
    res.status(200).json({
      ok: true,
      data: {
        buckets,
        ratePerMin: measureRate(txns),
        sampleSize: txns.length,
        windowSeconds:
          newest !== null && oldest !== null
            ? Math.round((newest - oldest) / 1000)
            : null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
