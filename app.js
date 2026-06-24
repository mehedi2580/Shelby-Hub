/* ===== SHELBY HUB — app.js ===== */

let drawerOpen = false;
let rwChart, storageChart, nodeChart, roiChart, walletChart, walletTxChart;

// ── API base (same origin when served by server.js) ──────────
const API = "/api";

// ── Wallet state ──────────────────────────────────────────────
let connectedAddress = null;
let walletMode = null; // 'petra' | 'martian' | 'paste'

// ── Navigation ───────────────────────────────────────────────
function toggleDrawer() {
  drawerOpen = !drawerOpen;
  document.getElementById('drawer').classList.toggle('open', drawerOpen);
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  drawerOpen = false;
  document.getElementById('drawer').classList.remove('open');
  if (id === 'calculator') {
    setTimeout(calcROI, 80);
    // Re-fetch APT price if stale (>90s old)
    const age = _aptPricedAt ? (Date.now() - _aptPricedAt) / 1000 : Infinity;
    if (age > 90) fetchAptPrice();
  }
}

// ── Helpers ──────────────────────────────────────────────────
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function secsAgo(n) { return n < 60 ? n + 's ago' : Math.floor(n / 60) + 'm ago'; }
function isDark() { return window.matchMedia('(prefers-color-scheme: dark)').matches; }
function chartColors() {
  return {
    text: isDark() ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    grid: isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  };
}
function fmtBytes(b) {
  if (!b) return '—';
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(1)  + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(1)  + ' MB';
  return b + ' B';
}
function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}
function isValidAptosAddr(addr) {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}

// ── State: real vs simulated ──────────────────────────────────
let isLive = false;

// ── Theme ─────────────────────────────────────────────────────
let _themeOverride = null; // 'dark' | 'light' | null (system)

function initTheme() {
  try { _themeOverride = localStorage.getItem('shelby_theme'); } catch (_) {}
  applyTheme();
}

function applyTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = _themeOverride === 'dark' || (_themeOverride === null && prefersDark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = dark
      ? '<i class="ti ti-sun" aria-hidden="true"></i>'
      : '<i class="ti ti-moon" aria-hidden="true"></i>';
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
}

function toggleTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentlyDark = _themeOverride === 'dark' || (_themeOverride === null && prefersDark);
  _themeOverride = currentlyDark ? 'light' : 'dark';
  try { localStorage.setItem('shelby_theme', _themeOverride); } catch (_) {}
  applyTheme();
  // Redraw charts so colors update
  if (document.getElementById('page-tracker').classList.contains('active')) {
    refreshTracker();
  }
}

// Override isDark() to respect manual override
function isDark() {
  if (_themeOverride) return _themeOverride === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── APT Price ─────────────────────────────────────────────────
let _aptPrice      = null;   // last fetched price (number)
let _aptPricedAt   = null;   // timestamp of last successful fetch
let _aptFetchTimer = null;   // interval handle

// ── Alerts / Watchlist ────────────────────────────────────────
let _alerts = []; // [{ id, metric, operator, threshold, label, triggered, lastNotified }]
let _alertsEnabled = false; // true once Notification permission granted

function loadAlerts() {
  try {
    const saved = localStorage.getItem('shelby_alerts');
    if (saved) _alerts = JSON.parse(saved);
  } catch (_) { _alerts = []; }
}

function saveAlerts() {
  try { localStorage.setItem('shelby_alerts', JSON.stringify(_alerts)); } catch (_) {}
}

function alertId() { return 'al_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

async function tryFetch(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return r.json();
  } catch (_) {
    return null;
  }
}

// ── Status badge helper ───────────────────────────────────────
function setLiveBadge(live) {
  isLive = live;
  const dot = document.querySelector('.live-dot');
  const badge = document.querySelector('#tracker-badge');
  if (dot) dot.style.background = live ? '#1D9E75' : '#BA7517';
  if (badge) {
    badge.textContent = live ? 'Live' : 'Simulated';
    badge.className = live ? 'badge' : 'badge badge-warn';
  }
}

// ── Fallback node data ────────────────────────────────────────
const FALLBACK_NODES = [
  { name: 'SP-Alpha-01',   region: 'US-East',    lat: 38, status: 'online'  },
  { name: 'SP-Beta-07',    region: 'EU-West',    lat: 22, status: 'online'  },
  { name: 'SP-Gamma-03',   region: 'AP-South',   lat: 41, status: 'online'  },
  { name: 'SP-Delta-12',   region: 'US-West',    lat: 29, status: 'online'  },
  { name: 'SP-Epsilon-05', region: 'EU-North',   lat: 18, status: 'syncing' },
  { name: 'SP-Zeta-09',    region: 'AP-East',    lat: 55, status: 'online'  },
  { name: 'SP-Eta-02',     region: 'SA-East',    lat: 67, status: 'online'  },
  { name: 'SP-Theta-11',   region: 'US-Central', lat: 33, status: 'offline' },
];

const SHELBYNET_NODES = Array.from({ length: 16 }, (_, i) => ({
  name: `SP-Node-${String(i + 1).padStart(2, '0')}`,
  region: ['US-East','EU-West','AP-South','US-West','EU-North','AP-East','SA-East','US-Central',
           'US-East','EU-West','AP-South','US-West','EU-North','AP-East','SA-East','US-Central'][i],
  lat: [38,22,41,29,18,55,67,33,40,25,38,32,20,58,70,35][i],
  status: i < 14 ? 'online' : (i === 14 ? 'syncing' : 'offline'),
}));

const EVENTS = [
  ['ti-upload',          'Blob write confirmed',   'on-chain'],
  ['ti-download',        'Parallel read served',   'RPC node'],
  ['ti-shield-check',    'Audit challenge passed', 'smart contract'],
  ['ti-coin',            'Micropayment settled',   'RPC node'],
  ['ti-arrows-exchange', 'Erasure chunk rebuilt',  'SP node'],
  ['ti-network',         'New placement group',    'smart contract'],
  ['ti-lock',            'Access token verified',  'RPC node'],
  ['ti-database',        'Merkle root committed',  'smart contract'],
];

// ── Render metrics ────────────────────────────────────────────
function renderMetrics(networkData, nodeData) {
  const online = (nodeData || FALLBACK_NODES).filter(n => n.status === 'online').length;
  const total  = (nodeData || FALLBACK_NODES).length;

  const totalBytes  = networkData?.totalBytes  || 0;
  const totalBlobs  = networkData?.totalBlobs  || 0;
  const capBytes    = networkData?.storageCapacityBytes || 10 * 1024 ** 4;
  const usedPct     = totalBytes ? ((totalBytes / capBytes) * 100).toFixed(1) : null;

  const items = [
    { label: 'Storage used', val: totalBytes ? fmtBytes(totalBytes) : rnd(380, 430) / 10 + ' TB', sub: usedPct ? usedPct + '% of 10 TiB' : '~10 TiB capacity', live: !!totalBytes },
    { label: 'Active nodes', val: online + ' / ' + total, sub: 'shelbynet: 16 SPs', live: !!nodeData },
    { label: 'Blobs stored', val: totalBlobs ? totalBlobs.toLocaleString() : rnd(2100, 2800).toLocaleString(), sub: totalBlobs ? 'on-chain count' : 'estimated', live: !!totalBlobs },
    { label: 'Network', val: networkData?.network || 'TESTNET', sub: 'Early access', live: !!networkData },
    { label: 'Avg latency', val: rnd(68, 130) + ' ms', sub: 'sub-second', live: false },
    { label: 'Audit pass rate', val: rnd(94, 99) + '%', sub: 'simulated', live: false },
    { label: 'Contract', val: networkData ? shortAddr(networkData.contractAddress) : '0x85fd…8e6a', sub: 'Aptos testnet', live: !!networkData },
    { label: 'RPC', val: networkData?.rpcUrl ? 'Connected' : 'testnet', sub: 'api.testnet.shelby.xyz', live: !!networkData?.rpcUrl },
  ];

  document.getElementById('metrics').innerHTML = items.map(c => `
    <div class="metric" title="${c.live ? '✅ Live on-chain data' : '⚠️ Simulated data'}">
      <div class="metric-label">${c.label} ${c.live ? '<span style="color:var(--green);font-size:9px">●LIVE</span>' : ''}</div>
      <div class="metric-val">${c.val}</div>
      <div class="metric-sub">${c.sub}</div>
    </div>`).join('');
}

// ── Render charts ─────────────────────────────────────────────
function renderCharts(historyData) {
  const { text: tc, grid: gc } = chartColors();

  let slabels, svals;
  if (historyData && historyData.length > 0) {
    slabels = historyData.map(d => {
      const dt = new Date(d.date);
      return (dt.getMonth() + 1) + '/' + dt.getDate();
    });
    let cum = 0;
    svals = historyData.map(d => { cum += d.blobs; return cum; });
  } else {
    slabels = []; svals = [];
    let base = 32;
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      slabels.push((d.getMonth() + 1) + '/' + d.getDate());
      base += rnd(1, 5);
      svals.push(+base.toFixed(1));
    }
  }

  const rwLabels = [], reads = [], writes = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date(Date.now() - i * 3600000);
    rwLabels.push(h.getHours().toString().padStart(2, '0') + ':00');
    reads.push(rnd(400, 900));
    writes.push(rnd(80, 280));
  }

  if (rwChart) rwChart.destroy();
  rwChart = new Chart(document.getElementById('rwChart'), {
    type: 'line',
    data: {
      labels: rwLabels,
      datasets: [
        { label: 'Reads',  data: reads,  borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.07)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true },
        { label: 'Writes', data: writes, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.07)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true, borderDash: [4, 3] },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc } },
      }
    }
  });

  if (storageChart) storageChart.destroy();
  const isRealStorage = historyData && historyData.length > 0;
  storageChart = new Chart(document.getElementById('storageChart'), {
    type: 'line',
    data: {
      labels: slabels,
      datasets: [{
        label: isRealStorage ? 'Blobs (cumulative)' : 'TB used',
        data:  svals,
        borderColor: '#7F77DD', backgroundColor: 'rgba(127,119,221,0.1)',
        borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: isRealStorage
          ? { display: true, text: '● Live', color: '#1D9E75', font: { size: 10 }, padding: { bottom: 4 } }
          : { display: false }
      },
      scales: {
        x: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 }, callback: v => isRealStorage ? v + ' blobs' : v + ' TB' }, grid: { color: gc } },
      }
    }
  });

  const nodes = SHELBYNET_NODES;
  const on = nodes.filter(n => n.status === 'online').length;
  const sy = nodes.filter(n => n.status === 'syncing').length;
  const of = nodes.filter(n => n.status === 'offline').length;
  if (nodeChart) nodeChart.destroy();
  nodeChart = new Chart(document.getElementById('nodeChart'), {
    type: 'doughnut',
    data: {
      labels: ['Online', 'Syncing', 'Offline'],
      datasets: [{ data: [on, sy, of], backgroundColor: ['#1D9E75', '#BA7517', '#A32D2D'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }
  });
  document.getElementById('nodeLegend').innerHTML = [
    { c: '#1D9E75', l: 'Online',  n: on },
    { c: '#BA7517', l: 'Syncing', n: sy },
    { c: '#A32D2D', l: 'Offline', n: of },
  ].map(x => `<span><span class="legend-sq-box" style="background:${x.c};display:inline-block"></span>${x.l} ${x.n}</span>`).join('');
}

// ── Render nodes ──────────────────────────────────────────────
let _currentNodes = [];

function renderNodes(liveNodes) {
  const nodes = liveNodes && liveNodes.length > 0 ? liveNodes : SHELBYNET_NODES;
  _currentNodes = nodes;
  document.getElementById('nodeGrid').innerHTML = nodes.map((n, i) => {
    const cls = n.status === 'online' ? 'on' : n.status === 'syncing' ? 'syn' : 'off';
    const addrLabel = n.address && n.address.startsWith('0x') ? shortAddr(n.address) : n.name || n.address;
    return `<div class="node-card node-card-clickable" onclick="openNodeModal(${i})" tabindex="0"
                 onkeydown="if(event.key==='Enter'||event.key===' ')openNodeModal(${i})"
                 role="button" aria-label="View details for ${addrLabel}">
      <div class="node-name"><span class="dot dot-${cls}" aria-hidden="true"></span>${addrLabel}</div>
      <div class="node-meta">${n.region} · ${n.lat || '—'}ms avg</div>
      <div class="node-meta">${n.stake ? n.stake.toLocaleString() + ' staked' : rnd(800, 2400).toLocaleString() + ' chunks'}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px">
        <span class="pill pill-${cls}">${n.status}</span>
        <span style="font-size:11px;color:var(--text-tertiary)"><i class="ti ti-chevron-right" style="font-size:13px" aria-hidden="true"></i></span>
      </div>
    </div>`;
  }).join('');
}

// ── Render util bars ──────────────────────────────────────────
function renderUtil() {
  const bars = [
    { l: 'Fiber network',  p: rnd(55, 82) },
    { l: 'Chunk capacity', p: rnd(38, 65) },
    { l: 'Audit load',     p: rnd(20, 45) },
    { l: 'RPC throughput', p: rnd(48, 75) },
  ];
  document.getElementById('utilBars').innerHTML = bars.map(b => `
    <div class="bar-row">
      <span class="bar-label">${b.l}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${b.p}%;background:${b.p > 70 ? '#BA7517' : '#378ADD'}"></div></div>
      <span class="bar-val">${b.p}%</span>
    </div>`).join('');
}

// ── Render live event feed ────────────────────────────────────
function renderFeed(recentTxns) {
  let rows;
  if (recentTxns && recentTxns.length > 0) {
    rows = recentTxns.slice(0, 6).map(t => {
      const ago = Math.round((Date.now() - new Date(t.timestamp).getTime()) / 1000);
      const icon = t.fn?.includes('register') ? 'ti-upload'
                 : t.fn?.includes('delete')   ? 'ti-trash'
                 : t.fn?.includes('audit')    ? 'ti-shield-check'
                 : 'ti-database';
      return `<div class="feed-row">
        <i class="ti ${icon} feed-icon" aria-hidden="true"></i>
        <span class="feed-text">${t.fn || 'transaction'} <span class="feed-node">${shortAddr(t.sender)}</span></span>
        <span class="feed-time">${secsAgo(Math.max(ago, 1))}</span>
      </div>`;
    }).join('');
  } else {
    const shuffled = [...EVENTS].sort(() => Math.random() - 0.5).slice(0, 5);
    rows = shuffled.map((e, i) => `
      <div class="feed-row">
        <i class="ti ${e[0]} feed-icon" aria-hidden="true"></i>
        <span class="feed-text">${e[1]} <span class="feed-node">${e[2]}</span></span>
        <span class="feed-time">${secsAgo(rnd(i * 9 + 2, i * 9 + 40))}</span>
      </div>`).join('');
  }
  document.getElementById('eventFeed').innerHTML =
    `<p class="section-hd" style="margin-bottom:8px">
       ${recentTxns?.length ? '● Live transactions' : 'Live events'}
     </p>` + rows;
}

// ── Main refresh ──────────────────────────────────────────────
async function refreshTracker() {
  const health = await tryFetch(`${API}/health`);
  const serverUp = !!health?.ok;
  setLiveBadge(serverUp);

  // Fetch on-chain stats in parallel (independent — own error boundary)
  fetchOnchainStats();

  let networkData = null, historyData = null, nodeData = null, recentTxns = null;

  if (serverUp) {
    [networkData, historyData, nodeData, recentTxns] = await Promise.all([
      tryFetch(`${API}/network`).then(r => r?.data),
      tryFetch(`${API}/blobs/history`).then(r => r?.data),
      tryFetch(`${API}/nodes`).then(r => r?.data),
      tryFetch(`${API}/blobs/recent`).then(r => r?.data),
    ]);
  }

  renderMetrics(networkData, nodeData);
  renderCharts(historyData);
  renderNodes(nodeData);
  renderUtil();
  renderFeed(recentTxns);

  // Check alert thresholds after every refresh
  const onlineCount = (nodeData || FALLBACK_NODES).filter(n => n.status === 'online').length;
  const totalBlobsNow = networkData?.totalBlobs || 0;
  checkAlerts({ onlineNodes: onlineCount, totalBlobs: totalBlobsNow });

  const note = document.getElementById('tracker-note');
  if (note) {
    note.textContent = serverUp
      ? `✅ Live data from api.testnet.shelby.xyz — last updated ${new Date().toLocaleTimeString()}`
      : `⚠️ Server offline — showing simulated data. Run: npm start`;
  }
}

// ── ROI Calculator ────────────────────────────────────────────
function calcROI() {
  const tb    = +document.getElementById('storage-tb').value;
  const bw    = +document.getElementById('bandwidth').value;
  const stake = +document.getElementById('stake').value;
  const apt   = +document.getElementById('apt-price').value;
  const util  = +document.getElementById('util-rate').value / 100;
  const hw    = +document.getElementById('hw-cost').value;

  document.getElementById('storage-tb-out').textContent = tb + ' TB';
  document.getElementById('bandwidth-out').textContent  = bw + ' Gbps';
  document.getElementById('stake-out').textContent      = stake.toLocaleString() + ' APT';
  document.getElementById('apt-price-out').textContent  = '$' + apt;
  document.getElementById('util-rate-out').textContent  = Math.round(util * 100) + '%';
  document.getElementById('hw-cost-out').textContent    = '$' + hw;

  const monthly  = Math.round(tb * 4.2 * util + bw * 12 * util * 0.3 + (stake * apt * 0.08 / 12));
  const profit   = monthly - hw;
  const annual   = monthly * 12;
  const stakeUSD = stake * apt;
  const apy      = stakeUSD > 0 ? ((annual / stakeUSD) * 100).toFixed(1) : 0;
  const breakeven = profit > 0 ? Math.ceil(hw / profit) : 'N/A';

  document.getElementById('r-monthly').textContent   = '$' + monthly.toLocaleString();
  document.getElementById('r-profit').textContent    = (profit >= 0 ? '$' : '-$') + Math.abs(profit).toLocaleString();
  document.getElementById('r-profit').style.color    = profit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('r-annual').textContent    = '$' + annual.toLocaleString();
  document.getElementById('r-apy').textContent       = apy + '%';
  document.getElementById('r-breakeven').textContent = typeof breakeven === 'number' ? breakeven + ' mo' : breakeven;

  const { text: tc, grid: gc } = chartColors();
  const months     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cumulative = months.map((_, i) => Math.max(0, profit * (i + 1)));

  if (roiChart) roiChart.destroy();
  roiChart = new Chart(document.getElementById('roiChart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Cumulative profit',
        data: cumulative,
        backgroundColor: cumulative.map(v => v >= 0 ? 'rgba(29,158,117,0.7)' : 'rgba(163,45,45,0.7)'),
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 }, callback: v => '$' + v.toLocaleString() }, grid: { color: gc } },
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════
// WALLET FEATURE
// ════════════════════════════════════════════════════════════════

// ── Validate paste input ──────────────────────────────────────
function validateWalletInput() {
  const val = document.getElementById('walletAddressInput').value.trim();
  document.getElementById('walletSubmitBtn').disabled = !isValidAptosAddr(val);
}

// ── Detect which wallet providers are available ──────────────
function detectWallets() {
  // Petra injects as window.aptos (AIP-62 standard)
  // Some older Petra versions also set window.petra as an alias
  const hasPetra   = !!(window.aptos || window.petra);
  const hasMartian = !!window.martian;
  return { hasPetra, hasMartian };
}

// ── Run on load: show Detected badges, swap buttons ──────────
function initWalletDetection() {
  // Extension wallets inject asynchronously — wait a tick
  setTimeout(() => {
    const { hasPetra, hasMartian } = detectWallets();

    // Petra
    const petraBadge   = document.getElementById('petraDetectedBadge');
    const petraInstall = document.getElementById('petraInstallLink');
    const petraBtn     = document.getElementById('petraConnectBtn');
    if (petraBadge)   petraBadge.style.display   = hasPetra ? 'inline' : 'none';
    if (petraInstall) petraInstall.style.display  = hasPetra ? 'none'   : 'flex';
    if (petraBtn)     petraBtn.style.display      = hasPetra ? 'flex'   : 'none';

    // Martian
    const martianBadge   = document.getElementById('martianDetectedBadge');
    const martianInstall = document.getElementById('martianInstallLink');
    const martianBtn     = document.getElementById('martianConnectBtn');
    if (martianBadge)   martianBadge.style.display   = hasMartian ? 'inline' : 'none';
    if (martianInstall) martianInstall.style.display  = hasMartian ? 'none'   : 'flex';
    if (martianBtn)     martianBtn.style.display      = hasMartian ? 'flex'   : 'none';
  }, 200); // 200ms lets extensions inject before we check
}

// ── Get the Petra provider object ────────────────────────────
function getPetraProvider() {
  // Prefer window.aptos (current standard); fall back to window.petra (legacy)
  return window.aptos || window.petra || null;
}

// ── Connect via Petra wallet extension ───────────────────────
async function connectPetra() {
  const provider = getPetraProvider();
  if (!provider) {
    alert(
      'Petra wallet extension not found.\n\n' +
      '1. Install Petra from petra.app\n' +
      '2. Create or unlock your wallet\n' +
      '3. Refresh this page and try again.'
    );
    return;
  }
  const card = document.getElementById('petraCard');
  try {
    card.style.opacity = '0.6';
    // Standard AIP-62 call: returns { address, publicKey }
    const response = await provider.connect();
    // Petra may return address as a string or as an AccountAddress object
    const address = typeof response?.address === 'string'
      ? response.address
      : response?.address?.toString?.() ?? response?.publicKey ?? null;
    if (!address) throw new Error('No address returned from Petra');
    walletMode = 'petra';
    await setConnectedWallet(address);
  } catch (err) {
    // User rejected or extension error
    const msg = err?.message || String(err);
    if (!msg.toLowerCase().includes('reject') && !msg.toLowerCase().includes('cancel')) {
      alert('Could not connect Petra: ' + msg);
    }
    card.style.opacity = '1';
  }
}

// ── Connect via Martian wallet extension ─────────────────────
async function connectMartian() {
  if (!window.martian) {
    alert(
      'Martian wallet extension not found.\n\n' +
      '1. Install Martian from martianwallet.xyz\n' +
      '2. Create or unlock your wallet\n' +
      '3. Refresh this page and try again.'
    );
    return;
  }
  const card = document.getElementById('martianCard');
  try {
    card.style.opacity = '0.6';
    // Martian uses window.martian and returns { address, publicKey }
    const response = await window.martian.connect();
    const address = typeof response?.address === 'string'
      ? response.address
      : response?.address?.toString?.() ?? null;
    if (!address) throw new Error('No address returned from Martian');
    walletMode = 'martian';
    await setConnectedWallet(address);
  } catch (err) {
    const msg = err?.message || String(err);
    if (!msg.toLowerCase().includes('reject') && !msg.toLowerCase().includes('cancel')) {
      alert('Could not connect Martian: ' + msg);
    }
    card.style.opacity = '1';
  }
}

// ── Submit pasted address ─────────────────────────────────────
async function submitPastedAddress() {
  const addr = document.getElementById('walletAddressInput').value.trim();
  if (!isValidAptosAddr(addr)) return;
  walletMode = 'paste';
  await setConnectedWallet(addr);
}

// ── Set the connected wallet and load its data ────────────────
async function setConnectedWallet(address) {
  connectedAddress = address;

  // Persist to sessionStorage so refresh keeps it
  try { sessionStorage.setItem('shelby_wallet', address); } catch (_) {}

  // Update navbar pill
  const btn = document.getElementById('walletNavBtn');
  const addrEl = document.getElementById('walletNavAddr');
  if (btn && addrEl) {
    addrEl.textContent = shortAddr(address);
    btn.style.display = 'flex';
  }

  // Switch to wallet page
  showPage('wallet', document.getElementById('walletNavItem'));
  loadWalletPage();
}

// ── Disconnect ────────────────────────────────────────────────
async function disconnectWallet() {
  if (walletMode === 'petra') {
    const provider = getPetraProvider();
    if (provider?.disconnect) {
      try { await provider.disconnect(); } catch (_) {}
    }
  }
  if (walletMode === 'martian' && window.martian?.disconnect) {
    try { await window.martian.disconnect(); } catch (_) {}
  }
  connectedAddress = null;
  walletMode = null;
  try { sessionStorage.removeItem('shelby_wallet'); } catch (_) {}

  // Hide navbar pill
  const btn = document.getElementById('walletNavBtn');
  if (btn) btn.style.display = 'none';

  // Reset connect panel
  document.getElementById('walletAddressInput').value = '';
  document.getElementById('walletSubmitBtn').disabled = true;
  document.getElementById('petraCard').style.opacity = '1';
  document.getElementById('martianCard').style.opacity = '1';

  // Reset wallet page UI
  showWalletConnect();
  updateWalletBadge('Not connected', '');
}

// ── Called whenever the wallet page is shown ──────────────────
function loadWalletPage() {
  if (!connectedAddress) {
    showWalletConnect();
    return;
  }
  showWalletDashboard();
  loadWalletData();
}

// ── UI helpers ────────────────────────────────────────────────
function showWalletConnect() {
  document.getElementById('wallet-connect-panel').style.display = '';
  document.getElementById('wallet-dashboard').style.display = 'none';
  document.getElementById('walletRefreshBtn').style.display = 'none';
  document.getElementById('walletDisconnectBtn').style.display = 'none';
  updateWalletBadge('Not connected', '');
}

function showWalletDashboard() {
  document.getElementById('wallet-connect-panel').style.display = 'none';
  document.getElementById('wallet-dashboard').style.display = '';
  document.getElementById('walletRefreshBtn').style.display = 'flex';
  document.getElementById('walletDisconnectBtn').style.display = 'flex';

  const modeLabel = walletMode === 'paste' ? 'Read-only' : walletMode === 'petra' ? 'Petra' : 'Martian';
  updateWalletBadge('Connected · ' + modeLabel, 'badge-blue');

  // Populate address bar
  document.getElementById('walletFullAddr').textContent = connectedAddress;
  document.getElementById('walletExplorerLink').href =
    `https://explorer.aptoslabs.com/account/${connectedAddress}?network=testnet`;

  // Avatar — first + last char of address
  const av = document.getElementById('walletAvatar');
  if (av) {
    const letters = connectedAddress.slice(2, 4).toUpperCase();
    av.textContent = letters;
  }
}

function updateWalletBadge(text, cls) {
  const b = document.getElementById('wallet-status-badge');
  if (!b) return;
  b.textContent = text;
  b.className = 'badge ' + (cls || 'badge-warn');
}

function copyWalletAddr() {
  if (!connectedAddress) return;
  navigator.clipboard.writeText(connectedAddress).then(() => {
    const btn = document.querySelector('[onclick="copyWalletAddr()"]');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }
  });
}

// ── Load wallet data from API or fallback ─────────────────────
async function loadWalletData() {
  if (!connectedAddress) return;

  // Show loading
  document.getElementById('wallet-loading').style.display = '';
  document.getElementById('wallet-stats').style.display = 'none';
  document.getElementById('wallet-empty').style.display = 'none';
  document.getElementById('wallet-error').style.display = 'none';

  let data = null;
  let live = false;

  const health = await tryFetch(`${API}/health`);
  if (health?.ok) {
    const result = await tryFetch(`${API}/wallet/${connectedAddress}`);
    if (result?.ok) {
      data = result.data;
      live = true;
    }
  }

  // Hide loading
  document.getElementById('wallet-loading').style.display = 'none';

  if (live && data) {
    if ((data.totalTxns || 0) === 0) {
      document.getElementById('wallet-empty').style.display = '';
      return;
    }
    renderWalletStats(data, true);
  } else {
    // Server offline — show simulated data with a warning
    document.getElementById('wallet-error').style.display = '';
    document.getElementById('wallet-error-msg').textContent =
      'Server offline — showing simulated data. Run: npm start';
    renderWalletStats(generateSimulatedWalletData(), false);
  }
}

// ── Simulated wallet data for offline fallback ────────────────
function generateSimulatedWalletData() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({ date: d.toISOString().split('T')[0], blobs: rnd(0, 8) });
  }
  return {
    totalTxns:    rnd(12, 80),
    totalBlobs:   rnd(5, 40),
    totalBytes:   rnd(1, 900) * 1e6,
    firstSeen:    new Date(Date.now() - rnd(10, 90) * 86400000).toISOString(),
    lastActive:   new Date(Date.now() - rnd(0, 3) * 3600000).toISOString(),
    gasUsed:      rnd(5000, 80000),
    txBreakdown:  { register_blob: rnd(5, 35), delete_blob: rnd(0, 5), audit_blob: rnd(0, 10), other: rnd(0, 8) },
    history:      days,
    recentTxns:   Array.from({ length: 6 }, (_, i) => ({
      hash:      '0x' + Array.from({length:8}, () => Math.floor(Math.random()*16).toString(16)).join('') + '…',
      fn:        ['register_blob','register_blob','audit_blob','delete_blob','register_blob','register_blob'][i],
      timestamp: new Date(Date.now() - rnd(i * 3600, (i + 1) * 3600) * 1000).toISOString(),
      success:   Math.random() > 0.05,
      gasUsed:   rnd(200, 1200),
    })),
  };
}

// ── Render wallet stats ───────────────────────────────────────
function renderWalletStats(data, live) {
  document.getElementById('wallet-stats').style.display = '';

  // Metrics
  const firstDate = data.firstSeen ? new Date(data.firstSeen).toLocaleDateString() : '—';
  const lastDate  = data.lastActive ? new Date(data.lastActive).toLocaleString() : '—';

  const metrics = [
    { label: 'Total transactions', val: (data.totalTxns || 0).toLocaleString(), sub: 'on Shelby contract', live },
    { label: 'Blobs registered',   val: (data.totalBlobs || 0).toLocaleString(), sub: 'cumulative', live },
    { label: 'Data stored',        val: fmtBytes(data.totalBytes || 0), sub: 'estimated', live },
    { label: 'Gas used',           val: (data.gasUsed || 0).toLocaleString(), sub: 'octas', live },
    { label: 'First seen',         val: firstDate, sub: 'on testnet', live },
    { label: 'Last active',        val: lastDate, sub: 'most recent tx', live },
  ];

  document.getElementById('walletMetrics').innerHTML = metrics.map(m => `
    <div class="metric" title="${m.live ? '✅ Live on-chain data' : '⚠️ Simulated data'}">
      <div class="metric-label">${m.label} ${m.live ? '<span style="color:var(--green);font-size:9px">●LIVE</span>' : ''}</div>
      <div class="metric-val">${m.val}</div>
      <div class="metric-sub">${m.sub}</div>
    </div>`).join('');

  // Activity bar chart
  const { text: tc, grid: gc } = chartColors();
  const histLabels = (data.history || []).map(d => {
    const dt = new Date(d.date);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  });
  const histVals = (data.history || []).map(d => d.blobs);

  if (walletChart) walletChart.destroy();
  walletChart = new Chart(document.getElementById('walletChart'), {
    type: 'bar',
    data: {
      labels: histLabels,
      datasets: [{
        label: 'Blobs registered',
        data: histVals,
        backgroundColor: 'rgba(55,138,221,0.6)',
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc }, beginAtZero: true },
      }
    }
  });

  // Tx type donut
  const breakdown = data.txBreakdown || {};
  const txTypes = [
    { label: 'Register blob', val: breakdown.register_blob || 0, color: '#1D9E75' },
    { label: 'Audit',         val: breakdown.audit_blob   || 0, color: '#378ADD' },
    { label: 'Delete',        val: breakdown.delete_blob  || 0, color: '#A32D2D' },
    { label: 'Other',         val: breakdown.other        || 0, color: '#BA7517' },
  ].filter(t => t.val > 0);

  if (walletTxChart) walletTxChart.destroy();
  walletTxChart = new Chart(document.getElementById('walletTxChart'), {
    type: 'doughnut',
    data: {
      labels: txTypes.map(t => t.label),
      datasets: [{ data: txTypes.map(t => t.val), backgroundColor: txTypes.map(t => t.color), borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
  });
  document.getElementById('walletTxLegend').innerHTML = txTypes
    .map(t => `<span><span class="legend-sq-box" style="background:${t.color};display:inline-block"></span>${t.label} ${t.val}</span>`)
    .join('');

  // Recent transactions
  const txns = data.recentTxns || [];
  const fnIcon = fn => fn?.includes('register') ? 'ti-upload' : fn?.includes('delete') ? 'ti-trash' : fn?.includes('audit') ? 'ti-shield-check' : 'ti-database';
  document.getElementById('walletTxFeed').innerHTML = txns.length === 0
    ? '<p style="font-size:13px;color:var(--text-secondary);text-align:center;padding:16px 0">No recent transactions</p>'
    : txns.map(t => {
        const ago = Math.round((Date.now() - new Date(t.timestamp).getTime()) / 1000);
        const hashShort = t.hash ? t.hash.slice(0, 10) + '…' + t.hash.slice(-4) : '—';
        const explorerUrl = `https://explorer.aptoslabs.com/txn/${t.hash}?network=testnet`;
        return `<div class="feed-row">
          <i class="ti ${fnIcon(t.fn)} feed-icon" aria-hidden="true"></i>
          <span class="feed-text">
            <a href="${explorerUrl}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">${hashShort}</a>
            — ${t.fn || 'tx'}
            <span class="feed-node" style="margin-left:4px">gas: ${(t.gasUsed || 0).toLocaleString()}</span>
          </span>
          <span class="feed-time" style="display:flex;align-items:center;gap:4px">
            ${t.success ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--red)">✗</span>'}
            ${secsAgo(Math.max(ago, 1))}
          </span>
        </div>`;
      }).join('');

  // Note
  const noteEl = document.getElementById('wallet-note-text');
  if (noteEl) {
    noteEl.textContent = live
      ? `✅ Live data from Aptos testnet indexer — last updated ${new Date().toLocaleTimeString()}`
      : `⚠️ Server offline — simulated data shown`;
  }
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadAlerts();
  initWalletDetection();

  const footnote = document.querySelector('#page-tracker .footnote');
  if (footnote) footnote.id = 'tracker-note';

  const badge = document.querySelector('#page-tracker .badge');
  if (badge) badge.id = 'tracker-badge';

  // Restore wallet from session
  try {
    const saved = sessionStorage.getItem('shelby_wallet');
    if (saved && isValidAptosAddr(saved)) {
      connectedAddress = saved;
      walletMode = 'paste';
      const btn = document.getElementById('walletNavBtn');
      const addrEl = document.getElementById('walletNavAddr');
      if (btn && addrEl) { addrEl.textContent = shortAddr(saved); btn.style.display = 'flex'; }
    }
  } catch (_) {}

  fetchAptPrice();
  // Refresh APT price every 60 seconds
  _aptFetchTimer = setInterval(fetchAptPrice, 60_000);

  refreshTracker();

  setInterval(() => {
    if (document.getElementById('page-tracker').classList.contains('active')) {
      refreshTracker();
    }
  }, 10000);
});

// ════════════════════════════════════════════════════════════════
// NODE DETAIL MODAL
// ════════════════════════════════════════════════════════════════

let nodeLatencyChart, nodeUptimeChart, nodeChunksChart;

// ── Open modal for node at index i ───────────────────────────
async function openNodeModal(i) {
  const node = _currentNodes[i];
  if (!node) return;

  const cls  = node.status === 'online' ? 'on' : node.status === 'syncing' ? 'syn' : 'off';
  const name = node.address && node.address.startsWith('0x')
    ? shortAddr(node.address)
    : node.name || node.address || `Node ${i + 1}`;
  const fullId = node.address || node.name || name;

  // Header
  document.getElementById('nodeModalTitle').textContent = name;
  document.getElementById('nodeModalSub').textContent   = `${node.region || 'Unknown region'} · ${node.status}`;
  const dot = document.getElementById('nodeModalDot');
  dot.className = `dot dot-${cls}`;
  dot.style.cssText = 'width:9px;height:9px;flex-shrink:0';

  // Show modal, show loading
  document.getElementById('node-modal-backdrop').style.display = 'flex';
  document.getElementById('nodeModalLoading').style.display    = '';
  document.getElementById('nodeModalContent').style.display    = 'none';
  document.body.style.overflow = 'hidden';

  // Fetch live data or fall back to simulated
  let data = null;
  let live = false;
  const health = await tryFetch(`${API}/health`);
  if (health?.ok) {
    const result = await tryFetch(`${API}/nodes/${encodeURIComponent(fullId)}`);
    if (result?.ok) { data = result.data; live = true; }
  }
  if (!data) data = generateSimulatedNodeData(node);

  // Render
  document.getElementById('nodeModalLoading').style.display = 'none';
  document.getElementById('nodeModalContent').style.display = '';
  renderNodeModal(data, node, live);
}

// ── Close modal ───────────────────────────────────────────────
function closeNodeModal(event) {
  if (event && event.target !== document.getElementById('node-modal-backdrop')) return;
  document.getElementById('node-modal-backdrop').style.display = 'none';
  document.body.style.overflow = '';
  if (nodeLatencyChart) { nodeLatencyChart.destroy(); nodeLatencyChart = null; }
  if (nodeUptimeChart)  { nodeUptimeChart.destroy();  nodeUptimeChart  = null; }
  if (nodeChunksChart)  { nodeChunksChart.destroy();  nodeChunksChart  = null; }
}

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeNodeModal({ target: document.getElementById('node-modal-backdrop') });
});

// ── Simulated node detail data ────────────────────────────────
function generateSimulatedNodeData(node) {
  const baseLatency = node.lat || rnd(20, 80);
  const isOffline   = node.status === 'offline';
  const isSyncing   = node.status === 'syncing';

  // 24h latency (hourly)
  const latencyHistory = Array.from({ length: 24 }, (_, i) => {
    if (isOffline && i < 6) return null;
    return Math.max(5, baseLatency + rnd(-15, 20) + (isSyncing ? rnd(0, 30) : 0));
  });

  // 30d uptime (daily %)
  const uptimeHistory = Array.from({ length: 30 }, (_, i) => {
    if (isOffline && i > 26) return rnd(0, 40);
    if (isSyncing) return rnd(75, 95);
    return rnd(96, 100);
  });

  // 14d chunk count
  let baseChunks = rnd(800, 2400);
  const chunkHistory = Array.from({ length: 14 }, () => {
    baseChunks += rnd(-20, 60);
    return Math.max(0, baseChunks);
  });

  // Audit results (last 10)
  const auditResults = Array.from({ length: 10 }, (_, i) => {
    const passed = isOffline ? (i > 3) : (Math.random() > (isSyncing ? 0.15 : 0.03));
    const ago    = (i + 1) * rnd(18, 35) * 60;
    return {
      passed,
      challengeId: '0x' + Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      timestamp:   new Date(Date.now() - ago * 1000).toISOString(),
      responseMs:  passed ? rnd(40, 220) : null,
      chunkId:     rnd(100, 9999),
    };
  });

  const passCount   = auditResults.filter(a => a.passed).length;
  const uptimeAvg   = Math.round(uptimeHistory.reduce((s, v) => s + v, 0) / uptimeHistory.length);
  const latencyAvg  = Math.round(latencyHistory.filter(Boolean).reduce((s, v) => s + v, 0) / latencyHistory.filter(Boolean).length);
  const totalChunks = chunkHistory[chunkHistory.length - 1];

  return {
    uptime30d:      uptimeAvg,
    latencyAvgMs:   latencyAvg,
    latencyP99Ms:   latencyAvg + rnd(30, 90),
    totalChunks,
    auditPassRate:  Math.round((passCount / auditResults.length) * 100),
    stakedApt:      node.stake || rnd(500, 5000),
    joinedDaysAgo:  rnd(10, 180),
    softwareVersion:'v0.8.' + rnd(1, 9),
    latencyHistory,
    uptimeHistory,
    chunkHistory,
    auditResults,
  };
}

// ── Render modal content ──────────────────────────────────────
function renderNodeModal(data, node, live) {
  const { text: tc, grid: gc } = chartColors();

  // ── Stat pills ──────────────────────────────────────────────
  const statusCls = node.status === 'online' ? 'on' : node.status === 'syncing' ? 'syn' : 'off';
  const stats = [
    { label: 'Uptime (30d)',    val: data.uptime30d + '%',            color: data.uptime30d >= 95 ? 'var(--green)' : data.uptime30d >= 80 ? 'var(--yellow)' : 'var(--red)' },
    { label: 'Avg latency',     val: data.latencyAvgMs + ' ms',       color: data.latencyAvgMs < 60 ? 'var(--green)' : data.latencyAvgMs < 120 ? 'var(--yellow)' : 'var(--red)' },
    { label: 'P99 latency',     val: data.latencyP99Ms + ' ms',       color: 'var(--text-primary)' },
    { label: 'Chunks stored',   val: data.totalChunks.toLocaleString(), color: 'var(--text-primary)' },
    { label: 'Audit pass rate', val: data.auditPassRate + '%',         color: data.auditPassRate >= 95 ? 'var(--green)' : data.auditPassRate >= 80 ? 'var(--yellow)' : 'var(--red)' },
    { label: 'Staked',         val: data.stakedApt.toLocaleString() + ' APT', color: 'var(--text-primary)' },
    { label: 'Joined',         val: data.joinedDaysAgo + 'd ago',     color: 'var(--text-secondary)' },
    { label: 'Version',        val: data.softwareVersion,             color: 'var(--text-secondary)' },
  ];

  document.getElementById('nodeDetailStats').innerHTML = stats.map(s => `
    <div class="node-stat-pill">
      <div class="node-stat-label">${s.label}</div>
      <div class="node-stat-val" style="color:${s.color}">${s.val}</div>
    </div>`).join('');

  // ── Latency chart ────────────────────────────────────────────
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(Date.now() - (23 - i) * 3600000);
    return h.getHours().toString().padStart(2, '0') + ':00';
  });

  if (nodeLatencyChart) nodeLatencyChart.destroy();
  nodeLatencyChart = new Chart(document.getElementById('nodeLatencyChart'), {
    type: 'line',
    data: {
      labels: hourLabels,
      datasets: [{
        label: 'Latency (ms)',
        data: data.latencyHistory,
        borderColor: '#378ADD',
        backgroundColor: 'rgba(55,138,221,0.08)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.35,
        fill: true,
        spanGaps: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 }, callback: v => v + ' ms' }, grid: { color: gc }, beginAtZero: true },
      }
    }
  });

  // ── Uptime chart (30d) ───────────────────────────────────────
  const dayLabels30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000);
    return (d.getMonth() + 1) + '/' + d.getDate();
  });

  if (nodeUptimeChart) nodeUptimeChart.destroy();
  nodeUptimeChart = new Chart(document.getElementById('nodeUptimeChart'), {
    type: 'bar',
    data: {
      labels: dayLabels30,
      datasets: [{
        label: 'Uptime %',
        data: data.uptimeHistory,
        backgroundColor: data.uptimeHistory.map(v =>
          v >= 95 ? 'rgba(29,158,117,0.7)' : v >= 80 ? 'rgba(186,117,23,0.7)' : 'rgba(163,45,45,0.7)'
        ),
        borderRadius: 2,
        barPercentage: 0.85,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 8 }, maxTicksLimit: 6 }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: tc, font: { size: 9 }, callback: v => v + '%' }, grid: { color: gc } },
      }
    }
  });

  // ── Chunks chart (14d) ───────────────────────────────────────
  const dayLabels14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    return (d.getMonth() + 1) + '/' + d.getDate();
  });

  if (nodeChunksChart) nodeChunksChart.destroy();
  nodeChunksChart = new Chart(document.getElementById('nodeChunksChart'), {
    type: 'line',
    data: {
      labels: dayLabels14,
      datasets: [{
        label: 'Chunks',
        data: data.chunkHistory,
        borderColor: '#7F77DD',
        backgroundColor: 'rgba(127,119,221,0.1)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 8 }, maxTicksLimit: 5 }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc }, beginAtZero: false },
      }
    }
  });

  // ── Audit feed ───────────────────────────────────────────────
  document.getElementById('nodeAuditFeed').innerHTML = data.auditResults.map(a => {
    const ago = Math.round((Date.now() - new Date(a.timestamp).getTime()) / 1000);
    return `<div class="feed-row">
      <i class="ti ${a.passed ? 'ti-shield-check' : 'ti-shield-x'} feed-icon"
         style="color:${a.passed ? 'var(--green)' : 'var(--red)'}" aria-hidden="true"></i>
      <span class="feed-text">
        Chunk #${a.chunkId}
        <span class="feed-node">${a.challengeId.slice(0, 10)}…</span>
        ${a.passed ? `<span style="color:var(--text-tertiary)">· ${a.responseMs}ms</span>` : '<span style="color:var(--red)">· no response</span>'}
      </span>
      <span class="feed-time" style="display:flex;align-items:center;gap:4px">
        ${a.passed
          ? '<span style="background:var(--green-light);color:var(--green-text);padding:1px 6px;border-radius:99px;font-size:10px;font-weight:500">pass</span>'
          : '<span style="background:var(--red-light);color:var(--red);padding:1px 6px;border-radius:99px;font-size:10px;font-weight:500">fail</span>'}
        ${secsAgo(Math.max(ago, 1))}
      </span>
    </div>`;
  }).join('');

  // ── Note ─────────────────────────────────────────────────────
  document.getElementById('nodeModalNoteText').textContent = live
    ? `✅ Live on-chain data — last updated ${new Date().toLocaleTimeString()}`
    : '⚠️ Simulated data — run npm start to connect live node data';
}

// ════════════════════════════════════════════════════════════════
// ALERT / WATCHLIST
// ════════════════════════════════════════════════════════════════

const ALERT_METRICS = [
  { key: 'onlineNodes', label: 'Online nodes',  unit: '',      operators: ['<', '<=', '>', '>='] },
  { key: 'totalBlobs',  label: 'Total blobs',   unit: '',      operators: ['>', '>=', '<', '<='] },
];

// ── Open / close alerts modal ─────────────────────────────────
function openAlertsModal() {
  document.getElementById('alerts-modal-backdrop').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderAlertsList();
}
function closeAlertsModal(event) {
  if (event && event.target !== document.getElementById('alerts-modal-backdrop')) return;
  document.getElementById('alerts-modal-backdrop').style.display = 'none';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAlertsModal({ target: document.getElementById('alerts-modal-backdrop') });
    closeUploadModal({ target: document.getElementById('upload-modal-backdrop') });
  }
});

// ── Request browser notification permission ───────────────────
async function requestNotifyPermission() {
  if (!('Notification' in window)) {
    alert('Your browser does not support desktop notifications.');
    return false;
  }
  if (Notification.permission === 'granted') { _alertsEnabled = true; return true; }
  if (Notification.permission === 'denied')  {
    alert('Notifications are blocked. Enable them in your browser settings for this site.');
    return false;
  }
  const perm = await Notification.requestPermission();
  _alertsEnabled = perm === 'granted';
  return _alertsEnabled;
}

// ── Add a new alert ───────────────────────────────────────────
async function addAlert() {
  const metric    = document.getElementById('alert-metric').value;
  const operator  = document.getElementById('alert-operator').value;
  const threshold = parseFloat(document.getElementById('alert-threshold').value);
  if (isNaN(threshold)) { document.getElementById('alert-threshold').focus(); return; }

  const granted = await requestNotifyPermission();
  if (!granted) return;

  const metaDef = ALERT_METRICS.find(m => m.key === metric);
  const alert = {
    id:          alertId(),
    metric,
    operator,
    threshold,
    label:       metaDef?.label || metric,
    triggered:   false,
    lastNotified: null,
    createdAt:   new Date().toISOString(),
  };
  _alerts.push(alert);
  saveAlerts();
  renderAlertsList();
  updateAlertBadge();
  document.getElementById('alert-threshold').value = '';
}

// ── Delete an alert ───────────────────────────────────────────
function deleteAlert(id) {
  _alerts = _alerts.filter(a => a.id !== id);
  saveAlerts();
  renderAlertsList();
  updateAlertBadge();
}

// ── Check all alerts against current values ───────────────────
function checkAlerts(values) {
  if (!_alertsEnabled && Notification.permission !== 'granted') return;
  const now = Date.now();
  _alerts.forEach(alert => {
    const val = values[alert.metric];
    if (val === undefined || val === null) return;
    const t = alert.threshold;
    let breached = false;
    if (alert.operator === '<')  breached = val < t;
    if (alert.operator === '<=') breached = val <= t;
    if (alert.operator === '>')  breached = val > t;
    if (alert.operator === '>=') breached = val >= t;

    // Fire notification at most once per 5 minutes per alert
    if (breached && (!alert.lastNotified || now - alert.lastNotified > 5 * 60 * 1000)) {
      alert.triggered   = true;
      alert.lastNotified = now;
      saveAlerts();
      fireNotification(alert, val);
      updateAlertBadge();
    } else if (!breached && alert.triggered) {
      alert.triggered = false;
      saveAlerts();
      updateAlertBadge();
    }
  });
}

function fireNotification(alert, currentVal) {
  if (Notification.permission !== 'granted') return;
  const title = `⚠️ Shelby Hub Alert`;
  const body  = `${alert.label} is ${currentVal} (threshold: ${alert.operator} ${alert.threshold})`;
  const n = new Notification(title, { body, icon: 'https://avatars.githubusercontent.com/u/219037914?s=64&v=4' });
  n.onclick = () => { window.focus(); n.close(); };
  setTimeout(() => n.close(), 8000);
}

// ── Update the alert badge count on the nav button ────────────
function updateAlertBadge() {
  const triggered = _alerts.filter(a => a.triggered).length;
  const badge = document.getElementById('alertNavBadge');
  if (!badge) return;
  if (triggered > 0) {
    badge.textContent = triggered;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Render the alerts list inside the modal ───────────────────
function renderAlertsList() {
  const container = document.getElementById('alerts-list');
  if (!container) return;

  const permStatus = !('Notification' in window) ? 'unsupported'
    : Notification.permission === 'granted' ? 'granted'
    : Notification.permission === 'denied'  ? 'denied'
    : 'default';

  const permBanner = permStatus !== 'granted' ? `
    <div class="alert-perm-banner">
      <i class="ti ti-bell-off" aria-hidden="true"></i>
      ${permStatus === 'denied'
        ? 'Notifications blocked — enable them in browser settings.'
        : permStatus === 'unsupported'
        ? 'Your browser does not support notifications.'
        : 'Click "Add alert" to enable browser notifications.'}
    </div>` : '';

  if (_alerts.length === 0) {
    container.innerHTML = permBanner + `
      <div style="text-align:center;padding:32px 0;color:var(--text-secondary);font-size:13px">
        <i class="ti ti-bell-off" style="font-size:28px;display:block;margin-bottom:8px;color:var(--text-tertiary)" aria-hidden="true"></i>
        No alerts set. Add one below.
      </div>`;
    return;
  }

  container.innerHTML = permBanner + _alerts.map(a => `
    <div class="alert-item ${a.triggered ? 'alert-item-triggered' : ''}">
      <div style="flex:1;min-width:0">
        <div class="alert-item-label">
          ${a.triggered ? '<span class="alert-firing-dot"></span>' : ''}
          ${a.label} ${a.operator} ${a.threshold.toLocaleString()}
        </div>
        <div class="alert-item-meta">
          ${a.triggered ? '🔴 Currently firing' : '✅ OK'}
          · created ${new Date(a.createdAt).toLocaleDateString()}
          ${a.lastNotified ? `· last fired ${secsAgo(Math.round((Date.now() - a.lastNotified) / 1000))}` : ''}
        </div>
      </div>
      <button class="alert-delete-btn" onclick="deleteAlert('${a.id}')" aria-label="Delete alert">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>`).join('');
}

// ── Populate operator dropdown when metric changes ────────────
function onAlertMetricChange() {
  const metric  = document.getElementById('alert-metric').value;
  const metaDef = ALERT_METRICS.find(m => m.key === metric);
  const opSel   = document.getElementById('alert-operator');
  if (!metaDef || !opSel) return;
  opSel.innerHTML = metaDef.operators.map(op => `<option value="${op}">${op}</option>`).join('');
}

// ════════════════════════════════════════════════════════════════
// BLOB UPLOAD DEMO
// ════════════════════════════════════════════════════════════════

let _uploadFile = null;
let _uploadChart = null;

function openUploadModal() {
  document.getElementById('upload-modal-backdrop').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  resetUploadState();
}
function closeUploadModal(event) {
  if (event && event.target !== document.getElementById('upload-modal-backdrop')) return;
  document.getElementById('upload-modal-backdrop').style.display = 'none';
  document.body.style.overflow = '';
}

function resetUploadState() {
  _uploadFile = null;
  const zone = document.getElementById('dropzone');
  if (zone) zone.classList.remove('dropzone-active', 'dropzone-has-file');
  const label = document.getElementById('dropzone-label');
  if (label) label.innerHTML = `<i class="ti ti-cloud-upload" style="font-size:28px;margin-bottom:8px;color:var(--text-tertiary)" aria-hidden="true"></i><br>Drag & drop a file here<br><span style="font-size:11px;color:var(--text-tertiary)">or click to browse · max 10 MB</span>`;
  document.getElementById('upload-panel').style.display = '';
  document.getElementById('upload-progress-panel').style.display = 'none';
  document.getElementById('upload-result-panel').style.display = 'none';
  document.getElementById('upload-submit-btn').disabled = true;
}

// ── Drag-and-drop handlers ────────────────────────────────────
function onDropzoneDragOver(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.add('dropzone-active');
}
function onDropzoneDragLeave() {
  document.getElementById('dropzone').classList.remove('dropzone-active');
}
function onDropzoneDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dropzone-active');
  const file = e.dataTransfer?.files?.[0];
  if (file) setUploadFile(file);
}
function onDropzoneClick() {
  document.getElementById('file-input-hidden').click();
}
function onFileInputChange(e) {
  const file = e.target.files?.[0];
  if (file) setUploadFile(file);
  e.target.value = ''; // reset so same file can be re-selected
}
function setUploadFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    alert('File is too large. Maximum size is 10 MB for the testnet demo.');
    return;
  }
  _uploadFile = file;
  const zone  = document.getElementById('dropzone');
  zone.classList.add('dropzone-has-file');
  zone.classList.remove('dropzone-active');
  const label = document.getElementById('dropzone-label');
  label.innerHTML = `
    <i class="ti ti-file-check" style="font-size:28px;margin-bottom:8px;color:var(--green)" aria-hidden="true"></i><br>
    <strong style="color:var(--text-primary)">${file.name}</strong><br>
    <span style="font-size:11px;color:var(--text-secondary)">${fmtBytes(file.size)} · ${file.type || 'unknown type'}</span>`;
  document.getElementById('upload-submit-btn').disabled = false;
}

// ── Submit upload ─────────────────────────────────────────────
async function submitUpload() {
  if (!_uploadFile) return;

  document.getElementById('upload-panel').style.display = 'none';
  document.getElementById('upload-progress-panel').style.display = '';
  document.getElementById('upload-result-panel').style.display = 'none';

  // Animated progress steps
  const steps = [
    { pct: 10, label: 'Reading file…' },
    { pct: 25, label: 'Connecting to Shelby RPC…' },
    { pct: 45, label: 'Applying Clay erasure coding…' },
    { pct: 65, label: 'Distributing chunks to SP nodes…' },
    { pct: 80, label: 'Waiting for on-chain confirmation…' },
    { pct: 95, label: 'Finalising blob registration…' },
  ];

  const setProgress = (pct, label) => {
    const bar = document.getElementById('upload-progress-bar');
    const lbl = document.getElementById('upload-progress-label');
    const pctEl = document.getElementById('upload-progress-pct');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = label;
    if (pctEl) pctEl.textContent = pct + '%';
  };

  setProgress(0, 'Preparing…');

  // Read file as base64
  let fileData = null;
  try {
    fileData = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result.split(',')[1]);
      r.onerror = () => reject(new Error('File read failed'));
      r.readAsDataURL(_uploadFile);
    });
  } catch (err) {
    showUploadError('Could not read file: ' + err.message);
    return;
  }

  // Animate through steps while API call runs
  let stepIdx = 0;
  const stepTimer = setInterval(() => {
    if (stepIdx < steps.length) {
      setProgress(steps[stepIdx].pct, steps[stepIdx].label);
      stepIdx++;
    }
  }, 600);

  // Try real API upload, with simulated fallback
  let result = null;
  let live    = false;

  const health = await tryFetch(`${API}/health`);
  if (health?.ok) {
    try {
      const resp = await fetch(`${API}/upload`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName:    _uploadFile.name,
          fileType:    _uploadFile.type || 'application/octet-stream',
          fileSizeBytes: _uploadFile.size,
          data:        fileData,
        }),
      });
      const json = await resp.json();
      if (json.ok) { result = json.data; live = true; }
    } catch (_) {}
  }

  clearInterval(stepTimer);
  setProgress(100, 'Done!');
  await new Promise(r => setTimeout(r, 400));

  if (!live) {
    // Simulated result
    result = {
      blobId:        '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      txHash:        '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      chunks:        Math.ceil(_uploadFile.size / (256 * 1024)),
      spCount:       rnd(8, 14),
      erasureFactor: '10+4',
      confirmedAt:   new Date().toISOString(),
    };
  }

  showUploadResult(result, live);
}

function showUploadError(msg) {
  document.getElementById('upload-progress-panel').style.display = 'none';
  document.getElementById('upload-panel').style.display = '';
  document.getElementById('upload-result-panel').style.display = 'none';
  alert('Upload failed: ' + msg);
}

function showUploadResult(result, live) {
  document.getElementById('upload-progress-panel').style.display = 'none';
  document.getElementById('upload-result-panel').style.display = '';

  const explorerUrl = `https://explorer.shelby.xyz/shelbynet/blobs/${result.blobId}`;
  document.getElementById('upload-result-content').innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <i class="ti ti-circle-check" style="font-size:40px;color:var(--green);display:block;margin-bottom:10px" aria-hidden="true"></i>
      <div style="font-size:16px;font-weight:500;color:var(--text-primary);margin-bottom:4px">
        ${live ? 'Blob stored on Shelby testnet!' : 'Simulated upload complete'}
      </div>
      <div style="font-size:12px;color:var(--text-secondary)">
        ${live ? '✅ Real on-chain registration' : '⚠️ Server offline — simulated result'}
      </div>
    </div>

    <div class="upload-result-grid">
      <div class="upload-result-item">
        <div class="upload-result-label">Blob ID</div>
        <div class="upload-result-val upload-result-mono">${result.blobId.slice(0, 18)}…</div>
      </div>
      <div class="upload-result-item">
        <div class="upload-result-label">Tx hash</div>
        <div class="upload-result-val upload-result-mono">${result.txHash.slice(0, 18)}…</div>
      </div>
      <div class="upload-result-item">
        <div class="upload-result-label">Erasure chunks</div>
        <div class="upload-result-val">${result.chunks} chunks · ${result.erasureFactor}</div>
      </div>
      <div class="upload-result-item">
        <div class="upload-result-label">SP nodes used</div>
        <div class="upload-result-val">${result.spCount} nodes</div>
      </div>
      <div class="upload-result-item">
        <div class="upload-result-label">Confirmed at</div>
        <div class="upload-result-val">${new Date(result.confirmedAt).toLocaleTimeString()}</div>
      </div>
      <div class="upload-result-item">
        <div class="upload-result-label">File size</div>
        <div class="upload-result-val">${fmtBytes(_uploadFile?.size || 0)}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      ${live ? `<a href="${explorerUrl}" target="_blank" rel="noopener" class="wallet-connect-btn wallet-connect-btn-blue" style="text-decoration:none;flex:1;min-width:140px">
        <i class="ti ti-external-link" aria-hidden="true"></i> View on Explorer
      </a>` : ''}
      <button class="wallet-connect-btn" onclick="resetUploadState(); document.getElementById('upload-panel').style.display=''"
              style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);flex:1;min-width:120px">
        <i class="ti ti-upload" aria-hidden="true"></i> Upload another
      </button>
    </div>`;
}

// ── Upload modal (tracker quick-access) — mirrors page upload ─
let _uploadFile2 = null;

function onDropzoneDragOver2(e) { e.preventDefault(); document.getElementById('dropzone-modal').classList.add('dropzone-active'); }
function onDropzoneDragLeave2() { document.getElementById('dropzone-modal').classList.remove('dropzone-active'); }
function onDropzoneDrop2(e) {
  e.preventDefault();
  document.getElementById('dropzone-modal').classList.remove('dropzone-active');
  const file = e.dataTransfer?.files?.[0];
  if (file) setUploadFile2(file);
}
function onFileInputChange2(e) {
  const file = e.target.files?.[0];
  if (file) setUploadFile2(file);
  e.target.value = '';
}
function setUploadFile2(file) {
  if (file.size > 10 * 1024 * 1024) { alert('File is too large. Maximum 10 MB.'); return; }
  _uploadFile2 = file;
  const zone = document.getElementById('dropzone-modal');
  zone.classList.add('dropzone-has-file');
  document.getElementById('dropzone-modal-label').innerHTML = `
    <i class="ti ti-file-check" style="font-size:28px;margin-bottom:8px;display:block;color:var(--green)" aria-hidden="true"></i>
    <strong style="color:var(--text-primary)">${file.name}</strong><br>
    <span style="font-size:11px;color:var(--text-secondary)">${fmtBytes(file.size)}</span>`;
  document.getElementById('upload-modal-submit-btn').disabled = false;
}

async function submitUpload2() {
  if (!_uploadFile2) return;
  const steps = [
    { pct: 15, label: 'Reading file…' },
    { pct: 30, label: 'Connecting to Shelby RPC…' },
    { pct: 50, label: 'Clay erasure coding…' },
    { pct: 70, label: 'Distributing to SP nodes…' },
    { pct: 88, label: 'On-chain confirmation…' },
  ];
  document.getElementById('upload-modal-submit-btn').disabled = true;
  document.getElementById('upload-modal-progress').style.display = '';
  document.getElementById('upload-modal-result').style.display = 'none';

  const setP = (pct, label) => {
    const b = document.getElementById('upload-modal-bar');
    const l = document.getElementById('upload-modal-label');
    const p = document.getElementById('upload-modal-pct');
    if (b) b.style.width = pct + '%';
    if (l) l.textContent = label;
    if (p) p.textContent = pct + '%';
  };
  setP(0, 'Preparing…');

  let fileData = null;
  try {
    fileData = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('Read failed'));
      r.readAsDataURL(_uploadFile2);
    });
  } catch (err) { alert('Could not read file: ' + err.message); return; }

  let stepIdx = 0;
  const timer = setInterval(() => {
    if (stepIdx < steps.length) { setP(steps[stepIdx].pct, steps[stepIdx].label); stepIdx++; }
  }, 550);

  let result = null, live = false;
  const health = await tryFetch(`${API}/health`);
  if (health?.ok) {
    try {
      const resp = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: _uploadFile2.name, fileType: _uploadFile2.type || 'application/octet-stream', fileSizeBytes: _uploadFile2.size, data: fileData }),
      });
      const json = await resp.json();
      if (json.ok) { result = json.data; live = true; }
    } catch (_) {}
  }
  clearInterval(timer);
  setP(100, 'Done!');
  await new Promise(r => setTimeout(r, 350));

  if (!result) {
    result = {
      blobId: '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      txHash: '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      chunks: Math.ceil(_uploadFile2.size / (256 * 1024)),
      spCount: rnd(8, 14),
      erasureFactor: '10+4',
      confirmedAt: new Date().toISOString(),
    };
  }

  document.getElementById('upload-modal-progress').style.display = 'none';
  const res = document.getElementById('upload-modal-result');
  res.style.display = '';
  res.innerHTML = `
    <div style="background:var(--green-light);border-radius:var(--radius-md);padding:14px;margin-top:4px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <i class="ti ti-circle-check" style="color:var(--green);font-size:20px" aria-hidden="true"></i>
        <span style="font-size:13px;font-weight:500;color:var(--text-primary)">${live ? 'Stored on Shelby testnet' : 'Simulated — server offline'}</span>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
        <div><strong>Blob ID:</strong> <span style="font-family:monospace">${result.blobId.slice(0,20)}…</span></div>
        <div><strong>Chunks:</strong> ${result.chunks} · erasure ${result.erasureFactor} · ${result.spCount} SP nodes</div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// APT PRICE LIVE FEED (CoinGecko)
// ════════════════════════════════════════════════════════════════

async function fetchAptPrice() {
  // CoinGecko free endpoint — no API key needed, rate limit 30 req/min
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=aptos&vs_currencies=usd&include_24hr_change=true';

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();

    const price  = json?.aptos?.usd;
    const change = json?.aptos?.usd_24h_change;
    if (!price || typeof price !== 'number') throw new Error('No price in response');

    _aptPrice    = price;
    _aptPricedAt = Date.now();
    applyAptPrice(price, change);
  } catch (err) {
    // On failure mark stale if we had a previous price, else leave default
    console.warn('[APT price]', err.message);
    markAptPriceStale();
  }
}

function applyAptPrice(price, change24h) {
  const slider  = document.getElementById('apt-price');
  const display = document.getElementById('apt-price-out');
  const badge   = document.getElementById('apt-price-badge');
  const stale   = document.getElementById('apt-price-stale');
  const meta    = document.getElementById('apt-price-meta');
  const changeEl = document.getElementById('apt-price-change');
  const updatedEl = document.getElementById('apt-price-updated');

  if (!slider) return;

  // Expand slider range if live price exceeds current max
  const currentMax = parseFloat(slider.max);
  if (price > currentMax) {
    // Round up to next clean ceiling
    slider.max = Math.ceil(price / 10) * 10 + 20;
  }

  // Snap to 0.5-step precision
  const snapped = Math.round(price * 2) / 2;
  slider.value  = snapped;
  if (display) display.textContent = '$' + snapped.toFixed(2);

  // Show live badge, hide stale
  if (badge)  badge.style.display  = 'inline-flex';
  if (stale)  stale.style.display  = 'none';
  if (meta)   meta.style.display   = '';

  // 24h change colouring
  if (changeEl && change24h !== undefined) {
    const sign  = change24h >= 0 ? '+' : '';
    changeEl.textContent  = sign + change24h.toFixed(2) + '%';
    changeEl.style.color  = change24h >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // "Updated X ago" — refreshed by a small clock tick
  if (updatedEl) {
    updatedEl.textContent = 'just now';
    startAptPriceClock(updatedEl);
  }

  // Recalculate ROI with new price if calculator is visible
  if (document.getElementById('page-calculator').classList.contains('active')) {
    calcROI();
  }
}

function markAptPriceStale() {
  const badge = document.getElementById('apt-price-badge');
  const stale = document.getElementById('apt-price-stale');
  if (badge && _aptPrice) {
    badge.style.display = 'none';
    if (stale) stale.style.display = '';
  }
}

// ── Small clock that updates "Updated X ago" every 30s ───────
let _aptClockTimer = null;
function startAptPriceClock(el) {
  if (_aptClockTimer) clearInterval(_aptClockTimer);
  _aptClockTimer = setInterval(() => {
    if (!_aptPricedAt || !el) return;
    const secs = Math.round((Date.now() - _aptPricedAt) / 1000);
    el.textContent = secs < 60 ? secs + 's ago'
      : Math.floor(secs / 60) + 'm ago';
    // Mark stale after 3 minutes with no update
    if (secs > 180) markAptPriceStale();
  }, 30_000);
}


// ════════════════════════════════════════════════════════════════
// ON-CHAIN STATS (explorer.shelby.xyz/testnet)
// Polls the shelbynet GraphQL indexer for:
//   • Total Blob Events (all contract event emissions)
//   • Placement Groups (on-chain resource count)
//   • Storage Providers (registered SP count)
//   • Slices (erasure-coded chunk registrations)
// Falls back to Aptos testnet indexer + contract resources when
// shelbynet indexer is unreachable.
// ════════════════════════════════════════════════════════════════

const SHELBYNET_GQL  = 'https://api.shelbynet.shelby.xyz/v1/graphql';
const TESTNET_GQL    = 'https://api.testnet.aptoslabs.com/v1/graphql';
const SHELBY_ADDR    = '0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a';
const ONCHAIN_STATS_API = `${API}/onchain-stats`;

let _lastOnchainStats = null;

async function fetchOnchainStats() {
  // Try our server endpoint first (proxies both indexers, handles CORS)
  const result = await tryFetch(ONCHAIN_STATS_API);
  if (result?.ok && result.data) {
    renderOnchainStats(result.data, result.live);
    return;
  }

  // Server offline → try direct GraphQL from browser (CORS may block, graceful)
  try {
    const stats = await fetchOnchainStatsDirect();
    if (stats) { renderOnchainStats(stats, true); return; }
  } catch (_) {}

  // Use cached or simulated
  renderOnchainStats(_lastOnchainStats || generateSimulatedOnchainStats(), false);
}

// ── Direct browser fetch (works if CORS allows it) ────────────
async function fetchOnchainStatsDirect() {
  const gqlFetch = async (endpoint, query, vars = {}) => {
    const r = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, variables: vars }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    return j.data;
  };

  // Query shelbynet indexer for all event types from the Shelby contract
  const data = await gqlFetch(SHELBYNET_GQL, `
    query ShelbyOnchainStats {
      blob_events: events_aggregate(
        where: { account_address: { _eq: "${SHELBY_ADDR}" } }
      ) { aggregate { count } }

      placement_events: events_aggregate(
        where: {
          account_address: { _eq: "${SHELBY_ADDR}" }
          type: { _ilike: "%placement%" }
        }
      ) { aggregate { count } }

      slice_events: events_aggregate(
        where: {
          account_address: { _eq: "${SHELBY_ADDR}" }
          type: { _ilike: "%slice%" }
        }
      ) { aggregate { count } }

      sp_events: events_aggregate(
        where: {
          account_address: { _eq: "${SHELBY_ADDR}" }
          type: { _ilike: "%storage_provider%" }
        }
      ) { aggregate { count } }
    }
  `);

  return {
    totalBlobEvents:    data?.blob_events?.aggregate?.count      ?? 0,
    placementGroups:    data?.placement_events?.aggregate?.count ?? 0,
    storageProviders:   data?.sp_events?.aggregate?.count        ?? 16,
    slices:             data?.slice_events?.aggregate?.count     ?? 0,
  };
}

// ── Simulated fallback ────────────────────────────────────────
function generateSimulatedOnchainStats() {
  const prev = _lastOnchainStats;
  return {
    totalBlobEvents:  prev ? prev.totalBlobEvents  + rnd(0, 3) : rnd(1200, 2800),
    placementGroups:  prev ? prev.placementGroups  + rnd(0, 1) : rnd(80, 160),
    storageProviders: 16,   // fixed at 16 per shelbynet docs
    slices:           prev ? prev.slices           + rnd(0, 8) : rnd(8000, 24000),
  };
}

// ── Render the four stats strip ───────────────────────────────
function renderOnchainStats(stats, live) {
  _lastOnchainStats = stats;

  const fmt = n => (n === null || n === undefined) ? '—'
    : n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M'
    : n >= 1_000     ? n.toLocaleString()
    : String(n);

  const pairs = [
    ['stat-blob-events',      stats.totalBlobEvents,  'Total Blob Events'],
    ['stat-placement-groups', stats.placementGroups,  'Placement Groups'],
    ['stat-storage-providers',stats.storageProviders, 'Storage Providers'],
    ['stat-slices',           stats.slices,           'Slices'],
  ];

  pairs.forEach(([id, val, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="onchain-stat-val">${fmt(val)}</div>
      <div class="onchain-stat-label">
        ${label}
        ${live ? '<span class="onchain-live-dot" aria-hidden="true"></span>' : ''}
      </div>`;
  });

  // Update timestamp
  const ts = document.getElementById('onchainUpdated');
  if (ts) {
    ts.textContent = live
      ? `✅ Live · ${new Date().toLocaleTimeString()}`
      : `⚠ Simulated · ${new Date().toLocaleTimeString()}`;
    ts.style.color = live ? 'var(--green-text)' : 'var(--yellow)';
  }

  // Animate values that changed
  const strip = document.getElementById('onchainStrip');
  if (strip) {
    strip.classList.remove('onchain-flash');
    void strip.offsetWidth; // reflow
    strip.classList.add('onchain-flash');
  }
}
