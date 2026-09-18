/* =============================================================
   Revenue Command Centre — app logic
   Data: window.GS_DATA (built by build_data.py from Gainsight MCP)
   ============================================================= */
(() => {
'use strict';

const D        = window.GS_DATA;
const ACCTS    = D.accounts;
const TODAY     = new Date(D.meta.generated + 'T00:00:00Z');
const WINDOW_D  = 194;   // renewal horizon: today .. 31 Mar 2027 (matches the
                         // Gainsight aggregate this dashboard reconciles against)
const WINDOW_LBL= 'to 31 Mar 27';
const VISIT_D   = 120;   // horizon for the site-visit planner
const MIN_LEAD  = 14;    // days of runway needed to plan a visit

const $  = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t);
  if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

/* ---------- formatting ---------- */
const money = n =>
  n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M'
: n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k'
           : '$' + n;
const num  = n => n.toLocaleString('en-GB');
const dfmt = s => new Date(s + 'T00:00:00Z')
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dshort = s => new Date(s + 'T00:00:00Z')
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/* ---------- theme ----------
   Canvas cannot use CSS variables, so the globe and the JS-injected swatches
   read the resolved custom properties once per theme change and cache them.
   The stylesheet stays the single source of truth for both. */
const TH = {};
const HEALTH_C = {};

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  Object.assign(TH, {
    ocean1: v('--globe-ocean-1'), ocean2: v('--globe-ocean-2'), ocean3: v('--globe-ocean-3'),
    land: v('--globe-land'), coast: v('--globe-coast'), grat: v('--globe-grat'),
    limb: v('--globe-limb'), halo: v('--globe-halo'),
    label: v('--globe-label'), ring: v('--globe-ring'),
    labelBacking: v('--label-backing'),
    red: v('--red'), amber: v('--amber'), green: v('--green'),
    cyan: v('--cyan'), violet: v('--violet'), pink: v('--pink'),
  });
  Object.assign(HEALTH_C, { Red: TH.red, Yellow: TH.amber, Green: TH.green });
}

/** Strip the alpha off an rgba() halo colour so it can fade to transparent. */
function fade(col, a) {
  if (col.startsWith('#')) {
    const h = col.slice(1);
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${a})`;
  }
  const m = col.match(/rgba?\(([^)]+)\)/);
  if (!m) return col;
  const parts = m[1].split(',').map(x => parseFloat(x));
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
}
/* compact travel label for narrow columns: "0.5h rail" / "8.5h air" / "local" */
const tShort = t => t.mode === 'local' ? 'local'
  : `${t.hours}h ${t.mode === 'rail' ? 'rail' : 'air'}`;
const hc = h => HEALTH_C[h] || getComputedStyle(document.documentElement).getPropertyValue('--txt-3').trim();

/* ---------- derived slices ---------- */
const inWindow = a => a.daysToRenewal >= 0 && a.daysToRenewal <= WINDOW_D;
const renewals = ACCTS.filter(inWindow);
const atRisk   = ACCTS.filter(a => a.riskCount > 0);
const riskRenew= renewals.filter(a => a.riskCount > 0);

const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
const totalArr  = sum(ACCTS, a => a.arr);
const renewArr  = sum(renewals, a => a.arr);
const riskArr   = sum(atRisk, a => a.arr);
const redArr    = sum(ACCTS.filter(a => a.health === 'Red'), a => a.arr);

/* ---------- sites (accounts grouped by city) ---------- */
const SITES = (() => {
  const m = new Map();
  for (const a of ACCTS) {
    if (!m.has(a.city)) m.set(a.city, {
      city: a.city, country: a.country, lat: a.lat, lon: a.lon,
      region: a.region, km: a.kmFromHome, travel: a.travel, accounts: [],
    });
    m.get(a.city).accounts.push(a);
  }
  for (const s of m.values()) {
    s.accounts.sort((x, y) => y.arr - x.arr);
    s.arr       = sum(s.accounts, a => a.arr);
    s.renewals  = s.accounts.filter(inWindow);
    s.renewArr  = sum(s.renewals, a => a.arr);
    s.risks     = s.accounts.filter(a => a.riskCount > 0);
    s.riskArr   = sum(s.risks, a => a.arr);
    s.riskCTAs  = sum(s.accounts, a => a.riskCount);
  }
  return [...m.values()].sort((a, b) => b.arr - a.arr);
})();

/* =============================================================
   1. KPI strip
   ============================================================= */
function renderKpis() {
  const cards = [
    { l: 'Portfolio ARR',       v: money(totalArr), s: `<b>${num(ACCTS.length)}</b> live accounts · ${SITES.length} markets`, c: 'var(--cyan)' },
    { l: `Renewing ${WINDOW_LBL}`, v: money(renewArr), s: `<b>${renewals.length}</b> renewals · ${Math.round(renewArr / totalArr * 100)}% of book`, c: 'var(--blue)' },
    { l: 'ARR carrying risk',   v: money(riskArr), s: `<b>${atRisk.length}</b> accounts · ${sum(atRisk, a => a.riskCount)} open CTAs`, c: 'var(--red)' },
    { l: 'Risk + renewing',     v: money(sum(riskRenew, a => a.arr)), s: `<b>${riskRenew.length}</b> need a play now`, c: 'var(--pink)' },
    { l: 'Red health ARR',      v: money(redArr), s: `<b>${ACCTS.filter(a => a.health === 'Red').length}</b> red scorecards`, c: 'var(--amber)' },
  ];
  $('#kpis').innerHTML = '';
  for (const k of cards) {
    const n = el('div', 'kpi');
    n.style.setProperty('--accent', k.c);
    n.innerHTML = `<div class="kpi-l">${k.l}</div><div class="kpi-v">${k.v}</div><div class="kpi-s">${k.s}</div>`;
    $('#kpis').appendChild(n);
  }
}

/* =============================================================
   2. Globe  (orthographic projection on canvas)
   ============================================================= */
const LAND = [
  /* North America */[[-168,65],[-166,60],[-158,57],[-153,57],[-148,60],[-140,60],[-133,55],[-128,51],[-124,44],[-122,37],[-117,32],[-110,23],[-105,20],[-97,16],[-92,15],[-88,16],[-87,21],[-91,25],[-94,29],[-89,29],[-84,30],[-81,25],[-80,32],[-76,35],[-70,42],[-67,45],[-60,47],[-56,51],[-64,57],[-78,62],[-85,66],[-95,68],[-105,69],[-115,70],[-125,70],[-135,69],[-141,70],[-156,71],[-166,68]],
  /* Greenland */[[-45,60],[-52,64],[-55,69],[-60,76],[-55,82],[-40,84],[-25,81],[-20,75],[-25,70],[-32,66],[-40,62]],
  /* South America */[[-81,-4],[-79,2],[-77,8],[-72,12],[-64,11],[-60,8],[-52,5],[-50,0],[-44,-3],[-38,-6],[-35,-8],[-39,-14],[-40,-21],[-48,-25],[-53,-33],[-58,-38],[-62,-40],[-65,-45],[-68,-50],[-70,-54],[-75,-52],[-74,-45],[-73,-37],[-71,-30],[-70,-23],[-70,-18],[-76,-14],[-80,-6]],
  /* Africa */[[-17,15],[-16,20],[-13,28],[-9,32],[-2,36],[10,37],[11,34],[20,32],[25,32],[32,31],[35,28],[38,22],[39,15],[43,12],[51,12],[51,6],[42,0],[40,-6],[40,-15],[35,-20],[33,-26],[28,-33],[20,-35],[17,-29],[13,-22],[12,-16],[9,-1],[5,4],[-4,5],[-8,4],[-13,9]],
  /* Eurasia */[[-10,36],[-9,43],[-2,43],[0,49],[4,52],[8,54],[11,55],[9,57],[13,56],[19,55],[21,57],[24,60],[22,65],[26,70],[31,70],[41,68],[55,70],[70,73],[80,74],[95,78],[105,77],[113,74],[130,73],[142,73],[160,70],[170,69],[179,67],[179,62],[170,60],[162,60],[158,53],[143,54],[141,45],[132,43],[128,36],[122,31],[121,25],[110,21],[105,10],[100,13],[98,8],[95,16],[90,22],[80,15],[77,8],[72,21],[68,24],[62,25],[57,25],[50,29],[48,30],[44,38],[37,41],[28,41],[26,38],[22,39],[19,41],[14,45],[12,38],[16,38],[18,40],[13,44],[8,44],[3,42],[-2,37],[-6,36]],
  /* UK */[[-5,50],[-3,50],[0,51],[1,53],[-1,55],[-2,57],[-4,58],[-5,57],[-6,56],[-5,54],[-3,54],[-5,52]],
  /* Ireland */[[-10,52],[-9,54],[-7,55],[-6,54],[-6,52],[-8,51]],
  /* Japan */[[130,32],[132,34],[135,34],[137,37],[140,40],[141,45],[144,44],[142,40],[140,36],[137,35],[134,33],[131,31]],
  /* Australia */[[113,-22],[114,-26],[115,-32],[118,-35],[125,-32],[131,-31],[135,-35],[138,-35],[141,-38],[147,-38],[150,-37],[153,-31],[153,-25],[148,-20],[145,-15],[142,-11],[136,-12],[131,-12],[126,-14],[122,-17],[117,-21]],
  /* Madagascar */[[43,-12],[50,-15],[50,-25],[45,-25],[43,-18]],
  /* New Zealand */[[173,-35],[175,-37],[178,-38],[177,-40],[174,-41],[172,-43],[170,-46],[167,-46],[170,-43],[172,-40]],
  /* Indonesia / Philippines sketch */[[95,5],[103,2],[110,1],[117,4],[125,6],[122,0],[115,-3],[106,-6],[100,0]],
];

const cv  = $('#globe');
const ctx = cv.getContext('2d');
let rotLon = 10, rotLat = 18, zoom = 1, spin = true;
let mode = 'arr', selCity = null, hoverSite = null, paused = false;
let W = 0, H = 0, R = 0, CX = 0, CY = 0, dpr = 1;

const rad = d => d * Math.PI / 180;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CX = W / 2; CY = H / 2;
  R = Math.min(W, H) * 0.41 * zoom;
}

/** Project lon/lat -> {x,y,visible} */
function proj(lon, lat) {
  const la = rad(lat), lo = rad(lon - rotLon), p = rad(rotLat);
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  const x = cla * slo;
  const y = Math.cos(p) * sla - Math.sin(p) * cla * clo;
  const z = Math.sin(p) * sla + Math.cos(p) * cla * clo;
  return { x: CX + x * R, y: CY - y * R, z, visible: z > 0.004 };
}

/* metric per site for the active mode */
function metric(s) {
  return mode === 'arr' ? s.arr : mode === 'renewals' ? s.renewArr : s.riskArr;
}
function activeSites() {
  /* rank by the metric actually on screen, not by total ARR */
  return SITES.filter(s => metric(s) > 0).sort((x, y) => metric(y) - metric(x));
}
function markerColor(s) {
  if (mode === 'risk')     return TH.red;
  if (mode === 'renewals') return s.risks.length ? TH.pink : TH.amber;
  const red = s.accounts.filter(a => a.health === 'Red').length / s.accounts.length;
  return red > .5 ? TH.red : red > .25 ? TH.amber : TH.cyan;
}

function draw(ts) {
  /* stop burning frames (and bleeding through the modal) while it's open */
  if (paused) { requestAnimationFrame(draw); return; }
  if (spin) rotLon = (rotLon + 0.055) % 360;
  ctx.clearRect(0, 0, W, H);

  /* halo */
  const halo = ctx.createRadialGradient(CX, CY, R * .9, CX, CY, R * 1.5);
  halo.addColorStop(0, TH.halo);
  halo.addColorStop(1, fade(TH.halo, 0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(CX, CY, R * 1.5, 0, 7); ctx.fill();

  /* ocean */
  const oc = ctx.createRadialGradient(CX - R * .3, CY - R * .35, R * .1, CX, CY, R);
  oc.addColorStop(0, TH.ocean1); oc.addColorStop(.62, TH.ocean2); oc.addColorStop(1, TH.ocean3);
  ctx.fillStyle = oc;
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.fill();

  /* graticule */
  ctx.strokeStyle = TH.grat; ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath(); let on = false;
    for (let lon = -180; lon <= 180; lon += 3) {
      const p = proj(lon, lat);
      if (p.visible) { on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; } else on = false;
    }
    ctx.stroke();
  }
  for (let lon = -180; lon < 180; lon += 30) {
    ctx.beginPath(); let on = false;
    for (let lat = -88; lat <= 88; lat += 3) {
      const p = proj(lon, lat);
      if (p.visible) { on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; } else on = false;
    }
    ctx.stroke();
  }

  /* land */
  ctx.lineWidth = 1.15;
  for (const poly of LAND) {
    ctx.beginPath();
    let on = false, any = false;
    for (const [lon, lat] of poly) {
      const p = proj(lon, lat);
      if (p.visible) { on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; any = true; }
      else on = false;
    }
    if (!any) continue;
    ctx.closePath();
    ctx.fillStyle = TH.land;
    ctx.fill();
    ctx.strokeStyle = TH.coast;
    ctx.stroke();
  }

  /* limb */
  ctx.strokeStyle = TH.limb; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.stroke();

  /* ---- markers ---- */
  const sites = activeSites();
  const max = Math.max(...sites.map(metric), 1);
  const t = (ts || 0) / 1000;
  const drawn = [];

  /* home base marker */
  const home = SITES.find(s => s.city === D.meta.home);
  if (home) {
    const p = proj(home.lon, home.lat);
    if (p.visible) {
      ctx.strokeStyle = fade(TH.violet, .9); ctx.lineWidth = 1.6;
      const pr = 10 + Math.sin(t * 2) * 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, 7);
      ctx.strokeStyle = fade(TH.violet, .3); ctx.stroke();
    }
  }

  for (const s of sites) {
    const p = proj(s.lon, s.lat);
    if (!p.visible) continue;
    const v  = metric(s) / max;
    const rr = (3.1 + Math.sqrt(v) * 13) * Math.min(zoom, 1.7);
    const col = markerColor(s);
    const isSel = s.city === selCity;
    const hot = mode === 'risk' || (mode === 'renewals' && s.risks.length);

    /* glow */
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.5);
    g.addColorStop(0, fade(col, .6)); g.addColorStop(1, fade(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr * 2.5, 0, 7); ctx.fill();

    /* pulse ring on risk */
    if (hot) {
      const ph = (t * .85 + s.lon / 360) % 1;
      ctx.strokeStyle = fade(col, (1 - ph) * .6);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr + ph * 26, 0, 7); ctx.stroke();
    }

    /* core */
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = TH.ring; ctx.lineWidth = isSel ? 2.4 : 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.stroke();

    drawn.push({ s, x: p.x, y: p.y, r: Math.max(rr, 7), v, isSel });
  }

  /* labels last, strongest first, skipping any that would collide */
  ctx.font = '600 10px ui-monospace,Menlo,monospace';
  ctx.textAlign = 'left';
  const boxes = [];
  for (const d of drawn.slice().sort((a, b) => (b.isSel - a.isSel) || (b.v - a.v))) {
    if (!(d.v > .26 || d.isSel || zoom > 1.6)) continue;
    const label = d.s.city.toUpperCase();
    const w = ctx.measureText(label).width;
    const bx = d.x + d.r + 5, by = d.y - 5.5;
    const box = { x: bx - 2, y: by, w: w + 4, h: 12 };
    if (boxes.some(o => box.x < o.x + o.w && box.x + box.w > o.x &&
                        box.y < o.y + o.h && box.y + box.h > o.y)) continue;
    boxes.push(box);
    ctx.fillStyle = TH.labelBacking;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = TH.label;
    ctx.fillText(label, bx, d.y + 3.5);
  }
  cv._hits = drawn;
  requestAnimationFrame(draw);
}

/* ---------- globe interaction ---------- */
let dragging = false, lastX = 0, lastY = 0, moved = 0;
cv.addEventListener('pointerdown', e => {
  dragging = true; moved = 0; spin = false;
  lastX = e.clientX; lastY = e.clientY; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  const rc = cv.getBoundingClientRect();
  if (dragging) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    rotLon -= dx * 0.42 / zoom;
    rotLat = Math.max(-82, Math.min(82, rotLat + dy * 0.42 / zoom));
    lastX = e.clientX; lastY = e.clientY;
    return;
  }
  /* hover tooltip */
  const mx = e.clientX - rc.left, my = e.clientY - rc.top;
  const hit = (cv._hits || []).find(h => (h.x - mx) ** 2 + (h.y - my) ** 2 < (h.r + 6) ** 2);
  const tip = $('#gtip');
  if (hit) {
    hoverSite = hit.s;
    tip.innerHTML =
      `<div class="t">${hit.s.city}, ${hit.s.country}</div>` +
      `<div class="row"><span>ARR</span><b>${money(hit.s.arr)}</b></div>` +
      `<div class="row"><span>Accounts</span><b>${hit.s.accounts.length}</b></div>` +
      `<div class="row"><span>Renewing ${WINDOW_LBL}</span><b>${money(hit.s.renewArr)}</b></div>` +
      (hit.s.riskCTAs ? `<div class="row"><span>Open risk CTAs</span><b style="color:var(--red-ink)">${hit.s.riskCTAs}</b></div>` : '') +
      `<div class="row"><span>From ${D.meta.home}</span><b>${hit.s.travel.label}</b></div>`;
    tip.style.opacity = 1;
    tip.style.left = Math.min(mx + 16, rc.width - 200) + 'px';
    tip.style.top  = Math.max(my - 34, 6) + 'px';
    cv.style.cursor = 'pointer';
  } else {
    hoverSite = null; tip.style.opacity = 0; cv.style.cursor = 'grab';
  }
});
cv.addEventListener('pointerup', e => {
  dragging = false;
  cv.releasePointerCapture(e.pointerId);
  if (moved < 6) {
    const rc = cv.getBoundingClientRect();
    const mx = e.clientX - rc.left, my = e.clientY - rc.top;
    const hit = (cv._hits || []).find(h => (h.x - mx) ** 2 + (h.y - my) ** 2 < (h.r + 6) ** 2);
    if (hit) selectCity(hit.s.city);
  }
});
cv.addEventListener('pointerleave', () => { $('#gtip').style.opacity = 0; });
cv.addEventListener('wheel', e => {
  e.preventDefault(); spin = false;
  zoom = Math.max(0.75, Math.min(3.2, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
  resize();
}, { passive: false });

$('#zIn').onclick  = () => { spin = false; zoom = Math.min(3.2, zoom * 1.22); resize(); };
$('#zOut').onclick = () => { spin = false; zoom = Math.max(0.75, zoom / 1.22); resize(); };
$('#zRst').onclick = () => { zoom = 1; rotLon = 10; rotLat = 18; selCity = null; spin = true; resize(); renderMarkets(); };

document.querySelectorAll('.mbtn').forEach(b => b.onclick = () => {
  document.querySelectorAll('.mbtn').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  mode = b.dataset.mode;
  renderMarkets(); renderLegend();
});

function selectCity(city) {
  selCity = selCity === city ? null : city;
  const s = SITES.find(x => x.city === city);
  if (s && selCity) { spin = false; rotLon = s.lon; rotLat = s.lat * .85; }
  renderMarkets();
}

function renderLegend() {
  const L = {
    arr: [[TH.cyan, 'Healthy book'], [TH.amber, 'Mixed health'], [TH.red, 'Majority red'], [TH.violet, 'Your base']],
    renewals: [[TH.amber, 'Renewal due'], [TH.pink, 'Renewal + open risk'], [TH.violet, 'Your base']],
    risk: [[TH.red, 'Open Gainsight risk CTA'], [TH.violet, 'Your base']],
  }[mode];
  $('#globeLegend').innerHTML = L.map(([c, t]) => `<div class="lg"><i style="background:${c};box-shadow:0 0 8px ${c}"></i>${t}</div>`).join('');
  const s = activeSites();
  $('#globeHint').innerHTML =
    `${s.length} MARKETS · ${money(sum(s, metric))}<br><span style="opacity:.62">` +
    (mode === 'arr' ? 'TOTAL ARR BY SITE' : mode === 'renewals' ? `ARR RENEWING ${WINDOW_LBL.toUpperCase()}` : 'ARR WITH OPEN RISK CTAs') +
    '</span>';
}

function renderMarkets() {
  const list = activeSites();
  const max = Math.max(...list.map(metric), 1);
  const wrap = $('#mktList'); wrap.innerHTML = '';
  $('#mktCount').textContent = `${list.length} sites`;
  list.forEach((s, i) => {
    const v = metric(s);
    const n = el('div', 'mkt' + (s.city === selCity ? ' sel' : '') + (s.risks.length ? ' risk' : ''));
    n.innerHTML =
      `<div class="mkt-n">${String(i + 1).padStart(2, '0')}</div>` +
      `<div><div class="mkt-city">${s.city}</div>` +
      `<div class="mkt-meta">${s.accounts.length} accts · ${tShort(s.travel)}` +
      (s.riskCTAs ? ` · <span style="color:var(--red-ink)">${s.riskCTAs} risk</span>` : '') + `</div></div>` +
      `<div class="mkt-arr">${money(v)}</div>` +
      `<div class="mkt-bar"><i style="width:${Math.max(2, v / max * 100)}%"></i></div>`;
    n.onclick = () => selectCity(s.city);
    wrap.appendChild(n);

    /* selected market expands into its accounts, each openable */
    if (s.city === selCity) {
      const sub = el('div', 'mkt-accts');
      sub.innerHTML = s.accounts.map(a => `
        <div class="mkt-acct" data-acct="${esc(a.name)}">
          <i style="background:${hc(a.health)};box-shadow:0 0 6px ${hc(a.health)}"></i>
          <span>${a.name}${a.riskCount ? ' <span class="warn">\u26a0</span>' : ''}</span>
          <b>${money(a.arr)} · ${a.daysToRenewal >= 0 ? a.daysToRenewal + 'd' : 'past'}</b>
        </div>`).join('');
      sub.querySelectorAll('.mkt-acct').forEach(r =>
        r.onclick = ev => { ev.stopPropagation(); openAcct(r.dataset.acct); });
      wrap.appendChild(sub);
    }
  });
}

/* =============================================================
   3. Risk renewal near me
   ============================================================= */
/* Nearest account that has an open Gainsight risk CTA AND enough
   renewal runway left to actually get on a train and visit. */
const HERO = ACCTS
  .filter(a => a.riskCount > 0 && a.daysToRenewal >= MIN_LEAD && a.daysToRenewal <= VISIT_D)
  .sort((a, b) => a.kmFromHome - b.kmFromHome || a.daysToRenewal - b.daysToRenewal)[0];

function renderSpot() {
  const a = HERO;
  if (!a) { $('#spot').innerHTML = '<div class="spot-col">No qualifying risk renewal in range.</div>'; return; }
  const worst = a.risks.slice().sort((x, y) =>
    ({ Critical: 0, High: 1, Medium: 2 }[x.priority] - { Critical: 0, High: 1, Medium: 2 }[y.priority]))[0];

  $('#spot').innerHTML = `
    <div class="spot-hd">
      <span class="tag red">Risk renewal</span>
      <h3>${a.name}</h3>
      <span class="tag grey">${a.city}, ${a.country}</span>
      <span class="tag cyan">${a.travel.label} from ${D.meta.home}</span>
      <span class="tag ${a.health === 'Red' ? 'red' : a.health === 'Yellow' ? 'amber' : 'green'}">${a.health} health</span>
      <div class="why">${a.kmFromHome} km away · ${a.daysToRenewal} days to renewal<br>
        <span style="opacity:.72">nearest risk renewal you can still visit</span></div>
    </div>
    <div class="spot-body">
      <div class="spot-col">
        <h4>Commercial position</h4>
        <div class="facts">
          <div><div class="fact-l">ARR at risk</div><div class="fact-v red">${money(a.arr)}</div></div>
          <div><div class="fact-l">Renewal date</div><div class="fact-v">${dfmt(a.renewal)}</div></div>
          <div><div class="fact-l">Days remaining</div><div class="fact-v amber">${a.daysToRenewal}</div></div>
          <div><div class="fact-l">Region · industry</div><div class="fact-v" style="font-size:13px">${a.region} · ${a.industry}</div></div>
          <div><div class="fact-l">CSM</div><div class="fact-v" style="font-size:13px">${a.csm}</div></div>
          <div><div class="fact-l">Open risk CTAs</div><div class="fact-v red">${a.riskCount}</div></div>
        </div>
        <div style="margin-top:15px;padding:12px 13px;border-radius:10px;
             background:var(--red-soft);border:1px solid var(--red-line);
             font:11px/1.65 var(--mono);color:var(--txt-2)">
          <b style="color:var(--red-ink)">WHY THE SIREN:</b> ${money(a.arr)} renews in ${a.daysToRenewal} days
          with <b>${worst.reason}</b> still open in Gainsight — and the site is
          ${a.travel.label.toLowerCase().startsWith('in') ? 'in London' : 'only ' + a.travel.label} away.
          A face-to-face before ${dshort(a.renewal)} is the cheapest save available.
        </div>
      </div>
      <div class="spot-col">
        <h4>Open Gainsight risk CTAs</h4>
        ${a.risks.map(r => `
          <div class="cta-item">
            <div class="cta-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                   stroke-linecap="round"><path d="M12 9v4M12 17h.01"/>
                <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
            </div>
            <div style="min-width:0">
              <div class="cta-t">${r.name}</div>
              <div class="cta-m"><em>${r.priority}</em> · ${r.type} / ${r.reason} · due ${dshort(r.due)} · ${r.owner}</div>
            </div>
          </div>`).join('')}
        <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn primary" id="spotSiren">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round"><path d="M12 3a5 5 0 0 0-5 5v4l-2 3h14l-2-3V8a5 5 0 0 0-5-5z"/>
              <path d="M10 18a2 2 0 0 0 4 0"/></svg>
            Raise siren for ${a.name.split(' ')[0]}
          </button>
          <button class="btn" id="spotExplore">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/></svg>
            Explore risk &amp; actions
          </button>
        </div>
      </div>
    </div>`;
  $('#spotSiren').onclick = () => openSiren(a.name);
  $('#spotExplore').onclick = () => openAcct(a.name);
}

/* =============================================================
   4. Site visit planner
   ============================================================= */
function renderVisits() {
  const cands = SITES
    .map(s => {
      const due = s.accounts.filter(a => a.daysToRenewal >= MIN_LEAD && a.daysToRenewal <= VISIT_D);
      return { ...s, due, dueArr: sum(due, a => a.arr), dueRisk: due.filter(a => a.riskCount > 0) };
    })
    .filter(s => s.due.length)
    /* Visit score: reachability dominates (you can only visit what you can get
       to), but an open risk CTA is worth a long haul, and ARR breaks ties. */
    .map(s => ({ ...s, score:
        s.travel.hours
        - (s.dueRisk.length ? 4.5 : 0)
        - Math.min(s.dueArr / 1e5, 4) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 12);

  $('#visitNote').textContent =
    `Renewals ${MIN_LEAD}–${VISIT_D} days out · ranked by travel time from ${D.meta.home}, weighted up for open risk and ARR`;

  $('#visitGrid').innerHTML = cands.map(s => {
    const cls = s.dueRisk.length ? 'hot' : s.travel.hours <= 3 ? 'near' : '';
    const soonest = s.due.slice().sort((a, b) => a.daysToRenewal - b.daysToRenewal)[0];
    return `
    <div class="visit ${cls}">
      <div class="visit-top">
        <div>
          <div class="visit-city">${s.city}</div>
          <div class="visit-country">${s.country} · ${s.region}</div>
        </div>
        <div class="visit-travel">${s.travel.label}</div>
      </div>
      <div class="visit-stat">
        <div><div class="vs-l">ARR renewing</div><div class="vs-v">${money(s.dueArr)}</div></div>
        <div><div class="vs-l">Accounts</div><div class="vs-v">${s.due.length}</div></div>
        <div><div class="vs-l">Go by</div><div class="vs-v" style="color:${s.dueRisk.length ? 'var(--red)' : 'var(--cyan)'}">${dshort(soonest.renewal)}</div></div>
      </div>
      <div class="visit-accts">
        ${s.due.slice(0, 4).map(a => `
          <div class="va clickable" data-acct="${esc(a.name)}">
            <i style="background:${hc(a.health)};box-shadow:0 0 6px ${hc(a.health)}"></i>
            <span>${a.name}${a.riskCount ? ' ⚠' : ''}</span>
            <b>${money(a.arr)} · ${a.daysToRenewal}d</b>
          </div>`).join('')}
        ${s.due.length > 4 ? `<div class="va-more">+ ${s.due.length - 4} more renewing here</div>` : ''}
      </div>
    </div>`;
  }).join('');

  $('#visitGrid').querySelectorAll('.va.clickable').forEach(r =>
    r.onclick = () => openAcct(r.dataset.acct));
}

/* =============================================================
   5. Renewal runway timeline
   ============================================================= */
function renderTimeline() {
  const months = [];
  const start = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1));
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    months.push({ key: d.toISOString().slice(0, 7), d, Red: 0, Yellow: 0, Green: 0, n: 0, arr: 0 });
  }
  const idx = new Map(months.map(m => [m.key, m]));
  for (const a of ACCTS) {
    const m = idx.get(a.renewal.slice(0, 7));
    if (!m || a.daysToRenewal < 0) continue;
    m[a.health] = (m[a.health] || 0) + a.arr;
    m.n++; m.arr += a.arr;
  }
  const max = Math.max(...months.map(m => m.arr), 1);
  const H = 132;
  $('#tl').innerHTML = `
    <div class="tl-bars">
      ${months.map(m => `
        <div class="tl-col">
          <div class="tl-tip">
            <b>${m.d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b><br>
            ${money(m.arr)} · ${m.n} renewals<br>
            <span style="color:var(--red-ink)">${money(m.Red)} red</span> ·
            <span style="color:var(--amber-ink)">${money(m.Yellow)} amber</span> ·
            <span style="color:var(--green-ink)">${money(m.Green)} green</span>
          </div>
          <div class="tl-seg r" style="height:${m.Red / max * H}px"></div>
          <div class="tl-seg y" style="height:${m.Yellow / max * H}px"></div>
          <div class="tl-seg g" style="height:${m.Green / max * H}px"></div>
        </div>`).join('')}
    </div>
    <div class="tl-x">
      ${months.map(m => `<div>${m.d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()}
        <br><span style="opacity:.6">${money(m.arr)}</span></div>`).join('')}
    </div>`;
}

/* =============================================================
   6. Siren + Slack composer
   ============================================================= */
const SIREN_POOL = ACCTS
  .filter(a => a.riskCount > 0 && a.daysToRenewal >= 0)
  .sort((a, b) => a.daysToRenewal - b.daysToRenewal);

function slackMessage(a) {
  const worst = a.risks.slice().sort((x, y) =>
    ({ Critical: 0, High: 1, Medium: 2 }[x.priority] - { Critical: 0, High: 1, Medium: 2 }[y.priority]))[0];
  const visit = a.travel.hours <= 4
    ? `*Proposed play:* on-site with the buying centre in ${a.city} before ${dshort(a.renewal)} — ${a.travel.label} from ${D.meta.home}, so this is a day trip, not a project.`
    : `*Proposed play:* exec-level video session this week, then decide whether ${a.city} (${a.travel.label} from ${D.meta.home}) justifies the trip.`;

  return `:rotating_light: *RISK RENEWAL — ${a.name.toUpperCase()}* :rotating_light:

*${money(a.arr)} ARR renews ${dfmt(a.renewal)}* — that is *${a.daysToRenewal} days* away, and Gainsight still has ${a.riskCount} open risk CTA${a.riskCount > 1 ? 's' : ''} on the account.

*The account*
• ARR: *${money(a.arr)}*  |  Health: *${a.health}*  |  Region: ${a.region}
${a.industry === 'Unclassified' ? '' : `• Industry: ${a.industry}
`}• Site: ${a.city}, ${a.country} — ${a.travel.label} from ${D.meta.home}
• CSM: ${a.csm}

*Open Gainsight risks*
${a.risks.map(r => `• *${r.name}* — ${r.priority} priority · ${r.reason} · due ${dshort(r.due)} · owner ${r.owner}`).join('\n')}

*Why this one, now*
The renewal clock (${a.daysToRenewal}d) is shorter than the runway we usually need to clear ${/^[aeiou]/i.test(worst.reason) ? 'an' : 'a'} ${worst.reason.toLowerCase()} signal. ${worst.priority === 'Critical' ? 'The top CTA is *Critical* and still open.' : `Top open CTA is *${worst.priority}* priority.`}

${visit}

*Asks*
1. ${a.csm} — confirm the economic buyer is engaged and re-baseline the close plan.
2. Renewals — flag ${a.name} on the forecast call; do not leave it in Commit unmodelled.
3. Reply in thread if you have a live exec relationship here.

_Raised from the Revenue Command Centre · source: Gainsight CS · ${dfmt(D.meta.generated)}_`;
}

function openSiren(name) {
  const btn = $('#sirenBtn');
  btn.classList.add('armed');
  setTimeout(() => btn.classList.remove('armed'), 2600);
  sirenSound();

  const sel = $('#acctSel');
  sel.innerHTML = SIREN_POOL.map(a =>
    `<option value="${a.name.replace(/"/g, '&quot;')}">${a.name} — ${money(a.arr)} · ${a.daysToRenewal}d · ${a.riskCount} risk CTA${a.riskCount > 1 ? 's' : ''} · ${a.city}</option>`
  ).join('');
  sel.value = name || (HERO ? HERO.name : SIREN_POOL[0].name);
  refreshMsg();
  paused = true;
  $('#overlay').classList.add('on');
}

function closeSiren() {
  paused = false;
  $('#overlay').classList.remove('on');
}

function currentAcct() {
  return ACCTS.find(a => a.name === $('#acctSel').value) || HERO;
}
function refreshMsg() {
  const a = currentAcct();
  $('#msgBox').value = slackMessage(a);
  $('#msgHint').innerHTML =
    `Slack mrkdwn · ${$('#msgBox').value.length} chars · edit freely before posting`;
  $('#ftHint').innerHTML =
    `${a.name} → <b style="color:var(--txt-2)">${$('#chanSel').selectedOptions[0].text}</b>`;
}

$('#sirenBtn').onclick = () => openSiren(HERO ? HERO.name : null);
$('#closeX').onclick   = closeSiren;
$('#overlay').onclick  = e => { if (e.target === $('#overlay')) closeSiren(); };
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('#acctOverlay').classList.contains('on')) closeAcct(); else closeSiren();
});
$('#acctSel').onchange = refreshMsg;
$('#chanSel').onchange = refreshMsg;
$('#regenBtn').onclick = refreshMsg;
$('#exploreBtn').onclick = () => { const n = currentAcct().name; closeSiren(); openAcct(n); };
$('#msgBox').oninput   = () => {
  $('#msgHint').innerHTML = `Slack mrkdwn · ${$('#msgBox').value.length} chars · edited`;
};

function toast(msg, warn) {
  const t = $('#toast');
  t.innerHTML = msg;
  t.className = 'toast on' + (warn ? ' warn' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.className = 'toast' + (warn ? ' warn' : ''), 6000);
}

$('#copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText($('#msgBox').value); toast('✅ Message copied — paste straight into Slack.'); }
  catch { $('#msgBox').select(); toast('Press ⌘C to copy the selected message.', true); }
};

$('#postBtn').onclick = async () => {
  const [id, label] = $('#chanSel').value.split('|');
  try { await navigator.clipboard.writeText($('#msgBox').value); } catch {}
  toast(`📋 Staged for <b>${label}</b> — message copied and Slack is opening.<br>
    <span style="opacity:.8;font-size:12px">This prototype never posts on your behalf: paste and hit send when you're happy.</span>`);
  window.open(`slack://channel?id=${id}`, '_blank');
};

/* =============================================================
   7. Resolution playbook
   ---------------------------------------------------------------
   These are RECOMMENDATIONS generated from the Gainsight fields —
   they are not stored in Gainsight. Each play declares a lead time,
   an owner and the signal that triggered it, so the drawer can show
   its provenance. `tried` holds keywords looked for in the account's
   "what has already been tried" field: a match downgrades the play
   to "already tried — escalate instead" rather than repeating it.
   ============================================================= */
const PLAYS = {
  'Engagement Risk': [
    { t: 'Run a 48-hour multi-channel re-engagement sweep', p: 1, days: 2, owner: 'CSM', effort: '2h',
      why: 'Email alone has already failed. Work every known contact by email, phone and LinkedIn on the same day, so one quiet inbox cannot stall the renewal.',
      tried: ['reach out', 'email', 'check-in', 'check in'] },
    { t: 'Check product telemetry before assuming silence means churn', p: 1, days: 3, owner: 'CSM', effort: '30m',
      why: 'If users are still logging in, this is a relationship problem rather than a value problem — and the fix is in-app outreach, not escalation.',
      tried: ['usage report', 'adoption audit'] },
    { t: 'Ask your exec sponsor for a peer-to-peer nudge', p: 2, days: 5, owner: 'Exec sponsor', effort: '1h',
      why: 'A same-level approach from our side routes around the contact who has gone quiet.',
      tried: ['ebr', 'executive', 'exec'] },
    { t: 'If still dark at day 7, convert to a formal save plan', p: 2, days: 7, owner: 'CSM + Renewals', effort: 'Half day',
      why: 'Sustained silence this close to a renewal is a churn signal. Get Renewals and Finance in the room rather than carrying on chasing.',
      tried: ['save plan'] },
  ],
  'Support Escalation': [
    { t: 'Get a named support owner and a written remediation plan', p: 1, days: 1, owner: 'CSM + Support', effort: '1h',
      why: 'An open escalation against a renewal needs one accountable name and dated commitments the customer can hold us to.', tried: [] },
    { t: 'Run a joint call: customer, support lead and CSM', p: 1, days: 3, owner: 'CSM + Support', effort: '1h',
      why: 'Puts the customer in front of the person fixing it. Agree fix dates live and confirm them in writing the same day.', tried: [] },
    { t: 'Assess whether an SLA breach warrants a goodwill gesture', p: 2, days: 5, owner: 'CSM + Renewals', effort: '2h',
      why: 'A service credit offered before the customer demands it costs far less than a renegotiated renewal.', tried: ['credit', 'goodwill'] },
    { t: 'Confirm satisfaction in writing before quoting the renewal', p: 2, days: 10, owner: 'CSM', effort: '30m',
      why: 'Never send a renewal quote over an unresolved escalation — it invites the ticket history into the commercial conversation.', tried: [] },
  ],
  'Churn Risk': [
    { t: 'Stand up a formal save plan with named execs on both sides', p: 1, days: 3, owner: 'CSM + Exec sponsor', effort: 'Half day',
      why: 'Declared churn risk needs executive air cover and a single owner, not another round of CSM check-ins.', tried: ['save plan'] },
    { t: 'Quantify delivered value against the original business case', p: 1, days: 7, owner: 'CSM', effort: '1 day',
      why: 'The renewal argument has to be made in the numbers the customer bought on, not in feature usage.',
      tried: ['roi', 'usage report', 'value'] },
    { t: 'Prepare a commercial option set, not a single quote', p: 2, days: 10, owner: 'Renewals + AE', effort: 'Half day',
      why: 'Term, scope and price variants give the customer a way to stay that is not simply "yes or no".', tried: ['pricing', 'discount'] },
    { t: 'Agree a written mutual action plan through to renewal', p: 2, days: 14, owner: 'CSM', effort: '2h',
      why: 'Shared dates and owners make slippage visible while there is still time to correct it.', tried: ['mutual action'] },
  ],
  'Usage Decline': [
    { t: 'Diagnose which teams and features dropped, and when', p: 1, days: 3, owner: 'CSM', effort: '2h',
      why: 'A decline is an average. Find the specific team that stopped — that is where the intervention goes.', tried: ['adoption audit'] },
    { t: 'Run targeted re-enablement for the teams that lapsed', p: 2, days: 7, owner: 'CSM', effort: 'Half day',
      why: 'Generic training rarely lands. Aim it at the lapsed cohort with their own data in front of them.',
      tried: ['training', 'enablement'] },
    { t: 'Re-baseline licence count against real usage before quoting', p: 2, days: 10, owner: 'CSM + Renewals', effort: '2h',
      why: 'Quoting last year’s seat count into a usage decline is how a renewal becomes a downgrade negotiation.', tried: [] },
  ],
  'Single-Threaded Account': [
    { t: 'Map the buying centre and name two more stakeholders', p: 1, days: 3, owner: 'CSM', effort: '2h',
      why: 'One contact means one point of failure. If they leave or go quiet, the renewal has no route through.', tried: [] },
    { t: 'Ask the champion for an introduction to the economic buyer', p: 1, days: 7, owner: 'CSM', effort: '30m',
      why: 'Champions usually introduce willingly while the relationship is good — ask before you need it.', tried: ['intro', 'sponsor'] },
    { t: 'Run a value session with the wider team to build a second champion', p: 2, days: 14, owner: 'CSM', effort: 'Half day',
      why: 'A second advocate created now is what keeps the renewal alive if the first one moves on.',
      tried: ['enablement', 'ebr', 'qbr'] },
  ],
  'Sponsor Change': [
    { t: 'Book a 30-minute re-onboarding with the incoming sponsor', p: 1, days: 5, owner: 'CSM', effort: '1h',
      why: 'A new sponsor inherits the contract but not the context. Assume they know nothing about why we were bought.', tried: [] },
    { t: 'Re-present the original business case and what has been delivered', p: 1, days: 7, owner: 'CSM', effort: 'Half day',
      why: 'New leaders audit inherited spend. Give them the evidence pack before they ask for it.',
      tried: ['roi', 'business case', 'ebr'] },
    { t: 'Re-confirm success criteria in the new sponsor’s own language', p: 2, days: 10, owner: 'CSM', effort: '2h',
      why: 'Their predecessor’s definition of success will not be the one this renewal is judged against.', tried: [] },
  ],
  'Survey Response': [
    { t: 'Close the loop personally within 48 hours', p: 1, days: 2, owner: 'CSM', effort: '30m',
      why: 'Acknowledge, do not defend. A detractor who hears nothing back becomes a detractor with a procurement opinion.', tried: [] },
    { t: 'Convert the specific complaint into a tracked action with a date', p: 2, days: 5, owner: 'CSM', effort: '1h',
      why: 'Sentiment moves when the named issue gets fixed, not when the survey is discussed.', tried: [] },
    { t: 'Re-survey once the fix has landed', p: 3, days: 30, owner: 'CSM', effort: '15m',
      why: 'Gives you a documented recovery to carry into the renewal conversation.', tried: [] },
  ],
  'Community Alert': [
    { t: 'Answer the unanswered question directly and publicly', p: 2, days: 1, owner: 'CSM + Community', effort: '30m',
      why: 'An ignored question in a public forum is read by every other customer evaluating us.', tried: [] },
    { t: 'Check whether it points to a product gap worth escalating', p: 3, days: 3, owner: 'CSM', effort: '30m',
      why: 'Repeated community questions are usually a roadmap signal rather than a support one.', tried: [] },
  ],
  'Low CE Adoption': [
    { t: 'Identify who was enrolled and never started', p: 2, days: 3, owner: 'CSM', effort: '1h',
      why: 'Enrolment is not adoption. The named non-starters are the actionable list.', tried: ['adoption audit'] },
    { t: 'Get a manager-level nudge plus a calendar-blocked session', p: 2, days: 7, owner: 'CSM', effort: '2h',
      why: 'Self-serve training loses to day jobs. Booked time with a manager behind it does not.',
      tried: ['training', 'enablement'] },
  ],
  'AI Risk Signal': [
    { t: 'Validate the signal against the human record before acting', p: 1, days: 1, owner: 'CSM', effort: '30m',
      why: 'Acting on an unverified model output burns credibility with the customer and the forecast alike.', tried: [] },
    { t: 'If confirmed, open the matching risk play; if not, close the CTA with a reason', p: 2, days: 3, owner: 'CSM', effort: '30m',
      why: 'Leaving unvalidated AI CTAs open is what makes the whole risk register untrustworthy.', tried: [] },
  ],
  'Upcoming Renewal': [
    { t: 'Confirm the renewal owner, decision process and paper trail', p: 2, days: 7, owner: 'Renewals + CSM', effort: '2h',
      why: 'Most renewal slippage is procedural — unknown signatory, unknown PO process — not sentiment.', tried: [] },
  ],
  _default: [
    { t: 'Review the CTA detail and assign a named owner with a date', p: 2, days: 2, owner: 'CSM', effort: '30m',
      why: 'An open CTA with no owner and no date will still be open at renewal.', tried: [] },
  ],
};

/* Plays driven by Staircase AI signal flags rather than by a CTA reason */
const SIGNAL_PLAYS = [
  { key: 'dark', label: 'Account dark',
    play: { t: 'Treat the account as dark and escalate beyond the day-to-day contact', p: 1, days: 2, owner: 'CSM + Exec sponsor', effort: '2h',
      why: 'Gainsight has flagged no inbound contact at all. Escalating sideways or upwards is the only reliable way back in.', tried: [] } },
  { key: 'noRenewalDiscussion', label: 'No renewal discussion logged',
    play: { t: 'Open the commercial conversation this week', p: 1, days: 5, owner: 'CSM + Renewals', effort: '1h',
      why: 'Gainsight has no renewal discussion on record. A renewal nobody has discussed is not a forecast, it is a hope.', tried: [] } },
  { key: 'noMeetings', label: 'No meetings with account',
    play: { t: 'Get a meeting in the diary, however short', p: 1, days: 5, owner: 'CSM', effort: '30m',
      why: 'No meeting on record means no chance to read the room before the renewal lands.', tried: [] } },
  { key: 'singleThreaded', label: 'Single-threaded',
    play: { t: 'Widen the relationship beyond the single contact', p: 2, days: 10, owner: 'CSM', effort: 'Half day',
      why: 'Staircase sees one thread of communication. Add a second before the renewal depends on one person’s goodwill.', tried: [] } },
  { key: 'noExecComms', label: 'No exec-to-exec contact',
    play: { t: 'Establish one executive-to-executive touchpoint', p: 2, days: 14, owner: 'Exec sponsor', effort: '1h',
      why: 'Without a senior relationship there is nobody to call when the renewal gets difficult.', tried: ['exec', 'ebr'] } },
  { key: 'slowResponses', label: 'Responding slower than usual',
    play: { t: 'Change channel — the current one is decaying', p: 2, days: 3, owner: 'CSM', effort: '30m',
      why: 'Slowing replies usually precede silence. Phone or in-person resets the pattern; another email rarely does.', tried: [] } },
  { key: 'stakeholderNotEngaged', label: 'Stakeholder not engaged',
    play: { t: 'Re-qualify whether your stakeholder is still the right one', p: 2, days: 7, owner: 'CSM', effort: '1h',
      why: 'Disengagement is often a role change we have not noticed rather than a loss of interest.', tried: [] } },
];

function addDays(d, n) { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }

/** Build the ordered resolution plan for an account. */
function resolutionPlan(a) {
  const det = a.detail || {};
  const triedTxt = (det.alreadyTried || '').toLowerCase();
  const ren = new Date(a.renewal + 'T00:00:00Z');
  const out = [];
  const seen = new Set();

  /* Two escalators, both deliberately narrow so the ranking stays meaningful:
       - a Critical CTA escalates only the plays IT triggered, not the whole account;
       - the renewal clock escalates only plays whose normal lead time would
         overrun the renewal date, i.e. the ones actually at risk of being late. */
  const push = (play, src, ctaPriority) => {
    if (seen.has(play.t)) return;
    seen.add(play.t);
    const target = addDays(TODAY, play.days);
    const capped = a.daysToRenewal >= 0 && target > ren;
    let p = play.p - (capped ? 1 : 0) - (ctaPriority === 'Critical' ? 1 : 0);
    p = Math.max(1, Math.min(3, p));
    out.push({
      p: 'P' + p,
      _p: p,
      t: play.t,
      why: play.why,
      owner: play.owner,
      effort: play.effort,
      by: (capped ? ren : target).toISOString().slice(0, 10),
      cappedByRenewal: capped,
      src,
      tried: play.tried.some(k => triedTxt.includes(k)),
    });
  };

  for (const r of a.risks)
    (PLAYS[r.reason] || PLAYS._default).forEach(pl => push(pl, `CTA: ${r.reason}`, r.priority));
  for (const s of SIGNAL_PLAYS) if (det.signals && det.signals[s.key]) push(s.play, `Signal: ${s.label}`);

  /* renewal-clock and logistics plays */
  if (a.daysToRenewal >= 0 && a.daysToRenewal <= 45) {
    push({ t: 'Flag this account on the renewal forecast call', p: 1, days: 3, owner: 'CSM + Renewals', effort: '15m',
      why: `${money(a.arr)} lands in ${a.daysToRenewal} days with risk still open. It should not be sitting in Commit unmodelled.`,
      tried: [] }, 'Renewal clock');
  }
  if (a.travel.hours <= 4 && a.daysToRenewal >= MIN_LEAD) {
    push({ t: `Get on site in ${a.city} before the renewal`, p: 2, days: Math.max(7, a.daysToRenewal - 14), owner: 'CSM', effort: '1 day',
      why: `${a.city} is ${a.travel.label} from ${D.meta.home}. For an account with open risk, a face-to-face is the cheapest save available.`,
      tried: ['visit', 'on site', 'on-site'] }, 'Proximity');
  }
  const qbrAge = det.lastQbr
    ? Math.round((TODAY - new Date(det.lastQbr + 'T00:00:00Z')) / 864e5) : null;
  if (qbrAge === null || qbrAge > 180) {
    push({ t: 'Schedule the overdue business review', p: 2, days: 21, owner: 'CSM', effort: 'Half day',
      why: qbrAge === null
        ? 'Gainsight holds no QBR date for this account, so nobody has formally reviewed value with the customer.'
        : `Last QBR was ${qbrAge} days ago. Going into a renewal without a recent value conversation is avoidable.`,
      tried: ['qbr', 'ebr'] }, 'Cadence gap');
  }

  return out.sort((x, y) => x._p - y._p || x.by.localeCompare(y.by) || x.tried - y.tried);
}

/* =============================================================
   8. Account drawer
   ============================================================= */
let dwAcct = null;

const REG_ORDER = {
  exposure: (a, b) => b.arr - a.arr,
  clock:    (a, b) => (a.daysToRenewal < 0) - (b.daysToRenewal < 0) || a.daysToRenewal - b.daysToRenewal,
  near:     (a, b) => a.kmFromHome - b.kmFromHome,
};
let regMode = 'exposure';

function renderRegister() {
  const list = atRisk.slice().sort(REG_ORDER[regMode]);
  $('#regGrid').innerHTML = list.map(a => {
    const det = a.detail || {};
    const sig = SIGNAL_PLAYS.filter(s => det.signals && det.signals[s.key]).map(s => s.label);
    const overdue = a.daysToRenewal < 0;
    return `
    <button class="reg p-${a.topRiskPriority || 'Medium'}" data-acct="${esc(a.name)}">
      <div class="reg-top">
        <div class="reg-name">${a.name}</div>
        <div class="reg-arr">${money(a.arr)}</div>
      </div>
      <div class="reg-meta">
        <span class="reg-sig${a.topRiskPriority === 'Critical' ? '' : ' n'}">${a.riskCount} CTA${a.riskCount > 1 ? 's' : ''} · ${a.topRiskPriority}</span>
        ${sig.slice(0, 2).map(x => `<span class="reg-sig">${x}</span>`).join('')}
        ${sig.length > 2 ? `<span class="reg-sig n">+${sig.length - 2}</span>` : ''}
      </div>
      <div class="reg-foot">
        <i style="width:6px;height:6px;border-radius:50%;background:${hc(a.health)};box-shadow:0 0 6px ${hc(a.health)}"></i>
        ${overdue ? `<span style="color:var(--red)">renewed ${-a.daysToRenewal}d ago</span>`
                  : `${a.daysToRenewal}d · ${dshort(a.renewal)}`}
        · ${a.city}
        <span class="reg-go">Explore &rarr;</span>
      </div>
    </button>`;
  }).join('');
  $('#regGrid').querySelectorAll('.reg').forEach(b =>
    b.onclick = () => openAcct(b.dataset.acct));
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function openAcct(name) {
  const a = ACCTS.find(x => x.name === name);
  if (!a) return;
  dwAcct = a;
  const det = a.detail || {};
  const overdue = a.daysToRenewal < 0;

  $('#dwName').textContent = a.name;
  $('#dwSub').textContent =
    `${a.city}, ${a.country} · ${a.region} · ${a.industry} · ${a.travel.label} from ${D.meta.home} · ${a.kmFromHome} km`;

  $('#dwTags').innerHTML = [
    `<span class="tag ${a.health === 'Red' ? 'red' : a.health === 'Yellow' ? 'amber' : 'green'}">${a.health} health</span>`,
    `<span class="tag grey">${money(a.arr)} ARR</span>`,
    overdue ? `<span class="tag red">Renewed ${-a.daysToRenewal}d ago</span>`
            : `<span class="tag ${a.daysToRenewal <= 45 ? 'red' : a.daysToRenewal <= 90 ? 'amber' : 'cyan'}">Renews ${dshort(a.renewal)} · ${a.daysToRenewal}d</span>`,
    a.riskCount ? `<span class="tag red">${a.riskCount} open risk CTA${a.riskCount > 1 ? 's' : ''}</span>`
                : `<span class="tag green">No open risk CTAs</span>`,
    det.churnRiskLevel ? `<span class="tag red">Churn risk: ${det.churnRiskLevel}</span>` : '',
    `<span class="tag grey">${a.csm}</span>`,
  ].filter(Boolean).join('');

  /* ---------- left column: the evidence ---------- */
  const nv = v => v == null || v === '' ? '<span class="mx-v none">not scored</span>' : null;
  const sigOn = SIGNAL_PLAYS.filter(s => det.signals && det.signals[s.key]);
  const sigOff = SIGNAL_PLAYS.filter(s => !(det.signals && det.signals[s.key]));

  $('#dwLeft').innerHTML = `
    <div class="dw-h">Risk posture</div>
    <div class="mx">
      <div><div class="mx-l">Gainsight health</div>
        <div class="mx-v ${a.health.toLowerCase()}">${a.health}</div></div>
      <div><div class="mx-l">Staircase health</div>
        ${nv(det.staircaseHealth) || `<div class="mx-v ${det.staircaseHealth < 40 ? 'red' : det.staircaseHealth < 70 ? 'amber' : 'green'}">${det.staircaseHealth}/100</div>`}</div>
      <div><div class="mx-l">Sentiment</div>
        ${nv(det.sentiment) || `<div class="mx-v ${det.sentiment === 'Issues detected' ? 'red' : det.sentiment === 'Positive' ? 'green' : 'amber'}" title="${esc(det.sentiment)}">${det.sentiment}</div>`}</div>
      <div><div class="mx-l">Open CTAs (all)</div>
        ${nv(det.totalOpenCtas) || `<div class="mx-v">${det.totalOpenCtas}</div>`}</div>
      <div><div class="mx-l">Exec sponsor</div>
        ${nv(det.execSponsor) || `<div class="mx-v" title="${esc(det.execSponsor)}">${det.execSponsor}</div>`}</div>
      <div><div class="mx-l">Last QBR</div>
        ${det.lastQbr ? `<div class="mx-v">${dshort(det.lastQbr)}</div>` : '<span class="mx-v none">none logged</span>'}</div>
    </div>

    <div class="dw-h">Staircase AI signals <span class="c">${sigOn.length} firing</span></div>
    <div class="sigs">
      ${sigOn.map(s => `<span class="sig on"><i></i>${s.label}</span>`).join('')}
      ${sigOff.map(s => `<span class="sig off"><i></i>${s.label}</span>`).join('')}
    </div>

    <div class="dw-block">
      <div class="dw-h">Open risk CTAs <span class="c">from Gainsight Cockpit</span></div>
      ${a.risks.length ? a.risks.map(r => `
        <div class="cta-item">
          <div class="cta-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M12 9v4M12 17h.01"/>
              <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          </div>
          <div style="min-width:0">
            <div class="cta-t">${r.name}</div>
            <div class="cta-m"><em>${r.priority}</em> · ${r.type} / ${r.reason} · due ${dshort(r.due)} · ${r.owner}</div>
          </div>
        </div>`).join('')
        : '<div class="empty">No open risk CTAs on this account.</div>'}
    </div>

    ${det.rootCause || det.riskSynopsis ? `
    <div class="dw-block">
      <div class="dw-h">What Gainsight records <span class="c">account narrative</span></div>
      ${det.riskSynopsis ? `<div class="nar"><div class="nar-l">Risk synopsis</div><div class="nar-t">${det.riskSynopsis}</div></div>` : ''}
      ${det.rootCause ? `<div class="nar cause"><div class="nar-l">Root cause</div><div class="nar-t">${det.rootCause}</div></div>` : ''}
      ${det.customerSaid ? `<div class="nar said"><div class="nar-l">What the customer told us</div><div class="nar-t">${det.customerSaid}</div></div>` : ''}
      ${det.alreadyTried ? `<div class="nar tried"><div class="nar-l">Already tried</div><div class="nar-t">${det.alreadyTried}</div></div>` : ''}
      ${det.successDefinition ? `<div class="nar win"><div class="nar-l">Definition of resolved</div><div class="nar-t">${det.successDefinition}</div></div>` : ''}
    </div>` : `
    <div class="dw-block">
      <div class="dw-h">Account narrative</div>
      <div class="empty">Gainsight holds no root-cause narrative for this account — the plan opposite is built from the CTAs and signals above. Filling in the risk fields in Gainsight would sharpen it.</div>
    </div>`}`;

  /* ---------- right column: the plan ---------- */
  const plan = resolutionPlan(a);
  const live = plan.filter(x => !x.tried);
  $('#dwRight').innerHTML = `
    <div class="dw-h">Recommended actions to resolve <span class="c">${live.length} live${plan.length - live.length ? ` · ${plan.length - live.length} already tried` : ''}</span></div>
    <div style="font:11px/1.6 var(--mono);color:var(--txt-3);margin:-4px 0 14px">
      Generated from the CTAs, signals and renewal clock on the left. Recommendations, not Gainsight records.
    </div>
    ${plan.map(x => `
      <div class="act${x.tried ? ' done' : ''}">
        <div class="act-p ${x.p}">${x.p}</div>
        <div style="min-width:0">
          <div class="act-t">${x.t}</div>
          <div class="act-w">${x.why}</div>
          <div class="act-m">
            <span>Owner <b>${x.owner}</b></span>
            <span>By <b>${dshort(x.by)}</b>${x.cappedByRenewal ? ' (renewal date)' : ''}</span>
            <span>Effort <b>${x.effort}</b></span>
            <span class="src">${x.src}</span>
          </div>
          ${x.tried ? '<div class="act-tried">Already tried &mdash; escalate rather than repeat</div>' : ''}
        </div>
      </div>`).join('')}`;

  $('#dwFt').innerHTML = `${live.length} live actions · ${a.csm}${det.csmEmail ? ` &middot; <span style="color:var(--txt-2)">${det.csmEmail.split('@')[0]}</span>` : ''}`;
  paused = true;
  $('#acctOverlay').classList.add('on');
}

function closeAcct() { paused = false; $('#acctOverlay').classList.remove('on'); }

function planText(a) {
  const plan = resolutionPlan(a);
  const det = a.detail || {};
  const L = [];
  L.push(`RESOLUTION PLAN — ${a.name}`);
  L.push('='.repeat(48));
  L.push(`${money(a.arr)} ARR · renews ${dfmt(a.renewal)} (${a.daysToRenewal} days) · ${a.health} health`);
  L.push(`${a.city}, ${a.country} · ${a.travel.label} from ${D.meta.home} · CSM ${a.csm}`);
  L.push('');
  L.push(`OPEN RISK CTAs (${a.risks.length})`);
  a.risks.forEach(r => L.push(`  - ${r.name} — ${r.priority} · ${r.reason} · due ${dshort(r.due)} · ${r.owner}`));
  const sig = SIGNAL_PLAYS.filter(s => det.signals && det.signals[s.key]).map(s => s.label);
  if (sig.length) { L.push(''); L.push(`SIGNALS FIRING: ${sig.join(', ')}`); }
  if (det.rootCause)        { L.push(''); L.push('ROOT CAUSE'); L.push('  ' + det.rootCause); }
  if (det.customerSaid)     { L.push(''); L.push('CUSTOMER SAID'); L.push('  ' + det.customerSaid); }
  if (det.alreadyTried)     { L.push(''); L.push('ALREADY TRIED'); L.push('  ' + det.alreadyTried); }
  if (det.successDefinition){ L.push(''); L.push('DEFINITION OF RESOLVED'); L.push('  ' + det.successDefinition); }
  L.push('');
  L.push('RECOMMENDED ACTIONS');
  plan.forEach((x, i) => {
    L.push(`  ${i + 1}. [${x.p}] ${x.t}${x.tried ? '  (ALREADY TRIED — escalate instead)' : ''}`);
    L.push(`       Why: ${x.why}`);
    L.push(`       Owner: ${x.owner} · By: ${dshort(x.by)} · Effort: ${x.effort} · Trigger: ${x.src}`);
  });
  L.push('');
  L.push(`Source: ${D.meta.source} · snapshot ${dfmt(D.meta.generated)}.`);
  L.push('Actions are generated recommendations, not Gainsight records.');
  return L.join('\n');
}

$('#dwClose').onclick = closeAcct;
$('#acctOverlay').onclick = e => { if (e.target === $('#acctOverlay')) closeAcct(); };
$('#dwSiren').onclick = () => { closeAcct(); openSiren(dwAcct.name); };
$('#dwCopyPlan').onclick = async () => {
  try { await navigator.clipboard.writeText(planText(dwAcct)); toast(`✅ Action plan for <b>${dwAcct.name}</b> copied.`); }
  catch { toast('Could not reach the clipboard — select the text manually.', true); }
};
function stepRisk(n) {
  const list = atRisk.slice().sort(REG_ORDER[regMode]);
  const i = list.findIndex(x => x.name === dwAcct.name);
  const next = list[(i + n + list.length) % list.length];
  if (next) openAcct(next.name);
}
$('#dwPrev').onclick = () => stepRisk(-1);
$('#dwNext').onclick = () => stepRisk(1);
document.querySelectorAll('#regFilters .mbtn').forEach(b => b.onclick = () => {
  document.querySelectorAll('#regFilters .mbtn').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); regMode = b.dataset.reg; renderRegister();
});

/* =============================================================
   9. Theme switcher
   ============================================================= */
function rerenderAll() {
  renderKpis(); renderLegend(); renderMarkets();
  renderSpot(); renderRegister(); renderVisits(); renderTimeline();
  if (dwAcct && $('#acctOverlay').classList.contains('on')) openAcct(dwAcct.name);
}

function applyTheme(t, persist) {
  document.documentElement.setAttribute('data-theme', t);
  readTheme();
  document.querySelectorAll('#themeSw button').forEach(b =>
    b.classList.toggle('on', b.dataset.themeSet === t));
  if (persist) { try { localStorage.setItem('rcc-theme', t); } catch (e) {} }
}

function initTheme() {
  /* the inline script in <head> already set the attribute; mirror it here */
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', false);
  document.querySelectorAll('#themeSw button').forEach(b =>
    b.onclick = () => { applyTheme(b.dataset.themeSet, true); rerenderAll(); });

  /* follow the OS only while the user has not made an explicit choice */
  let stored = null;
  try { stored = localStorage.getItem('rcc-theme'); } catch (e) {}
  if (!stored && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
      applyTheme(e.matches ? 'light' : 'dark', false); rerenderAll();
    });
  }
}

/* =============================================================
   10. Siren sound
   ---------------------------------------------------------------
   Synthesised with the Web Audio API rather than shipping an audio
   file: no binary asset in the repo, no network fetch, and it still
   works from file:// offline. A two-tone emergency wail — three
   sweeps between 620Hz and 980Hz through a lowpass, with an
   attack/decay envelope so it neither clicks nor startles.
   ============================================================= */
let audioCtx = null;
let sndMuted = false;
try { sndMuted = localStorage.getItem('rcc-siren-muted') === '1'; } catch (e) {}

function sirenSound() {
  if (sndMuted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                            // unsupported browser: stay silent
    audioCtx = audioCtx || new AC();
    /* Browsers start the context suspended until a user gesture. Every caller
       here is inside a click handler, so resuming is permitted. */
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { return; }

  const ctx = audioCtx, t0 = ctx.currentTime;
  const DUR = 1.45, LO = 620, HI = 980, WAILS = 3, PEAK = 0.13;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.linearRampToValueAtTime(PEAK, t0 + 0.07);          // attack
  master.gain.setValueAtTime(PEAK, t0 + DUR - 0.3);              // hold
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + DUR);    // decay

  const lp = ctx.createBiquadFilter();                            // take the edge off
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1900, t0);
  lp.Q.setValueAtTime(0.7, t0);

  lp.connect(master);
  master.connect(ctx.destination);

  /* two slightly detuned saws give it some bite without sounding like a beep */
  for (const detune of [-4, 5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.setValueAtTime(detune, t0);
    osc.frequency.setValueAtTime(LO, t0);
    const w = DUR / WAILS;
    for (let i = 0; i < WAILS; i++) {
      osc.frequency.linearRampToValueAtTime(HI, t0 + i * w + w * 0.5);
      osc.frequency.linearRampToValueAtTime(LO, t0 + (i + 1) * w);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t0);
    osc.connect(g); g.connect(lp);
    osc.start(t0);
    osc.stop(t0 + DUR);
  }

  /* flash the speaker icon in time with the wail */
  const b = $('#sndSw');
  b.classList.remove('ringing');
  void b.offsetWidth;                                             // restart the animation
  b.classList.add('ringing');
  setTimeout(() => b.classList.remove('ringing'), DUR * 1000);
}

function applyMute(m, persist) {
  sndMuted = m;
  const b = $('#sndSw');
  b.classList.toggle('muted', m);
  b.setAttribute('aria-pressed', String(m));
  b.title = m ? 'Unmute the siren' : 'Mute the siren';
  b.setAttribute('aria-label', b.title);
  if (persist) { try { localStorage.setItem('rcc-siren-muted', m ? '1' : '0'); } catch (e) {} }
}

function initSound() {
  applyMute(sndMuted, false);
  $('#sndSw').onclick = () => {
    applyMute(!sndMuted, true);
    if (!sndMuted) sirenSound();        // play a sample so you hear what you enabled
    else toast('🔇 Siren muted.', true);
  };
}

/* =============================================================
   boot
   ============================================================= */
function boot() {
  initTheme();
  initSound();
  $('#homePill').textContent = D.meta.home.toUpperCase();
  $('#datePill').innerHTML = 'SNAPSHOT <b>' + dfmt(D.meta.generated).toUpperCase() + '</b>';
  $('#brandSub').textContent =
    `${D.meta.source.toUpperCase()} · ${num(ACCTS.length)} ACCOUNTS · ${money(totalArr)} ARR`;
  $('#footer').innerHTML =
    `<b>Source:</b> ${D.meta.source} · snapshot ${dfmt(D.meta.generated)} · ${num(ACCTS.length)} accounts · ${money(totalArr)} ARR · ${sum(ACCTS, a => a.riskCount)} open risk CTAs across ${atRisk.length} accounts.<br>
     <b>Geography:</b> ${D.meta.geoNote}<br>
     <b>Slack:</b> the siren stages an editable message and opens the channel — it never posts without you.`;

  renderKpis(); renderLegend(); renderMarkets();
  renderSpot(); renderRegister(); renderVisits(); renderTimeline();
  resize(); requestAnimationFrame(draw);
}
window.addEventListener('resize', resize);
boot();
})();
