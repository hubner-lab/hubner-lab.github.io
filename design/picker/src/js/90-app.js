/* ==========================================================================
   The app: rail, tiles, views, saving, summary.
   Saving: one document, choices/main, written debounced and one write at a
   time, only on change. localStorage is a per-browser convenience. The page
   renders fully without window.claude.
   ========================================================================== */
'use strict';

const LS_KEY = 'hubner-design-picker-v1';
const GROUPS = [
  { id: 'foundation', title: 'Foundations', blurb: 'Each foundation re-skins every mock-up below at once.' },
  { id: 'element', title: 'Elements', blurb: 'Variant A is always "current, cleaned up": today\'s look without its defects.' },
];

function $(sel, root) { return (root || document).querySelector(sel); }
function sleep(ms, v) { return new Promise((r) => setTimeout(() => r(v), ms)); }

/* ---- state helpers ------------------------------------------------------- */

function bagOf(c) { return c.group === 'foundation' ? PICKER.state.foundations : PICKER.state.elements; }
function decidedKey(c) { return PICKER.state.decided[c.id] ? bagOf(c)[c.id] || null : null; }
function listDecided(l) { return !!PICKER.state.decided[l.id]; }
function decidedCount() { return PICKER.choices.filter((c) => decidedKey(c)).length + PICKER.lists.filter(listDecided).length; }
function totalCount() { return PICKER.choices.length + PICKER.lists.length; }
function labelOf(c, key) { const v = c.variants.find((x) => x.key === key); return v ? v.label : ''; }

function sanitizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  PICKER.choices.forEach((c) => {
    const bag = c.group === 'foundation' ? 'foundations' : 'elements';
    const v = raw[bag] && raw[bag][c.id];
    if (typeof v === 'string' && c.variants.some((x) => x.key === v)) s[bag][c.id] = v;
    if (raw.decided && raw.decided[c.id] && s[bag][c.id]) s.decided[c.id] = true;
    if (raw.notes && typeof raw.notes[c.id] === 'string') s.notes[c.id] = raw.notes[c.id].slice(0, 2000);
  });
  PICKER.lists.forEach((l) => {
    const arr = Array.isArray(raw[l.bag]) ? raw[l.bag] : [];
    s[l.bag] = arr.filter((e) => {
      if (typeof e !== 'string') return false;
      const i = e.indexOf(':');
      return i > 0 && l.items.some((it) => it.id === e.slice(0, i)) && l.states.indexOf(e.slice(i + 1)) >= 0;
    });
    if (raw.decided && raw.decided[l.id]) s.decided[l.id] = true;
    if (raw.notes && typeof raw.notes[l.id] === 'string') s.notes[l.id] = raw.notes[l.id].slice(0, 2000);
  });
  if (raw.cardFallback === 'initials' || raw.cardFallback === 'pattern') s.cardFallback = raw.cardFallback;
  if (typeof raw.updatedAt === 'string') s.updatedAt = raw.updatedAt;
  return s;
}

function exportState() {
  const out = JSON.parse(JSON.stringify(PICKER.state));
  out.summary = PICKER.choices.map((c) => {
    const k = decidedKey(c);
    return { id: c.id, title: c.title, decided: !!k, pick: k || effPick(c.id), label: labelOf(c, k || effPick(c.id)), note: PICKER.state.notes[c.id] || '' };
  }).concat(PICKER.lists.map((l) => ({
    id: l.id, title: l.title, decided: listDecided(l),
    items: l.items.reduce((m, it) => { m[it.id] = listState(l.id, it.id); return m; }, {}),
    fallback: l.radio ? fallbackKind() : undefined, note: PICKER.state.notes[l.id] || '',
  })));
  return out;
}

/* ---- rendering: pick view ------------------------------------------------ */

function tileHtml(c, v) {
  const ov = {};
  ov[c.id] = v.key;
  if (c.modeFor) ov.mode = c.modeFor(v.key);
  const ctx = makeCtx(ov);
  const parts = c.views.map((view) => {
    const html = v.render(ctx, view);
    return view.phone
      ? '<div>' + phoneFrame(html, ov) + '<p class="phone-cap">phone, 390 px</p></div>'
      : '<div>' + stage(html, view.w, ov) + '</div>';
  });
  return parts.length > 1 ? '<div class="views">' + parts.join('') + '</div>' : parts[0];
}

function cardHtml(c, v) {
  const picked = decidedKey(c) === v.key;
  const tags = (v.current ? '<span class="tag">Current</span>' : '') +
    (v.suggested ? '<span class="tag is-suggested">Suggested</span>' : '') +
    (v.flag ? '<span class="tag is-flag">' + esc(v.flag) + '</span>' : '');
  return '<article class="vcard' + (picked ? ' is-picked' : '') + '" data-choice="' + c.id + '" data-key="' + v.key + '">' +
    '<div class="vhead"><span class="vletter">' + v.key + '</span><span class="vname">' + esc(v.label) + '</span>' + tags + '</div>' +
    '<div class="vstage">' + tileHtml(c, v) + '</div>' +
    '<div class="vfoot"><p class="vwhy">' + esc(v.rationale) + '</p>' +
    '<button type="button" class="vpick" data-pick aria-pressed="' + picked + '">' + (picked ? 'Picked' : 'Pick ' + v.key) + '</button></div></article>';
}

function gridHtml(c) {
  return c.variants.map((v) => cardHtml(c, v)).join('');
}

function choiceStateText(c) {
  const k = decidedKey(c);
  return k ? 'Decided: ' + k + ', ' + labelOf(c, k) : 'Not decided. The mock-ups use the suggested variant, ' + suggestedKey(c) + '.';
}

function choiceHtml(c) {
  return '<section class="choice" id="c-' + c.id + '" data-cid="' + c.id + '">' +
    '<div class="choice-head"><h2>' + esc(c.title) + '</h2><p class="today"><b>Today:</b> ' + esc(c.problem) + '</p></div>' +
    '<div class="vgrid is-' + (c.layout || 'grid') + '">' + gridHtml(c) + '</div>' +
    '<div class="choice-foot"><div><label for="note-' + c.id + '">Note for ' + esc(c.title) + '</label>' +
    '<textarea id="note-' + c.id + '" data-note="' + c.id + '" rows="1" placeholder="Anything to add or change">' + esc(PICKER.state.notes[c.id] || '') + '</textarea></div>' +
    '<div><button type="button" class="btn" data-clear="' + c.id + '">Clear pick</button></div>' +
    '<p class="choice-state" data-cstate="' + c.id + '">' + esc(choiceStateText(c)) + '</p></div></section>';
}

function listHtml(l) {
  const ex = listExplicit(l);
  const rows = l.items.map((it) => {
    const cur = listState(l.id, it.id);
    return '<div class="lrow"><div class="lname"><b>' + esc(it.label) + '</b>' + (ex[it.id] ? '' : ' <span class="tag">default</span>') + '<span class="lwhy">' + esc(it.why) + '</span></div>' +
      '<div class="seg" role="group" aria-label="' + esc(it.label) + '">' + l.states.map((st) => '<button type="button" data-lstate data-list="' + l.id + '" data-item="' + it.id + '" data-state="' + st + '" aria-pressed="' + (cur === st) + '">' + esc(l.stateLabels[st]) + '</button>').join('') + '</div></div>';
  }).join('');
  let radio = '';
  if (l.radio) {
    const cur = fallbackKind();
    const sample = { name: 'Yael Lev-Mirom' };
    radio = '<div class="lradio"><p class="lradio-t">' + esc(l.radio.label) + '</p><div class="lradio-o">' + l.radio.options.map((o) =>
      '<button type="button" class="lopt" data-lradio="' + o.key + '" aria-pressed="' + (cur === o.key) + '"><span class="lopt-av">' + stage(avatarHtml(sample, 56, o.key) + avatarHtml({ name: 'Noam Pintel' }, 56, o.key) + avatarHtml({ name: 'Tal Amar' }, 56, o.key), 200, {}, 'mk-avrow') + '</span><span><b>' + esc(o.label) + '</b>' + (o.suggested ? ' <span class="tag is-suggested">Suggested</span>' : '') + '<span class="lwhy">' + esc(o.why) + '</span></span></button>').join('') + '</div></div>';
  }
  return '<section class="choice list" id="c-' + l.id + '" data-lid="' + l.id + '"><div class="choice-head"><h2>' + esc(l.title) + '</h2><p class="today"><b>Today:</b> ' + esc(l.problem) + '</p></div>' +
    '<div class="listbox">' + rows + radio + '</div>' +
    '<div class="choice-foot"><div><label for="note-' + l.id + '">Note for ' + esc(l.title) + '</label><textarea id="note-' + l.id + '" data-note="' + l.id + '" rows="1" placeholder="Anything to add or change">' + esc(PICKER.state.notes[l.id] || '') + '</textarea></div>' +
    '<div><button type="button" class="btn" data-lreset="' + l.id + '">Reset to defaults</button></div>' +
    '<p class="choice-state" data-lstatus="' + l.id + '">' + (listDecided(l) ? 'Changed by you.' : 'Defaults, not decided. The mock-ups use the defaults.') + '</p></div></section>';
}

function summaryRows() {
  const listRows = PICKER.lists.map((l) => {
    const d = listDecided(l);
    const on = l.items.filter((it) => listState(l.id, it.id) === 'on').length;
    const built = l.items.filter((it) => listState(l.id, it.id) === 'built').length;
    return '<tr><td>' + esc(l.title) + '</td><td>' + on + ' of ' + l.items.length + ' on' + (built ? ', ' + built + ' built but off' : '') + (l.radio ? '; no photo: ' + fallbackKind() : '') + '</td><td>' + (d ? '<span class="st-decided">changed</span>' : '<span class="st-undecided">defaults</span>') + '</td><td>' + esc(PICKER.state.notes[l.id] || '') + '</td></tr>';
  }).join('');
  return PICKER.choices.map((c) => {
    const k = decidedKey(c);
    const eff = effPick(c.id);
    return '<tr><td>' + esc(c.title) + '</td><td>' + (k ? '<span class="st-decided">' + k + '</span> ' + esc(labelOf(c, k)) : '<span class="st-undecided">' + eff + ' ' + esc(labelOf(c, eff)) + ' (suggested)</span>') + '</td>' +
      '<td>' + (k ? '<span class="st-decided">decided</span>' : '<span class="st-undecided">not decided</span>') + '</td><td>' + esc(PICKER.state.notes[c.id] || '') + '</td></tr>';
  }).join('') + listRows;
}

function summaryHtml() {
  return '<section class="summary" id="summary"><h2>Summary</h2>' +
    '<p class="intro" style="color:var(--c-muted);margin:0">Every choice and its status. A choice counts as decided only after you pick it; until then the mock-ups show the suggested variant and this table says so.</p>' +
    '<div class="sumwrap"><table class="sumtable"><thead><tr><th>Choice</th><th>Pick</th><th>Status</th><th>Note</th></tr></thead><tbody id="sumbody">' + summaryRows() + '</tbody></table></div>' +
    '<div class="sumactions"><button type="button" class="btn btn-primary" data-copy>Copy choices</button><span class="pv-note" id="sumcount"></span></div>' +
    '<pre class="jsonbox" id="jsonbox" hidden></pre></section>';
}

function introHtml() {
  return '<div class="intro"><h1>Pick a look for each part of the site</h1>' +
    '<p>Each card below is a live mock-up built from the lab\'s real people, papers, news and copy. Choose one variant per part, add a note if you like, and open Preview to see whole pages built from your picks. Picks save by themselves.</p>' +
    '<div class="legend"><span><span class="tag">Current</span> what the site does today, cleaned up</span><span><span class="tag is-suggested">Suggested</span> my recommendation</span><span>Colour mode of the mock-ups: switch Dark and Light at the top</span></div></div>';
}

function renderPickView() {
  const host = $('#view-pick');
  let html = introHtml();
  GROUPS.forEach((g) => {
    const cs = PICKER.choices.filter((c) => c.group === g.id);
    if (!cs.length) return;
    html += '<h2 class="group-title" id="g-' + g.id + '">' + g.title + '</h2><p class="pv-note">' + g.blurb + '</p>' + cs.map((c) => choiceHtml(c) + PICKER.lists.filter((l) => l.after === c.id).map(listHtml).join('')).join('');
  });
  html += summaryHtml();
  host.innerHTML = html;
  postRender(host);
  updateChrome();
}

function postRender(root) {
  applyScopeAll(root);
  fitStages(root);
  hydrateCanvases(root);
}

function rerenderChoice(id) {
  const c = PICKER.byId[id];
  const sec = document.getElementById('c-' + id);
  if (!sec) return;
  const grid = sec.querySelector('.vgrid');
  grid.innerHTML = gridHtml(c);
  postRender(grid);
}

/* ---- rail and chrome status ----------------------------------------------- */

function renderRail() {
  let html = '<p class="rail-count" id="railcount"></p>';
  GROUPS.forEach((g) => {
    const cs = PICKER.choices.filter((c) => c.group === g.id);
    if (!cs.length) return;
    html += '<h3>' + g.title + '</h3>' + cs.map((c) => {
      const k = decidedKey(c);
      return '<button type="button" data-goto="c-' + c.id + '" title="' + (k ? 'Picked ' + k : 'Not decided; suggested ' + suggestedKey(c)) + '"><span class="rl-letter' + (k ? ' is-picked' : '') + '">' + (k || suggestedKey(c)) + '</span><span class="rl-title">' + esc(c.title) + '</span></button>' +
        PICKER.lists.filter((l) => l.after === c.id).map((l) => '<button type="button" data-goto="c-' + l.id + '" title="Checklist"><span class="rl-letter' + (listDecided(l) ? ' is-picked' : '') + '">&#10003;</span><span class="rl-title">' + esc(l.title) + '</span></button>').join('');
    }).join('');
  });
  html += '<h3>Overview</h3><button type="button" data-goto="summary"><span class="rl-letter">=</span><span class="rl-title">Summary</span></button>';
  $('#rail').innerHTML = html;
  updateChrome();
}

function updateChrome() {
  const n = decidedCount(), m = totalCount();
  const rc = $('#railcount');
  if (rc) rc.textContent = n + ' of ' + m + ' decided';
  const sc = $('#sumcount');
  if (sc) sc.textContent = n + ' of ' + m + ' decided';
  const sb = $('#sumbody');
  if (sb) sb.innerHTML = summaryRows();
  PICKER.choices.forEach((c) => {
    const el = document.querySelector('[data-cstate="' + c.id + '"]');
    if (el) el.textContent = choiceStateText(c);
    document.querySelectorAll('.vcard[data-choice="' + c.id + '"]').forEach((card) => {
      const picked = decidedKey(c) === card.getAttribute('data-key');
      card.classList.toggle('is-picked', picked);
      const b = card.querySelector('[data-pick]');
      b.setAttribute('aria-pressed', String(picked));
      b.textContent = picked ? 'Picked' : 'Pick ' + card.getAttribute('data-key');
    });
  });
  PICKER.lists.forEach((l) => {
    const el = document.querySelector('[data-lstatus="' + l.id + '"]');
    if (el) el.textContent = listDecided(l) ? 'Changed by you.' : 'Defaults, not decided. The mock-ups use the defaults.';
  });
  $('#mode-dark').setAttribute('aria-pressed', String(PICKER.mode === 'dark'));
  $('#mode-light').setAttribute('aria-pressed', String(PICKER.mode === 'light'));
}

/* ---- picking -------------------------------------------------------------- */

function afterPickChange(c) {
  if (c.group === 'foundation') {
    if (c.id === 'theme' && !PICKER.modeUser) PICKER.mode = modeFromTheme(effPick('theme'));
    applyScopeAll(document);
    if (c.id === 'type') hydrateCanvases(document);
    fitStages(document);
  }
  (c.affects || []).forEach(rerenderChoice);
  if (document.getElementById('app').getAttribute('data-view') === 'preview') renderPreview();
  renderRail();
  changed();
}

function setPick(id, key) {
  const c = PICKER.byId[id];
  bagOf(c)[id] = key;
  PICKER.state.decided[id] = true;
  afterPickChange(c);
}

function clearPick(id) {
  const c = PICKER.byId[id];
  delete bagOf(c)[id];
  delete PICKER.state.decided[id];
  afterPickChange(c);
}

function afterListChange(l) {
  PICKER.state.decided[l.id] = true;
  const sec = document.getElementById('c-' + l.id);
  if (sec) { sec.outerHTML = listHtml(l); const fresh = document.getElementById('c-' + l.id); postRender(fresh); }
  (l.affects || []).forEach(rerenderChoice);
  if (document.getElementById('app').getAttribute('data-view') === 'preview') renderPreview();
  renderRail();
  changed();
}

function setListState(listId, itemId, state) {
  const l = PICKER.listById[listId];
  const arr = PICKER.state[l.bag].filter((e) => e.indexOf(itemId + ':') !== 0);
  arr.push(itemId + ':' + state);
  PICKER.state[l.bag] = arr;
  afterListChange(l);
}

function setFallback(key) {
  PICKER.state.cardFallback = key;
  afterListChange(PICKER.listById.cardFields);
}

function resetList(listId) {
  const l = PICKER.listById[listId];
  PICKER.state[l.bag] = [];
  if (l.radio) PICKER.state.cardFallback = '';
  delete PICKER.state.decided[l.id];
  const sec = document.getElementById('c-' + l.id);
  if (sec) { sec.outerHTML = listHtml(l); postRender(document.getElementById('c-' + l.id)); }
  (l.affects || []).forEach(rerenderChoice);
  if (document.getElementById('app').getAttribute('data-view') === 'preview') renderPreview();
  renderRail();
  changed();
}

function setMode(m, byUser) {
  PICKER.mode = m;
  if (byUser) PICKER.modeUser = true;
  applyScopeAll(document);
  fitStages(document);
  updateChrome();
}

/* ---- preview view ----------------------------------------------------------- */

function renderPreview() {
  const host = $('#view-preview');
  const phone = PICKER.width === 'phone';
  const page = PREVIEW_PAGES.find((p) => p.id === PICKER.page) || PREVIEW_PAGES[0];
  const ctx = makeCtx({}, { phone, preview: true });
  const open = totalCount() - decidedCount();
  const pageTabs = PREVIEW_PAGES.map((p) => '<button type="button" data-page="' + p.id + '" aria-pressed="' + (p.id === page.id) + '">' + p.label + '</button>').join('');
  const body = phone ? phoneFrame(page.render(ctx, true), {}) : stage(page.render(ctx, false), 1200, {});
  host.innerHTML = '<div class="pv-bar"><div class="seg" role="group" aria-label="Page">' + pageTabs + '</div>' +
    '<div class="seg" role="group" aria-label="Width"><button type="button" data-width="desktop" aria-pressed="' + !phone + '">Desktop</button><button type="button" data-width="phone" aria-pressed="' + phone + '">Phone</button></div>' +
    '<span class="pv-note">' + (open ? open + ' of ' + totalCount() + ' choices are not decided yet; those parts show the suggested variant or the default.' : 'Every choice is decided.') + '</span></div>' +
    '<div class="pv-stage' + (phone ? ' is-phone' : '') + '">' + body + '</div>';
  postRender(host);
}

/* ---- routing ---------------------------------------------------------------- */

function route() {
  const h = (location.hash || '').replace('#', '');
  const view = h === 'preview' ? 'preview' : 'pick';
  const app = $('#app');
  app.setAttribute('data-view', view);
  $('#view-pick').hidden = view !== 'pick';
  $('#view-preview').hidden = view !== 'preview';
  if (view === 'preview') renderPreview(); else fitStages($('#view-pick'));
  app.classList.remove('rail-open');
  $('#btn-rail').setAttribute('aria-expanded', 'false');
}

function gotoId(id) {
  const go = () => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if ($('#app').getAttribute('data-view') !== 'pick') {
    location.hash = '#pick';
    setTimeout(go, 60);
  } else go();
  $('#app').classList.remove('rail-open');
  $('#btn-rail').setAttribute('aria-expanded', 'false');
}

/* ---- toast, copy ------------------------------------------------------------ */

let _toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

function showJson(text) {
  const box = $('#jsonbox');
  if ($('#app').getAttribute('data-view') !== 'pick') location.hash = '#pick';
  box.hidden = false; box.textContent = text;
  box.scrollIntoView({ block: 'center' });
  try {
    const r = document.createRange(); r.selectNodeContents(box);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  } catch (e) { /* selection is a courtesy */ }
}

function copyChoices() {
  const text = JSON.stringify(exportState(), null, 2);
  let p;
  try { p = navigator.clipboard.writeText(text); } catch (e) { p = Promise.reject(e); }
  p.then(() => toast('Choices copied as JSON'), () => { showJson(text); toast('Copying is blocked here. The JSON is selected in the summary.'); });
}

/* ---- saving ------------------------------------------------------------------- */

const Store = { db: null, loaded: false, canWrite: true, timer: 0, inflight: false, pending: false, last: '', retry: 0 };

function serial() {
  const s = Object.assign({}, PICKER.state);
  delete s.updatedAt;
  return JSON.stringify(s);
}

function setStatus(kind) {
  const el = $('#savestate');
  if (!el) return;
  const text = {
    loading: 'Loading', saved: 'Saved to the page', saving: 'Saving',
    local: 'Saved in this browser only', warn: 'Could not reach the store; kept in this browser',
    readonly: 'Read-only: picks stay in this browser',
  }[kind] || kind;
  el.textContent = text;
  el.setAttribute('data-s', kind);
}

function localSave() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(PICKER.state)); } catch (e) { /* storage may be blocked */ }
}
function localLoad() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function changed() {
  PICKER.state.updatedAt = new Date().toISOString();
  localSave();
  if (Store.db && Store.loaded && Store.canWrite) schedule();
  else setStatus(Store.db && Store.loaded ? 'readonly' : Store.db ? 'warn' : 'local');
}

function schedule() {
  clearTimeout(Store.timer);
  setStatus('saving');
  Store.timer = setTimeout(flush, 900);
}

async function flush() {
  if (Store.inflight) { Store.pending = true; return; }
  const body = serial();
  if (body === Store.last) { setStatus('saved'); return; }
  Store.inflight = true;
  try {
    await Store.db.doc('choices/main').set(JSON.parse(JSON.stringify(PICKER.state)));
    Store.last = body;
    setStatus('saved');
  } catch (e) {
    setStatus('warn');
    clearTimeout(Store.retry);
    Store.retry = setTimeout(() => { if (serial() !== Store.last) schedule(); }, 15000);
  }
  Store.inflight = false;
  if (Store.pending) { Store.pending = false; schedule(); }
}

function adopt(raw) {
  PICKER.state = sanitizeState(raw);
  if (!PICKER.modeUser) PICKER.mode = modeFromTheme(effPick('theme'));
  const y = window.scrollY;
  renderRail();
  renderPickView();
  if ($('#app').getAttribute('data-view') === 'preview') renderPreview();
  window.scrollTo(0, y);
}

async function initStore(attempt) {
  const lc = window.claude;
  if (!lc || typeof lc.use !== 'function') { setStatus('local'); return; }
  let db = null, user = null;
  try { db = await Promise.race([lc.use('db'), sleep(10000, null)]); } catch (e) { db = null; }
  try { user = await Promise.race([lc.use('user'), sleep(5000, null)]); } catch (e) { user = null; }
  if (!db) { setStatus('local'); return; }
  Store.db = db;
  try { if (user && typeof user.can === 'function' && user.can('data.write') === false) Store.canWrite = false; } catch (e) { /* unknown means try */ }
  let snap = null;
  try { snap = await Promise.race([db.doc('choices/main').get(), sleep(10000, null)]); } catch (e) { snap = null; }
  if (!snap) {
    setStatus('warn');
    if ((attempt || 0) < 3) setTimeout(() => initStore((attempt || 0) + 1), 20000);
    return;
  }
  const local = PICKER.state;
  let adopted = false;
  if (snap.exists) {
    const remote = JSON.parse(JSON.stringify(snap.data()));
    if ((remote.updatedAt || '') >= (local.updatedAt || '')) { adopt(remote); adopted = true; }
  }
  Store.loaded = true;
  Store.last = adopted ? serial() : '';
  if (!Store.canWrite) { setStatus('readonly'); return; }
  if (!adopted && (decidedCount() > 0 || Object.keys(PICKER.state.notes).length)) schedule(); else setStatus('saved');
}

/* ---- events ------------------------------------------------------------------ */

function onClick(e) {
  const t = e.target;
  const inStage = t.closest('.stage');
  if (inStage) {
    e.preventDefault();
    const menu = t.closest('[data-act="menu"]');
    if (menu) { const pn = menu.closest('.mk-pn'); if (pn) pn.classList.toggle('is-open'); fitStages(document); }
    const rp = t.closest('[data-act="replay"]');
    if (rp) {
      const demo = rp.closest('.mk-demo');
      if (demo) { demo.classList.remove('go'); void demo.offsetWidth; demo.classList.add('go'); }
    }
    return;
  }
  const ls = t.closest('[data-lstate]');
  if (ls) { setListState(ls.getAttribute('data-list'), ls.getAttribute('data-item'), ls.getAttribute('data-state')); return; }
  const lr = t.closest('[data-lradio]');
  if (lr) { setFallback(lr.getAttribute('data-lradio')); return; }
  const lz = t.closest('[data-lreset]');
  if (lz) { resetList(lz.getAttribute('data-lreset')); return; }
  const pick = t.closest('.vcard');
  if (pick && !t.closest('textarea')) { setPick(pick.getAttribute('data-choice'), pick.getAttribute('data-key')); return; }
  const g = t.closest('[data-goto]');
  if (g) { gotoId(g.getAttribute('data-goto')); return; }
  const cl = t.closest('[data-clear]');
  if (cl) { clearPick(cl.getAttribute('data-clear')); return; }
  if (t.closest('[data-copy]') || t.closest('#btn-copy')) { copyChoices(); return; }
  if (t.closest('#mode-dark')) { setMode('dark', true); if ($('#app').getAttribute('data-view') === 'preview') renderPreview(); return; }
  if (t.closest('#mode-light')) { setMode('light', true); if ($('#app').getAttribute('data-view') === 'preview') renderPreview(); return; }
  const pg = t.closest('[data-page]');
  if (pg) { PICKER.page = pg.getAttribute('data-page'); renderPreview(); return; }
  const wd = t.closest('[data-width]');
  if (wd) { PICKER.width = wd.getAttribute('data-width'); renderPreview(); return; }
  if (t.closest('#btn-rail')) {
    const app = $('#app');
    const open = !app.classList.contains('rail-open');
    app.classList.toggle('rail-open', open);
    $('#btn-rail').setAttribute('aria-expanded', String(open));
  }
}

let _noteTimer = 0;
function onInput(e) {
  const ta = e.target.closest ? e.target.closest('textarea[data-note]') : null;
  if (!ta) return;
  const id = ta.getAttribute('data-note');
  const v = ta.value.slice(0, 2000);
  if (v) PICKER.state.notes[id] = v; else delete PICKER.state.notes[id];
  clearTimeout(_noteTimer);
  _noteTimer = setTimeout(() => { changed(); const sb = $('#sumbody'); if (sb) sb.innerHTML = summaryRows(); }, 500);
}

function measureTopbar() {
  const tb = $('.topbar');
  if (tb) document.getElementById('app').style.setProperty('--topbar-h', tb.offsetHeight + 'px');
}

function boot() {
  const local = localLoad();
  PICKER.state = sanitizeState(local);
  PICKER.mode = modeFromTheme(effPick('theme'));
  renderRail();
  renderPickView();
  route();
  measureTopbar();
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', measureTopbar);
  setStatus('loading');
  initStore(0);
}

if (HAS_DOM) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
