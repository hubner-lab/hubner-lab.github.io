/* ==========================================================================
   Core: the choice registry, picks, foundation tokens, stages.
   Every choice is a data entry in PICKER.choices:
     { id, group: 'foundation' | 'element', title, problem,
       layout: 'grid' | 'two' | 'wide', views: [{ w, phone? }],
       affects: [choice ids whose tiles must redraw when this one is picked],
       variants: [{ key, label, rationale, current?, suggested?, flag?, render(ctx, view) }] }
   The rail, the summary, the saved document and check.mjs all iterate this list.
   ========================================================================== */
'use strict';

const HAS_DOM = typeof document !== 'undefined' && typeof window !== 'undefined';
const PICKER = {
  choices: [],
  byId: {},
  lists: [],
  listById: {},
  state: null,
  mode: 'dark',
  modeUser: false,
  width: 'desktop',
  page: 'home',
};

function registerChoice(c) {
  if (PICKER.byId[c.id]) throw new Error('duplicate choice ' + c.id);
  PICKER.choices.push(c);
  PICKER.byId[c.id] = c;
}

/* A list is a checklist (card fields, publication tools, additions) with its own saved array.
   Entries are saved as "itemId:state", only for items the owner touched; the rest show their default. */
function registerList(l) {
  if (PICKER.listById[l.id]) throw new Error('duplicate list ' + l.id);
  PICKER.lists.push(l);
  PICKER.listById[l.id] = l;
}
function listExplicit(l) {
  const st = PICKER.state || emptyState();
  const m = {};
  (st[l.bag] || []).forEach((e) => { const i = e.indexOf(':'); if (i > 0) m[e.slice(0, i)] = e.slice(i + 1); });
  return m;
}
function listState(listId, itemId) {
  const l = PICKER.listById[listId];
  const it = l.items.find((x) => x.id === itemId);
  const ex = listExplicit(l)[itemId];
  return ex && l.states.indexOf(ex) >= 0 ? ex : it.def;
}
function fieldOn(listId, itemId) { return listState(listId, itemId) === 'on'; }
function fallbackKind() {
  const v = (PICKER.state || emptyState()).cardFallback;
  return v === 'pattern' ? 'pattern' : 'initials';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* ---- state -------------------------------------------------------------- */

function emptyState() {
  return {
    v: 1,
    foundations: {},
    elements: {},
    cardFields: [],
    cardFallback: '',
    pubTools: [],
    additions: [],
    notes: {},
    decided: {},
    updatedAt: '',
  };
}

function suggestedKey(c) {
  const v = c.variants.find((x) => x.suggested) || c.variants.find((x) => x.current) || c.variants[0];
  return v.key;
}

/* The effective pick: the owner's decision, else the suggested variant. */
function effPick(id, st) {
  st = st || PICKER.state || emptyState();
  const c = PICKER.byId[id];
  const bag = c.group === 'foundation' ? st.foundations : st.elements;
  const v = bag[id];
  if (v && c.variants.some((x) => x.key === v)) return v;
  return suggestedKey(c);
}

function basePicks() {
  const p = {};
  PICKER.choices.forEach((c) => { p[c.id] = effPick(c.id); });
  return p;
}

function makeCtx(overrides, extra) {
  return Object.assign({ picks: Object.assign(basePicks(), overrides || {}), mode: PICKER.mode }, extra || {});
}

function variantOf(id, key) {
  return PICKER.byId[id].variants.find((v) => v.key === key);
}

/* ---- foundation tokens -------------------------------------------------- */

const PALETTE_ORDER = ['paper', 'surface', 'ink', 'muted', 'link', 'gold', 'leaf'];
const PALETTES = {
  A: {
    name: 'Soil',
    dark: { paper: '#221208', surface: '#2E1A0E', ink: '#ECE6DA', muted: '#A99D8B', link: '#7FB0E8', gold: '#D4B05E', leaf: '#6FAE7C' },
    light: { paper: '#F7F6F1', surface: '#FFFFFF', ink: '#0B0F14', muted: '#4A3E2F', link: '#1E5FBF', gold: '#8C6A16', leaf: '#3E6B4A' },
  },
  B: {
    name: 'Night field',
    dark: { paper: '#0F1613', surface: '#17211C', ink: '#E9EEE6', muted: '#9DAB9F', link: '#8DBBEA', gold: '#E0BD62', leaf: '#7CC68E' },
    light: { paper: '#F2F5EE', surface: '#FFFFFF', ink: '#111A15', muted: '#46544B', link: '#1B5A9E', gold: '#8A6710', leaf: '#2B6841' },
  },
  C: {
    name: 'Herbarium',
    dark: { paper: '#181511', surface: '#231F19', ink: '#EEE8DA', muted: '#AAA190', link: '#9CC2E6', gold: '#D8B15A', leaf: '#86BF8D' },
    light: { paper: '#FBF8F1', surface: '#F3EEE2', ink: '#1D211B', muted: '#5A584C', link: '#2A5A86', gold: '#8A6212', leaf: '#2F5D3A' },
  },
  D: {
    name: 'Slate and grain',
    dark: { paper: '#12161A', surface: '#1B2127', ink: '#E6EAEE', muted: '#9AA4AF', link: '#7DB7F0', gold: '#E3B955', leaf: '#77C29A' },
    light: { paper: '#F4F5F3', surface: '#FFFFFF', ink: '#12161A', muted: '#4D5661', link: '#1D5FBF', gold: '#8A6512', leaf: '#2E7350' },
  },
};

const TYPES = {
  A: { name: 'Fraunces + Inter', display: 'Fraunces', dotWeight: 700, weight: 500, stack: ["'Fraunces', 'Iowan Old Style', Georgia, serif", "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"] },
  B: { name: 'Source Serif 4 + Source Sans 3', display: 'Source Serif 4', dotWeight: 700, weight: 600, stack: ["'Source Serif 4', Georgia, 'Times New Roman', serif", "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif"] },
  C: { name: 'Instrument Serif + Instrument Sans', display: 'Instrument Serif', dotWeight: 400, weight: 400, stack: ["'Instrument Serif', 'Iowan Old Style', Georgia, serif", "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"] },
  D: { name: 'IBM Plex Sans + IBM Plex Mono', display: 'IBM Plex Sans', dotWeight: 700, weight: 600, stack: ["'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif", "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"] },
};
const MONO_STACK = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const CORNERS = {
  A: { control: '999px', card: '20px', chip: '999px', nav: '999px', cardBorder: '1px solid var(--color-line)', chipBorder: '0 solid transparent', shadow: '0 2px 12px rgba(0, 0, 0, 0.16)' },
  B: { control: '8px', card: '8px', chip: '6px', nav: '10px', cardBorder: '1px solid var(--color-line)', chipBorder: '0 solid transparent', shadow: '0 1px 2px rgba(0, 0, 0, 0.14)' },
  C: { control: '0', card: '0', chip: '0', nav: '0', cardBorder: '1px solid color-mix(in srgb, var(--color-ink) 55%, transparent)', chipBorder: '1px solid currentColor', shadow: 'none' },
};

const THEME_DEFAULT_MODE = { A: 'dark', B: 'light', C: 'device', D: 'dark' };

function deviceMode() {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
}

/* The mode the mock-ups start in, from the Theme pick (until the viewer flips the switch). */
function modeFromTheme(themeKey) {
  const m = THEME_DEFAULT_MODE[themeKey] || 'dark';
  return m === 'device' ? (HAS_DOM ? deviceMode() : 'dark') : m;
}

/* Turn a set of picks plus a mode into the variables one .mk element carries. */
function mkVars(picks, mode) {
  const pal = PALETTES[picks.palette] || PALETTES.A;
  const p = pal[mode] || pal.dark;
  const t = TYPES[picks.type] || TYPES.A;
  const c = CORNERS[picks.corner] || CORNERS.A;
  return {
    '--color-paper': p.paper,
    '--color-surface': p.surface,
    '--color-ink': p.ink,
    '--color-muted': p.muted,
    '--color-line': 'color-mix(in srgb, ' + p.ink + ' 16%, transparent)',
    '--color-link': p.link,
    '--color-accent': p.gold,
    '--color-accent-ink': p.paper,
    '--color-leaf': p.leaf,
    '--font-display': t.stack[0],
    '--font-body': t.stack[1],
    '--font-mono': MONO_STACK,
    '--display-weight': String(t.weight),
    '--radius-control': c.control,
    '--radius-card': c.card,
    '--radius-chip': c.chip,
    '--radius-nav': c.nav,
    '--card-border': c.cardBorder,
    '--chip-border': c.chipBorder,
    '--card-shadow': c.shadow,
  };
}

/* Contrast helpers (used by the palette tile and by check.mjs). */
function relLum(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const x = relLum(a), y = relLum(b);
  const hi = Math.max(x, y), lo = Math.min(x, y);
  return (hi + 0.05) / (lo + 0.05);
}
function minTextContrast(p) {
  let m = 99;
  ['ink', 'muted', 'link', 'gold', 'leaf'].forEach((k) => {
    m = Math.min(m, contrast(p[k], p.paper), contrast(p[k], p.surface));
  });
  return m;
}

/* ---- mock-up scope ------------------------------------------------------- */

/* A .mk element is a self-contained skin. data-ov holds overrides ({palette:'C', mode:'light'}). */
function mk(inner, ov, cls) {
  return '<div class="mk' + (cls ? ' ' + cls : '') + '" data-ov="' + esc(JSON.stringify(ov || {})) + '">' + inner + '</div>';
}

function applyScope(el) {
  let ov = {};
  try { ov = JSON.parse(el.getAttribute('data-ov') || '{}'); } catch (e) { ov = {}; }
  const picks = Object.assign(basePicks(), ov);
  const mode = ov.mode || PICKER.mode;
  const vars = mkVars(picks, mode);
  Object.keys(vars).forEach((k) => el.style.setProperty(k, vars[k]));
  el.setAttribute('data-motif', picks.motif);
  el.setAttribute('data-motion', picks.motion);
  el.setAttribute('data-themepick', picks.theme);
  el.setAttribute('data-mode', mode);
}

function applyScopeAll(root) {
  (root || document).querySelectorAll('.mk').forEach(applyScope);
}

/* ---- stages: render at a virtual width, scale to fit --------------------- */

function stage(html, w, ov, extraCls) {
  return '<div class="stagebox" data-w="' + w + '"><div class="stage" style="width:' + w + 'px">' + mk(html, ov, extraCls) + '</div></div>';
}

function phoneFrame(html, ov) {
  return '<div class="phoneframe">' + stage(html, 390, ov) + '</div>';
}

let _stageObserver = null;
function fitStage(box) {
  const w = +box.getAttribute('data-w');
  const st = box.firstElementChild;
  const cw = box.clientWidth;
  if (!w || !cw) return;
  const s = cw / w;
  st.style.transform = 'scale(' + s + ')';
  box.style.height = Math.ceil(st.offsetHeight * s) + 'px';
}
function fitStages(root) {
  if (!HAS_DOM) return;
  if (!_stageObserver && typeof ResizeObserver !== 'undefined') {
    _stageObserver = new ResizeObserver((entries) => {
      entries.forEach((e) => {
        const box = e.target.classList.contains('stagebox') ? e.target : e.target.parentElement;
        fitStage(box);
      });
    });
  }
  (root || document).querySelectorAll('.stagebox').forEach((box) => {
    if (!box._fitted) {
      box._fitted = true;
      if (_stageObserver) { _stageObserver.observe(box); _stageObserver.observe(box.firstElementChild); }
    }
    fitStage(box);
  });
}

/* ---- dot wordmark (canvas) ----------------------------------------------- */

const DOT_COLORS = ['#41821C', '#3E8B1E', '#8FB52E', '#E8D23A'];

function dotHash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0);
}

function drawDotword(cv) {
  const cell = +cv.getAttribute('data-cell') || 9;
  const text = cv.getAttribute('data-text') || '';
  const host = cv.parentElement;
  const avail = host ? host.clientWidth : 0;
  if (!avail) return;
  const fit = +cv.getAttribute('data-fit') || 0;
  const fixedRows = +cv.getAttribute('data-rows') || 0;
  const t = TYPES[effPick('type')];
  const fam = '"' + t.display + '"';
  const weight = t.dotWeight;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = weight + ' 100px ' + fam;
  const w100 = meas.measureText(text).width || 1;
  let size;
  const fitSize = 100 * (Math.floor((avail * (fit || 1)) / cell) - 4) / w100;
  size = fixedRows ? Math.min(fixedRows / 0.86, fitSize) : fitSize;
  const SS = 3; // supersample, then average per cell
  const cols = Math.max(4, Math.ceil((w100 * size) / 100) + 4);
  const rows = Math.max(4, Math.ceil(size * 1.12) + 1);
  const off = document.createElement('canvas');
  off.width = cols * SS; off.height = rows * SS;
  const oc = off.getContext('2d');
  oc.fillStyle = '#000';
  oc.font = weight + ' ' + size * SS + 'px ' + fam;
  oc.textBaseline = 'alphabetic';
  oc.fillText(text, 2 * SS, size * SS * 0.9);
  oc.lineWidth = SS * (cv.getAttribute('data-stroke') ? +cv.getAttribute('data-stroke') : 0.55); oc.lineJoin = 'round';
  oc.strokeText(text, 2 * SS, size * SS * 0.9);
  const img = oc.getImageData(0, 0, off.width, off.height).data;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cols * cell * dpr; cv.height = rows * cell * dpr;
  cv.style.width = cols * cell + 'px'; cv.style.height = rows * cell + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cols * cell, rows * cell);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let a = 0;
      for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) a += img[((r * SS + y) * off.width + (c * SS + x)) * 4 + 3];
      a /= SS * SS * 255;
      const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
      ctx.beginPath();
      if (a > 0.5) {
        ctx.fillStyle = DOT_COLORS[dotHash(c, r) % DOT_COLORS.length];
        ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = 'rgba(246, 241, 230, 0.16)';
        ctx.arc(cx, cy, Math.max(0.8, cell * 0.1), 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
}

async function hydrateCanvases(root) {
  if (!HAS_DOM) return;
  const list = (root || document).querySelectorAll('canvas[data-text]');
  if (!list.length) return;
  const t = TYPES[effPick('type')];
  try { await Promise.race([document.fonts.load(t.dotWeight + ' 100px "' + t.display + '"', 'Hübner Lab'), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* fall back to whatever loaded */ }
  list.forEach((cv) => { try { drawDotword(cv); } catch (e) { /* a canvas that cannot draw stays empty */ } });
  fitStages(root);
}
