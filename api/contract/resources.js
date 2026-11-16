/**
 * GET /api/contract/resources
 * Raw resources of the Shelby contract account on shelbynet (REST).
 */
import { SHELBY_CONTRACT, getResources } from "../_lib.js";

export default async function handler(req, res) {
  try {
    const resources = await getResources();
    res.status(200).json({
      ok: true,
      data: { address: SHELBY_CONTRACT, resources },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
