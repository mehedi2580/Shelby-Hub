# Shelby Hub 🚀

A community-built protocol dashboard for [Shelby](https://shelby.xyz) — Web3's first cloud-grade hot storage network co-developed by Aptos Labs and Jump Crypto.

> v1.2 — Live data via Vercel Serverless Functions + the shelbynet indexer and REST API. No SDK required. Anything the public API cannot provide is shown as "—" or an honest empty state instead of simulated numbers.

## Features

- **Testnet tracker** — live network snapshot from shelbynet: transaction rate, protocol epochs, activity mix, write-activity chart, and an auto-refreshing live transaction feed
- **Node ROI calculator** — estimate earnings as a Shelby Storage Provider with adjustable sliders, a live APT price feed, and a 12-month projection chart
- **Wallet** — connect an Aptos wallet (or paste an address) to see real on-chain activity against the Shelby contract
- **Learn about Shelby** — protocol overview, key features, architecture explainer, official links
- **About developer** — developer profile, journey timeline, skills, and social links

## Project structure

```
shelby-hub/
├── index.html      # Main HTML — all four pages
├── style.css       # Full stylesheet (light + dark mode)
├── app.js          # All interactivity and chart logic
├── api/            # Vercel Serverless Functions (one file per endpoint)
│   ├── _lib.js     # Shared data layer: shelbynet indexer + REST
│   ├── health.js   # GET /api/health
│   ├── network.js  # GET /api/network
│   ├── onchain-stats.js
│   ├── blobs/recent.js
│   ├── blobs/history.js
│   ├── nodes.js / nodes/[id].js
│   ├── wallet/[address].js
│   ├── contract/resources.js
│   └── upload.js   # 501 — uploads are unavailable (see below)
├── server.js       # Local dev server — reuses the same api/ handlers
├── vercel.json     # Vercel deployment config
├── .vercelignore   # Keeps server.js out of the deployment
└── README.md       # This file
```

## Deploy to GitHub + Vercel

### Step 1 — Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `shelby-hub` (or anything you like)
3. Set it to **Public**
4. Do **not** add a README (you already have one)
5. Click **Create repository**

### Step 2 — Push the files

Open your terminal, navigate to the project folder, then run:

```bash
git init
git add .
git commit -m "Initial commit — Shelby Hub"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/shelby-hub.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### Step 3 — Deploy to Vercel

**Option A — Vercel dashboard (easiest)**

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project**
3. Import your `shelby-hub` repository
4. Leave all settings as default — Vercel auto-detects the static files and the Serverless Functions in `api/`
5. Click **Deploy**

Your site will be live at the domain Vercel assigns (e.g. `https://shelby-hub-black.vercel.app`) in about a minute.

**Option B — Vercel CLI**

```bash
npm i -g vercel
vercel
```

Follow the prompts — it will link to your GitHub repo and deploy automatically.

### Step 4 — Custom domain (optional)

1. In the Vercel dashboard, go to your project → **Settings → Domains**
2. Add your custom domain (e.g. `shelby.yourdomain.com`)
3. Update your DNS records as instructed by Vercel

## Local development

```bash
npm install
npm start
# → http://localhost:3000
```

`server.js` is a thin Express wrapper around the same handlers in `api/`, so local behaviour matches the deployed site. (A plain static server such as `python3 -m http.server` will serve the pages but not `/api/*`, so the tracker will show the API as unavailable.)

Development mode (auto-restarts on file changes):

```bash
npm run dev
```

## Tech stack

- Plain HTML, CSS, JavaScript frontend — no framework, no build step
- **Vercel Serverless Functions** (`api/`) — one file per endpoint, Node 22
- **Shelbynet indexer** (GraphQL) + **Shelbynet REST API** — live chain data, plain `fetch`, no SDK
- **Express.js** — local dev server only (`server.js`)
- [Chart.js](https://www.chartjs.org/) — charts and graphs
- [Tabler Icons](https://tabler.io/icons) — icon set
- [DM Sans](https://fonts.google.com/specimen/DM+Sans) — font
- Vercel — hosting

## Architecture

```
Browser (index.html + app.js)
        ↕ fetch /api/*
Vercel Serverless Functions (api/*.js, shared api/_lib.js)
        ↕ GraphQL + REST
Shelbynet indexer (api.shelbynet.shelby.xyz/v1/graphql)
Shelbynet REST    (api.shelbynet.shelby.xyz/v1)
```

The Shelby contract (`0x85fd…8e6a`) lives on **shelbynet**, Shelby's own Aptos-based chain — not on Aptos testnet. All live data comes from shelbynet.

### What is live, and what is not

Live from public APIs: recent transactions, transaction rate, protocol epochs (audit / payment / staking), contract resources, and per-wallet activity.

Not available from any public API, shown as "—" or an empty state:

- **Total blobs / storage used** — the indexer has no aggregates for transactions, the contract stores blobs in tables with no published counter, and the `@shelby/sdk` package (which exposed these counts) no longer exists on npm.
- **Storage-provider node list** — no provider registry exists on-chain.
- **14-day history** — the indexer caps list queries at 100 rows and the chain does ~80 Shelby transactions per minute, so only a recent sample (~1 minute) can be fetched per call. The chart shows that live sample instead.
- **Latency / audit pass rate** — latency is not measurable from public APIs; audit transactions are protocol-level and extremely rare.

Uploads are unavailable on the hosted dashboard for the same SDK reason (the current upload path is the S3-compatible endpoint at `s3.beta.shelby.xyz`, which needs per-bucket credentials from `console.shelby.xyz`).

## Setup & run

```bash
# 1. Install dependencies
npm install

# 2. (Optional) API key — the shelbynet indexer and REST API work
#    without one. If you have an Aptos API key, set it as an env var
#    (or as a Vercel env var named SHELBY_API_KEY for the deployment).
#    NEVER commit a key to the repo.
export SHELBY_API_KEY=your_aptos_api_key

# 3. Start the server
npm start
# → http://localhost:3000

# Development mode (auto-restarts on file changes)
npm run dev
```

### Security note

An Aptos API key was previously hardcoded in `server.js` and this README and committed to the public repo. If you have not already done so, **rotate that key** (revoke it in your Aptos / Geomi dashboard and issue a new one) — a committed key must be treated as leaked even after it is removed from the code.

## Developer

Built by **Mehedi Hasan**

- GitHub: [github.com/mehedi2580](https://github.com/mehedi2580)
- X / Twitter: [@0xZeroBit](https://x.com/0xZeroBit)
- Telegram: [@Mehedi322](https://t.me/Mehedi322)
- Discord: [discord.gg/MD4gEG8B](https://discord.gg/MD4gEG8B)

---

*This is a community project, not officially affiliated with Shelby, Aptos Labs, or Jump Crypto.*
