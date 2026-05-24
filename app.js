/* ===== SHELBY HUB — app.js ===== */

let rwChart, storageChart, nodeChart, roiChart;
const API = "/api";

// ── Sidebar helpers ──────────────────────────────────────────
function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const menuBtn = document.getElementById('menu-toggle');

  sidebar.classList.add('open');
  overlay.classList.add('visible');
  menuBtn?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden'; // prevent background scroll

  const firstNavItem = sidebar.querySelector('.nav-btn');
  firstNavItem?.focus();
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const menuBtn = document.getElementById('menu-toggle');

  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
  menuBtn?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// ── Navigation ───────────────────────────────────────────────
function showPage(id, btn) {
  // Switch pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');

  // Update active nav button
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('nav-item-active');
  });
  btn.classList.add('nav-item-active');

  // Always close sidebar when a nav item is clicked
  closeSidebar();

  if (id === 'calculator') setTimeout(calcROI, 80);
}

// ── Helpers ──────────────────────────────────────────────────
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function secsAgo(n) { return n < 60 ? n + 's ago' : Math.floor(n / 60) + 'm ago'; }
function isDark() { return true; } // always dark
function chartColors() {
  return { text: 'rgba(194,198,217,0.6)', grid: 'rgba(46,55,77,0.8)' };
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

async function tryFetch(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return r.json();
  } catch (_) { return null; }
}

// ── Live badge ────────────────────────────────────────────────
function setLiveBadge(live) {
  const dot   = document.getElementById('live-dot');
  const label = document.getElementById('live-label');
  if (dot)   dot.style.background   = live ? '#10b981' : '#f59e0b';
  if (label) label.textContent      = live ? 'Live'    : 'Simulated';
}

// ── Shelbynet has 16 SP nodes per docs ────────────────────────
const SHELBYNET_NODES = Array.from({ length: 16 }, (_, i) => ({
  name:   `SP-${String(i + 1).padStart(2, '0')}`,
  region: ['US-E','EU-W','AP-S','US-W','EU-N','AP-E','SA-E','US-C',
           'US-E','EU-W','AP-S','US-W','EU-N','AP-E','SA-E','US-C'][i],
  lat:    [38,22,41,29,18,55,67,33,40,25,38,32,20,58,70,35][i],
  status: i < 13 ? 'online' : (i === 13 ? 'syncing' : (i === 14 ? 'syncing' : 'offline')),
}));

const EVENTS = [
  ['upload',           'Blob write confirmed',   'SP-01'],
  ['download',         'Parallel read served',   'RPC node'],
  ['verified_user',    'Audit challenge passed', 'Contract'],
  ['payments',         'Micropayment settled',   'RPC node'],
  ['sync_alt',         'Erasure chunk rebuilt',  'SP-07'],
  ['hub',              'New placement group',    'Contract'],
  ['lock',             'Access token verified',  'RPC node'],
  ['data_object',      'Merkle root committed',  'Contract'],
];

// ── Stat cards ────────────────────────────────────────────────
function renderMetrics(networkData) {
  const totalBlobs  = networkData?.totalBlobs  || 0;
  const totalBytes  = networkData?.totalBytes  || 0;

  const items = [
    { label: 'Storage Used',    val: totalBytes  ? fmtBytes(totalBytes)              : (rnd(380,430)/10).toFixed(1)+' TB', live: !!totalBytes,  color: 'text-secondary'  },
    { label: 'Blobs Stored',    val: totalBlobs  ? totalBlobs.toLocaleString()        : rnd(2100,2800).toLocaleString(),    live: !!totalBlobs,  color: 'text-primary'    },
    { label: 'Active Nodes',    val: '14 / 16',                                                                             live: false,         color: 'text-success'    },
    { label: 'Audit Pass Rate', val: rnd(94,99)+'%',                                                                        live: false,         color: 'text-tertiary'   },
  ];

  document.getElementById('metrics').innerHTML = items.map(c => `
    <div class="bg-surface border border-outline p-5 rounded-xl hover:border-secondary transition-all">
      <div class="flex items-center justify-between mb-2">
        <div class="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">${c.label}</div>
        ${c.live ? '<span class="flex items-center gap-1 text-[10px] font-label-caps text-success uppercase tracking-wider"><span class="w-1.5 h-1.5 rounded-full bg-success live-pulse"></span>LIVE</span>' : ''}
      </div>
      <div class="font-stat-lg text-stat-lg ${c.color}">${c.val}</div>
    </div>`).join('');
}

// ── Charts ────────────────────────────────────────────────────
function renderCharts(historyData) {
  const { text: tc, grid: gc } = chartColors();

  // 24h read/write
  const rwLabels = [], reads = [], writes = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date(Date.now() - i * 3600000);
    rwLabels.push(h.getHours().toString().padStart(2,'0') + ':00');
    reads.push(rnd(400, 900));
    writes.push(rnd(80, 280));
  }
  if (rwChart) rwChart.destroy();
  rwChart = new Chart(document.getElementById('rwChart'), {
    type: 'line',
    data: {
      labels: rwLabels,
      datasets: [
        { label:'Reads',  data:reads,  borderColor:'#b4c5ff', backgroundColor:'rgba(180,197,255,0.06)', borderWidth:1.5, pointRadius:0, tension:0.4, fill:true },
        { label:'Writes', data:writes, borderColor:'#bdf4ff', backgroundColor:'rgba(189,244,255,0.06)', borderWidth:1.5, pointRadius:0, tension:0.4, fill:true, borderDash:[4,3] },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:tc, font:{ size:9 }, maxTicksLimit:8 }, grid:{ color:gc } },
        y:{ ticks:{ color:tc, font:{ size:9 } }, grid:{ color:gc } },
      }
    }
  });

  // Storage growth
  const isReal = historyData && historyData.length > 0;
  const slabels = [], svals = [];
  if (isReal) {
    let cum = 0;
    historyData.forEach(d => {
      const dt = new Date(d.date);
      slabels.push((dt.getMonth()+1)+'/'+dt.getDate());
      cum += d.blobs; svals.push(cum);
    });
    document.getElementById('storage-live-badge').classList.remove('hidden');
    document.getElementById('storage-live-badge').classList.add('flex');
  } else {
    let base = 32;
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i*86400000);
      slabels.push((d.getMonth()+1)+'/'+d.getDate());
      base += rnd(1,5); svals.push(+base.toFixed(1));
    }
  }
  if (storageChart) storageChart.destroy();
  storageChart = new Chart(document.getElementById('storageChart'), {
    type:'line',
    data:{ labels:slabels, datasets:[{ label: isReal ? 'Blobs' : 'TB', data:svals, borderColor:'#d0bcff', backgroundColor:'rgba(208,188,255,0.07)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:true }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:tc, font:{ size:9 } }, grid:{ color:gc } },
        y:{ ticks:{ color:tc, font:{ size:9 }, callback: v => isReal ? v : v+' TB' }, grid:{ color:gc } },
      }
    }
  });

  // Node donut
  const on = SHELBYNET_NODES.filter(n=>n.status==='online').length;
  const sy = SHELBYNET_NODES.filter(n=>n.status==='syncing').length;
  const of = SHELBYNET_NODES.filter(n=>n.status==='offline').length;
  if (nodeChart) nodeChart.destroy();
  nodeChart = new Chart(document.getElementById('nodeChart'), {
    type:'doughnut',
    data:{ labels:['Online','Syncing','Offline'], datasets:[{ data:[on,sy,of], backgroundColor:['#10b981','#f59e0b','#ef4444'], borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'70%', plugins:{ legend:{ display:false } } }
  });
  document.getElementById('nodeLegend').innerHTML = [
    { c:'#10b981', l:'Online',  n:on },
    { c:'#f59e0b', l:'Syncing', n:sy },
    { c:'#ef4444', l:'Offline', n:of },
  ].map(x=>`<span class="flex items-center gap-1"><span style="width:8px;height:8px;border-radius:2px;background:${x.c};display:inline-block"></span>${x.l} ${x.n}</span>`).join('');
}

// ── Util bars ─────────────────────────────────────────────────
function renderUtil() {
  const bars = [
    { l:'Fiber network',  p:rnd(55,82) },
    { l:'Chunk capacity', p:rnd(38,65) },
    { l:'Audit load',     p:rnd(20,45) },
    { l:'RPC throughput', p:rnd(48,75) },
  ];
  document.getElementById('utilBars').innerHTML = bars.map(b => `
    <div>
      <div class="flex justify-between mb-1">
        <span class="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">${b.l}</span>
        <span class="font-label-caps text-[10px] ${b.p > 70 ? 'text-warning' : 'text-success'} uppercase tracking-wider">${b.p}%</span>
      </div>
      <div class="w-full bg-surface-bright h-1 rounded-full overflow-hidden border border-outline">
        <div class="h-full rounded-full transition-all duration-700" style="width:${b.p}%;background:${b.p>70?'#f59e0b':'#bdf4ff'}"></div>
      </div>
    </div>`).join('');
}

// ── Live feed ─────────────────────────────────────────────────
function renderFeed(recentTxns) {
  let rows;
  if (recentTxns && recentTxns.length > 0) {
    rows = recentTxns.slice(0,5).map(t => {
      const ago = Math.round((Date.now() - new Date(t.timestamp).getTime()) / 1000);
      const icon = t.fn?.includes('register') ? 'upload' : t.fn?.includes('delete') ? 'delete' : t.fn?.includes('audit') ? 'verified_user' : 'data_object';
      return `<div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-[14px] text-on-surface-variant mt-0.5">${icon}</span>
        <div class="flex-1 min-w-0">
          <div class="font-body-base text-xs text-on-surface truncate">${t.fn || 'transaction'}</div>
          <div class="text-[10px] text-on-surface-variant">${shortAddr(t.sender)} · ${secsAgo(Math.max(ago,1))}</div>
        </div>
      </div>`;
    }).join('');
  } else {
    const shuffled = [...EVENTS].sort(()=>Math.random()-0.5).slice(0,5);
    rows = shuffled.map((e,i) => `
      <div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-[14px] text-on-surface-variant mt-0.5">${e[0]}</span>
        <div class="flex-1 min-w-0">
          <div class="font-body-base text-xs text-on-surface">${e[1]}</div>
          <div class="text-[10px] text-on-surface-variant">${e[2]} · ${secsAgo(rnd(i*9+2,i*9+40))}</div>
        </div>
      </div>`).join('');
  }
  document.getElementById('eventFeed').innerHTML = rows;
}

// ── Node grid ─────────────────────────────────────────────────
function renderNodes(liveNodes) {
  const nodes = liveNodes && liveNodes.length > 0 ? liveNodes : SHELBYNET_NODES;
  const cls = { online:'text-success', syncing:'text-warning', offline:'text-error' };
  const dot = { online:'bg-success', syncing:'bg-warning', offline:'bg-error' };
  document.getElementById('nodeGrid').innerHTML = nodes.map(n => `
    <div class="bg-surface-container-low border border-outline p-3 rounded-lg hover:border-secondary transition-all">
      <div class="flex items-center gap-1.5 mb-1.5">
        <span class="w-1.5 h-1.5 rounded-full ${dot[n.status] || 'bg-warning'} flex-shrink-0"></span>
        <span class="font-body-bold text-on-surface text-xs truncate">${n.name || shortAddr(n.address)}</span>
      </div>
      <div class="text-[10px] text-on-surface-variant">${n.region}</div>
      <div class="text-[10px] text-on-surface-variant">${n.lat || '—'}ms avg</div>
      <div class="mt-2 font-label-caps text-[10px] uppercase tracking-wider ${cls[n.status] || 'text-warning'}">${n.status}</div>
    </div>`).join('');
}

// ── Main refresh ──────────────────────────────────────────────
async function refreshTracker() {
  const health = await tryFetch(`${API}/health`);
  const serverUp = !!health?.ok;
  setLiveBadge(serverUp);

  let networkData=null, historyData=null, nodeData=null, recentTxns=null;
  if (serverUp) {
    [networkData, historyData, nodeData, recentTxns] = await Promise.all([
      tryFetch(`${API}/network`).then(r=>r?.data),
      tryFetch(`${API}/blobs/history`).then(r=>r?.data),
      tryFetch(`${API}/nodes`).then(r=>r?.data),
      tryFetch(`${API}/blobs/recent`).then(r=>r?.data),
    ]);
  }

  renderMetrics(networkData);
  renderCharts(historyData);
  renderNodes(nodeData);
  renderUtil();
  renderFeed(recentTxns);

  const note = document.getElementById('tracker-note');
  if (note) note.textContent = serverUp
    ? `✅ Live data from api.testnet.shelby.xyz — updated ${new Date().toLocaleTimeString()}`
    : `⚠️ API server offline — showing simulated data. Run: npm start`;
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
  document.getElementById('util-rate-out').textContent  = Math.round(util*100) + '%';
  document.getElementById('hw-cost-out').textContent    = '$' + hw;

  const monthly  = Math.round(tb*4.2*util + bw*12*util*0.3 + (stake*apt*0.08/12));
  const profit   = monthly - hw;
  const annual   = monthly * 12;
  const stakeUSD = stake * apt;
  const apy      = stakeUSD > 0 ? ((annual/stakeUSD)*100).toFixed(1) : 0;
  const breakeven = profit > 0 ? Math.ceil(hw*6/profit) + ' months' : 'N/A';

  document.getElementById('r-monthly').textContent   = '$' + monthly.toLocaleString();
  document.getElementById('r-profit').textContent    = (profit>=0?'$':'-$') + Math.abs(profit).toLocaleString();
  document.getElementById('r-profit').style.color    = profit>=0 ? '#10b981' : '#ef4444';
  document.getElementById('r-annual').textContent    = '$' + annual.toLocaleString();
  document.getElementById('r-apy').textContent       = apy + '%';
  document.getElementById('r-breakeven').textContent = breakeven;

  const { text:tc, grid:gc } = chartColors();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cum    = months.map((_,i) => Math.max(0, profit*(i+1)));

  if (roiChart) roiChart.destroy();
  roiChart = new Chart(document.getElementById('roiChart'), {
    type:'bar',
    data:{
      labels:months,
      datasets:[{ label:'Profit', data:cum,
        backgroundColor: cum.map(v => v>=0 ? 'rgba(189,244,255,0.5)' : 'rgba(239,68,68,0.5)'),
        borderColor:     cum.map(v => v>=0 ? '#bdf4ff'               : '#ef4444'),
        borderWidth:1, borderRadius:4 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:tc, font:{ size:9 } }, grid:{ color:gc } },
        y:{ ticks:{ color:tc, font:{ size:9 }, callback:v=>'$'+v.toLocaleString() }, grid:{ color:gc } },
      }
    }
  });
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set initial active nav button (Testnet Tracker)
  const firstNavBtn = document.querySelector('.nav-btn');
  if (firstNavBtn) firstNavBtn.classList.add('nav-item-active');

  // Close sidebar on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  refreshTracker();
  setInterval(() => {
    if (document.getElementById('page-tracker').classList.contains('active')) {
      refreshTracker();
    }
  }, 10000);
});
