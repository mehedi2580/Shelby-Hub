// Shelby Hub — local development server.
// Reuses the same handlers as the Vercel Serverless Functions in api/,
// so local behaviour matches the deployed site.
// Run: npm start  →  http://localhost:3000
//
// Live data comes from the shelbynet indexer + REST API (see api/_lib.js).
// No API key is required; set SHELBY_API_KEY in the environment if you
// have one. Never hardcode a key in this repo.

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import health from "./api/health.js";
import network from "./api/network.js";
import onchainStats from "./api/onchain-stats.js";
import blobsRecent from "./api/blobs/recent.js";
import blobsHistory from "./api/blobs/history.js";
import nodes from "./api/nodes.js";
import nodeDetail from "./api/nodes/[id].js";
import wallet from "./api/wallet/[address].js";
import contractResources from "./api/contract/resources.js";
import upload from "./api/upload.js";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: "12mb" }));

// Vercel handlers read dynamic params from req.query; Express keeps them in
// req.params — merge them so one handler serves both runtimes.
const withParams = (handler) => (req, res) => {
  req.query = { ...req.query, ...req.params };
  return handler(req, res);
};

app.get("/api/health", health);
app.get("/api/network", network);
app.get("/api/onchain-stats", onchainStats);
app.get("/api/blobs/recent", blobsRecent);
app.get("/api/blobs/history", blobsHistory);
app.get("/api/nodes", nodes);
app.get("/api/nodes/:id", withParams(nodeDetail));
app.get("/api/wallet/:address", withParams(wallet));
app.get("/api/contract/resources", contractResources);
app.post("/api/upload", upload);

// Static frontend (single-page app)
app.use(express.static(__dirname));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => {
  console.log(`Shelby Hub running at http://localhost:${PORT}`);
});
