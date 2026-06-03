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
  if (id === 'calculator') setTimeout(calcROI, 80);
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

// ── Connect via Petra wallet extension ───────────────────────
async function connectPetra() {
  if (!window.petra) {
    alert('Petra wallet extension not found.\n\nInstall it from petra.app, then refresh the page.');
    return;
  }
  try {
    const card = document.getElementById('petraCard');
    card.style.opacity = '0.6';
    const account = await window.petra.connect();
    const address = account?.address;
    if (!address) throw new Error('No address returned');
    walletMode = 'petra';
    await setConnectedWallet(address);
  } catch (err) {
    alert('Could not connect Petra: ' + (err?.message || err));
    document.getElementById('petraCard').style.opacity = '1';
  }
}

// ── Connect via Martian wallet extension ─────────────────────
async function connectMartian() {
  if (!window.martian) {
    alert('Martian wallet extension not found.\n\nInstall it from martianwallet.xyz, then refresh the page.');
    return;
  }
  try {
    const card = document.getElementById('martianCard');
    card.style.opacity = '0.6';
    const response = await window.martian.connect();
    const address = response?.address;
    if (!address) throw new Error('No address returned');
    walletMode = 'martian';
    await setConnectedWallet(address);
  } catch (err) {
    alert('Could not connect Martian: ' + (err?.message || err));
    document.getElementById('martianCard').style.opacity = '1';
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
  if (walletMode === 'petra' && window.petra?.disconnect) {
    try { await window.petra.disconnect(); } catch (_) {}
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
