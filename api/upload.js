/**
 * POST /api/upload
 * File upload to Shelby is unavailable on the hosted dashboard: the
 * @shelby/sdk npm package (which provided blob.store with erasure
 * coding) no longer exists on npm, and the old Shelby RPC is
 * unreachable. The frontend shows this as an error instead of a
 * simulated success. (The S3-compatible endpoint at s3.beta.shelby.xyz
 * is the current upload path — it needs per-bucket credentials from
 * console.shelby.xyz and is out of scope for this dashboard.)
 */
export default async function handler(req, res) {
  res.status(501).json({
    ok: false,
    error:
      "Uploads are unavailable on the hosted dashboard — the Shelby SDK is no longer published on npm, so files cannot be stored from here.",
  });
}
