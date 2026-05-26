/* ===== SHELBY HUB — app.js ===== */

let drawerOpen = false;
let rwChart, storageChart, nodeChart, roiChart;

// ── API base (same origin when served by server.js) ──────────
const API = "/api";

// ── Navigation ───────────────────────────────────────────────
function toggleDrawer() {
  drawerOpen = !drawerOpen;
  document.getElementById('drawer').classList.toggle('open', drawerOpen);
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
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

// ── State: real vs simulated ──────────────────────────────────
let isLive = false; // flips to true when /api/health succeeds

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

// Shelbynet has 16 SP nodes per docs
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
    {
      label: 'Storage used',
      val:   totalBytes ? fmtBytes(totalBytes) : rnd(380, 430) / 10 + ' TB',
      sub:   usedPct ? usedPct + '% of 10 TiB' : '~10 TiB capacity',
      cls:   '',
      live:  !!totalBytes,
    },
    {
      label: 'Active nodes',
      val:   online + ' / ' + total,
      sub:   'shelbynet: 16 SPs',
      cls:   '',
      live:  !!nodeData,
    },
    {
      label: 'Blobs stored',
      val:   totalBlobs ? totalBlobs.toLocaleString() : rnd(2100, 2800).toLocaleString(),
      sub:   totalBlobs ? 'on-chain count' : 'estimated',
      cls:   '',
      live:  !!totalBlobs,
    },
    {
      label: 'Network',
      val:   networkData?.network || 'TESTNET',
      sub:   'Early access',
      cls:   '',
      live:  !!networkData,
    },
    {
      label: 'Avg latency',
      val:   rnd(68, 130) + ' ms',
      sub:   'sub-second',
      cls:   '',
      live:  false,
    },
    {
      label: 'Audit pass rate',
      val:   rnd(94, 99) + '%',
      sub:   'simulated',
      cls:   '',
      live:  false,
    },
    {
      label: 'Contract',
      val:   networkData ? shortAddr(networkData.contractAddress) : '0x85fd…8e6a',
      sub:   'Aptos testnet',
      cls:   '',
      live:  !!networkData,
    },
    {
      label: 'RPC',
      val:   networkData?.rpcUrl ? 'Connected' : 'testnet',
      sub:   'api.testnet.shelby.xyz',
      cls:   '',
      live:  !!networkData?.rpcUrl,
    },
  ];

  document.getElementById('metrics').innerHTML = items.map(c => `
    <div class="metric" title="${c.live ? '✅ Live on-chain data' : '⚠️ Simulated data'}">
      <div class="metric-label">${c.label} ${c.live ? '<span style="color:var(--green);font-size:9px">●LIVE</span>' : ''}</div>
      <div class="metric-val">${c.val}</div>
      <div class="metric-sub ${c.cls}">${c.sub}</div>
    </div>`).join('');
}

// ── Render charts ─────────────────────────────────────────────
function renderCharts(historyData) {
  const { text: tc, grid: gc } = chartColors();

  // Use real history or generate simulated
  let slabels, svals;
  if (historyData && historyData.length > 0) {
    slabels = historyData.map(d => {
      const dt = new Date(d.date);
      return (dt.getMonth() + 1) + '/' + dt.getDate();
    });
    // Cumulative blob count
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

  // 24h read/write (always simulated — no public read-rate API)
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
        y: {
          ticks: {
            color: tc, font: { size: 9 },
            callback: v => isRealStorage ? v + ' blobs' : v + ' TB'
          },
          grid: { color: gc }
        },
      }
    }
  });

  // Node donut
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
function renderNodes(liveNodes) {
  const nodes = liveNodes && liveNodes.length > 0 ? liveNodes : SHELBYNET_NODES;
  document.getElementById('nodeGrid').innerHTML = nodes.map(n => {
    const cls = n.status === 'online' ? 'on' : n.status === 'syncing' ? 'syn' : 'off';
    const addrLabel = n.address && n.address.startsWith('0x')
      ? shortAddr(n.address)
      : n.name || n.address;
    return `<div class="node-card">
      <div class="node-name"><span class="dot dot-${cls}" aria-hidden="true"></span>${addrLabel}</div>
      <div class="node-meta">${n.region} · ${n.lat || '—'}ms avg</div>
      <div class="node-meta">${n.stake ? n.stake.toLocaleString() + ' staked' : rnd(800, 2400).toLocaleString() + ' chunks'}</div>
      <span class="pill pill-${cls}">${n.status}</span>
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
  // 1. Check if server API is available
  const health = await tryFetch(`${API}/health`);
  const serverUp = !!health?.ok;
  setLiveBadge(serverUp);

  let networkData = null, historyData = null, nodeData = null, recentTxns = null;

  if (serverUp) {
    // 2. Fetch all real data in parallel
    [networkData, historyData, nodeData, recentTxns] = await Promise.all([
      tryFetch(`${API}/network`).then(r => r?.data),
      tryFetch(`${API}/blobs/history`).then(r => r?.data),
      tryFetch(`${API}/nodes`).then(r => r?.data),
      tryFetch(`${API}/blobs/recent`).then(r => r?.data),
    ]);
  }

  // 3. Render everything (graceful fallback to simulated if API call failed)
  renderMetrics(networkData, nodeData);
  renderCharts(historyData);
  renderNodes(nodeData);
  renderUtil();
  renderFeed(recentTxns);

  // Update footnote
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
  const breakeven = profit > 0 ? Math.ceil(hw * 6 / profit) : 'N/A';

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

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Add id to footnote for live updates
  const footnote = document.querySelector('#page-tracker .footnote');
  if (footnote) footnote.id = 'tracker-note';

  // Add id to tracker badge
  const badge = document.querySelector('#page-tracker .badge');
  if (badge) badge.id = 'tracker-badge';

  refreshTracker();

  // Auto-refresh every 10s when tracker page is visible
  setInterval(() => {
    if (document.getElementById('page-tracker').classList.contains('active')) {
      refreshTracker();
    }
  }, 10000);
});
