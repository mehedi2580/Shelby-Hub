# Shelby Hub 🚀

A community-built protocol dashboard for [Shelby](https://shelby.xyz) — Web3's first cloud-grade hot storage network co-developed by Aptos Labs and Jump Crypto.

## Features

- **Testnet tracker** — live network snapshot, read/write charts, storage growth, node grid, utilisation bars, and auto-refreshing event feed
- **Node ROI calculator** — estimate earnings as a Shelby Storage Provider with adjustable sliders and 12-month projection chart
- **Learn about Shelby** — protocol overview, key features, architecture explainer, official links
- **About developer** — developer profile, journey timeline, skills, and social links

## Project structure

```
shelby-hub/
├── index.html      # Main HTML — all four pages
├── style.css       # Full stylesheet (light + dark mode)
├── app.js          # All interactivity and chart logic
├── vercel.json     # Vercel deployment config
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
4. Leave all settings as default (Vercel auto-detects static sites)
5. Click **Deploy**

Your site will be live at `https://shelby-hub.vercel.app` in about 30 seconds.

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

No build tools needed — this is a plain HTML/CSS/JS project.

```bash
# Option 1: Python (built-in)
python3 -m http.server 3000

# Option 2: Node.js
npx serve .

# Option 3: VS Code
# Install the "Live Server" extension and click "Go Live"
```

Then open [http://localhost:3000](http://localhost:3000)

## Tech stack

- Plain HTML, CSS, JavaScript — no framework, no build step
- [Chart.js](https://www.chartjs.org/) — charts and graphs
- [Tabler Icons](https://tabler.io/icons) — icon set
- [DM Sans](https://fonts.google.com/specimen/DM+Sans) — font
- Vercel — hosting

## Notes

- Testnet data is currently **simulated**. Real-time data will be connected once Shelby opens its public RPC endpoints at `api.testnet.shelby.xyz`
- ROI estimates are illustrative only — not financial advice

## Developer

Built by **Mehedi Hasan**

- GitHub: [github.com/mehedi2580](https://github.com/mehedi2580)
- X / Twitter: [@0xZeroBit](https://x.com/0xZeroBit)
- Telegram: [@Mehedi322](https://t.me/Mehedi322)
- Discord: [discord.gg/MD4gEG8B](https://discord.gg/MD4gEG8B)

---

*This is a community project, not officially affiliated with Shelby, Aptos Labs, or Jump Crypto.*
