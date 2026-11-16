/**
 * GET /api/health
 * Liveness probe: pings the shelbynet REST API. The dashboard treats
 * ok:true as "live data pipeline reachable".
 */
import {
  SHELBY_CONTRACT,
  SHELBYNET_REST,
  NETWORK,
} from "./_lib.js";

export default async function handler(req, res) {
  try {
    // Ledger endpoint is a cheap unauthenticated read.
    const r = await fetch(`${SHELBYNET_REST}/`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`REST ${r.status}`);
    const ledger = await r.json();
    res.status(200).json({
      ok: true,
      server: "shelby-hub",
      network: NETWORK,
      rpc: SHELBYNET_REST,
      contract: SHELBY_CONTRACT,
      ledgerVersion: ledger.ledger_version ?? null,
      chainId: ledger.chain_id ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: `shelbynet unreachable: ${err.message}` });
  }
}
