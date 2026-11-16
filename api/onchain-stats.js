/**
 * GET /api/onchain-stats
 * The four numbers in the tracker's top strip, all live from shelbynet:
 * current transaction rate (measured from the latest 100 txns) and the
 * protocol's audit / payment / staking epochs (contract resources).
 *
 * The old strip metrics (total blob events, placement groups, storage
 * providers, slices) cannot be computed: the indexer exposes no events
 * table and no user_transactions aggregate, and there is no on-chain
 * provider registry.
 */
import {
  getResources,
  getRecentTxns,
  parseEpochs,
  measureRate,
} from "./_lib.js";

export default async function handler(req, res) {
  try {
    const [resources, recent] = await Promise.all([
      getResources(),
      getRecentTxns(100),
    ]);
    const epochs = parseEpochs(resources);
    res.status(200).json({
      ok: true,
      live: true,
      data: {
        txnRatePerMin: measureRate(recent),
        auditEpoch: epochs.auditEpoch,
        paymentEpoch: epochs.paymentEpoch,
        stakingEpoch: epochs.stakingEpoch,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
