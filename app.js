/* ===== SHELBY HUB — app.js ===== */

let drawerOpen = false;
let rwChart, storageChart, nodeChart, roiChart;

// ── Navigation ──────────────────────────────────────────────
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

// ── Node data ─────────────────────────────────────────────────
const NODES = [
  { name: 'SP-Alpha-01',   region: 'US-East',    lat: 38, status: 'online'  },
  { name: 'SP-Beta-07',    region: 'EU-West',    lat: 22, status: 'online'  },
  { name: 'SP-Gamma-03',   region: 'AP-South',   lat: 41, status: 'online'  },
  { name: 'SP-Delta-12',   region: 'US-West',    lat: 29, status: 'online'  },
  { name: 'SP-Epsilon-05', region: 'EU-North',   lat: 18, status: 'syncing' },
  { name: 'SP-Zeta-09',    region: 'AP-East',    lat: 55, status: 'online'  },
  { name: 'SP-Eta-02',     region: 'SA-East',    lat: 67, status: 'online'  },
  { name: 'SP-Theta-11',   region: 'US-Central', lat: 33, status: 'offline' },
];

const EVENTS = [
  ['ti-upload',          'Blob write confirmed',   'SP-Alpha-01'],
  ['ti-download',        'Parallel read served',   'SP-Beta-07'],
  ['ti-shield-check',    'Audit challenge passed', 'SP-Gamma-03'],
  ['ti-coin',            'Micropayment settled',   'SP-Delta-12'],
  ['ti-arrows-exchange', 'Erasure chunk rebuilt',  'SP-Eta-02'],
  ['ti-network',         'New placement group',    'SP-Zeta-09'],
  ['ti-lock',            'Access token verified',  'SP-Alpha-01'],
  ['ti-database',        'Merkle root committed',  'SP-Beta-07'],
];

// ── Metrics ───────────────────────────────────────────────────
function renderMetrics() {
  const online = NODES.filter(n => n.status === 'online').length;
  const items = [
    { label: 'Storage used',   val: (rnd(380, 430) / 10).toFixed(1) + ' TB', sub: '+2.3 GB',    cls: '' },
    { label: 'Active nodes',   val: online + ' / ' + NODES.length,            sub: '1 syncing',   cls: 'warn' },
    { label: 'Reads (24h)',    val: rnd(12000, 18000).toLocaleString(),        sub: '+8%',         cls: '' },
    { label: 'Writes (24h)',   val: rnd(3000, 6000).toLocaleString(),          sub: '+3%',         cls: '' },
    { label: 'Avg latency',    val: rnd(68, 130) + ' ms',                     sub: 'sub-second',  cls: '' },
    { label: 'Audit pass rate',val: rnd(94, 99) + '%',                        sub: 'healthy',     cls: '' },
    { label: 'Blobs stored',   val: rnd(2100, 2800).toLocaleString(),          sub: '+41 new',     cls: '' },
    { label: 'Network uptime', val: (rnd(990, 999) / 10).toFixed(1) + '%',    sub: 'testnet',     cls: '' },
  ];
  document.getElementById('metrics').innerHTML = items.map(c => `
    <div class="metric">
      <div class="metric-label">${c.label}</div>
      <div class="metric-val">${c.val}</div>
      <div class="metric-sub ${c.cls}">${c.sub}</div>
    </div>`).join('');
}

// ── Charts ────────────────────────────────────────────────────
function renderCharts() {
  const { text: tc, grid: gc } = chartColors();

  // Read/write 24h
  const labels = [], reads = [], writes = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date(Date.now() - i * 3600000);
    labels.push(h.getHours().toString().padStart(2, '0') + ':00');
    reads.push(rnd(400, 900));
    writes.push(rnd(80, 280));
  }
  if (rwChart) rwChart.destroy();
  rwChart = new Chart(document.getElementById('rwChart'), {
    type: 'line',
    data: {
      labels,
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

  // Storage growth
  const slabels = [], svals = [];
  let base = 32;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    slabels.push((d.getMonth() + 1) + '/' + d.getDate());
    base += rnd(1, 5);
    svals.push(+base.toFixed(1));
  }
  if (storageChart) storageChart.destroy();
  storageChart = new Chart(document.getElementById('storageChart'), {
    type: 'line',
    data: {
      labels: slabels,
      datasets: [{ label: 'TB', data: svals, borderColor: '#7F77DD', backgroundColor: 'rgba(127,119,221,0.1)', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc, font: { size: 9 } }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 9 }, callback: v => v + ' TB' }, grid: { color: gc } },
      }
    }
  });

  // Node donut
  const on = NODES.filter(n => n.status === 'online').length;
  const sy = NODES.filter(n => n.status === 'syncing').length;
  const of = NODES.filter(n => n.status === 'offline').length;
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

// ── Nodes ────────────────────────────────────────────────────
function renderNodes() {
  document.getElementById('nodeGrid').innerHTML = NODES.map(n => {
    const cls = n.status === 'online' ? 'on' : n.status === 'syncing' ? 'syn' : 'off';
    return `<div class="node-card">
      <div class="node-name"><span class="dot dot-${cls}" aria-hidden="true"></span>${n.name}</div>
      <div class="node-meta">${n.region} · ${n.lat}ms avg</div>
      <div class="node-meta">${rnd(800, 2400).toLocaleString()} chunks</div>
      <span class="pill pill-${cls}">${n.status}</span>
    </div>`;
  }).join('');
}

// ── Utilisation bars ─────────────────────────────────────────
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

// ── Live feed ─────────────────────────────────────────────────
function renderFeed() {
  const shuffled = [...EVENTS].sort(() => Math.random() - 0.5).slice(0, 5);
  document.getElementById('eventFeed').innerHTML =
    '<p class="section-hd" style="margin-bottom:8px">Live events</p>' +
    shuffled.map((e, i) => `
      <div class="feed-row">
        <i class="ti ${e[0]} feed-icon" aria-hidden="true"></i>
        <span class="feed-text">${e[1]} <span class="feed-node">${e[2]}</span></span>
        <span class="feed-time">${secsAgo(rnd(i * 9 + 2, i * 9 + 40))}</span>
      </div>`).join('');
}

function refreshTracker() {
  renderMetrics();
  renderCharts();
  renderNodes();
  renderUtil();
  renderFeed();
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
  refreshTracker();
  setInterval(() => {
    if (document.getElementById('page-tracker').classList.contains('active')) {
      refreshTracker();
    }
  }, 10000);
});
