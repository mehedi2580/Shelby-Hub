/**
 * GET /api/nodes
 * Storage-provider node list. The Shelby protocol publishes no provider
 * registry on-chain (no provider list exists in the contract's
 * resources), so no live node list can be built from public data.
 * Returns an empty list with a note; the frontend shows an honest
 * empty state instead of invented nodes.
 */
export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    data: [],
    unavailable:
      "No storage-provider registry is published on-chain, so a live node list cannot be built from public data.",
  });
}
