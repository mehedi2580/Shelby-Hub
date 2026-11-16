/**
 * GET /api/network
 * Network snapshot from the Shelby contract's on-chain resources
 * (shelbynet REST). Fields the public API cannot provide are null —
 * the frontend shows "—" for those instead of inventing numbers.
 *
 *   totalBlobs / totalBytes: no public count exists. The indexer has no
 *   aggregates for user_transactions, the contract stores blobs in tables
 *   with no published counter, and the @shelby/sdk package (which exposed
 *   getBlobsCount) no longer exists on npm.
 *   spCount: no storage-provider registry exists on-chain.
 *   auditPassRate: audit transactions are protocol-level and extremely
 *   rare (last seen weeks ago), so no meaningful rate can be computed.
 */
import {
  SHELBY_CONTRACT,
  SHELBYNET_REST,
  NETWORK,
  getResources,
  parseEpochs,
  parseAccountSeq,
} from "./_lib.js";

const STORAGE_CAPACITY_BYTES = 10 * 1024 * 1024 * 1024 * 1024; // 10 TiB reference

export default async function handler(req, res) {
  try {
    const resources = await getResources();
    const epochs = parseEpochs(resources);
    res.status(200).json({
      ok: true,
      data: {
        totalBlobs: null,
        totalBytes: null,
        storageCapacityBytes: STORAGE_CAPACITY_BYTES,
        spCount: null,
        auditPassRate: null,
        network: NETWORK,
        rpcUrl: SHELBYNET_REST,
        contractAddress: SHELBY_CONTRACT,
        auditEpoch: epochs.auditEpoch,
        paymentEpoch: epochs.paymentEpoch,
        stakingEpoch: epochs.stakingEpoch,
        contractSeq: parseAccountSeq(resources),
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
