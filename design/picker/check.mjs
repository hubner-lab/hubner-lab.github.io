#!/usr/bin/env node
// Checks the built design picker (dist/picker.html):
//   - under 16 MB, no doctype/html/head/body wrapper, <title> first
//   - the inline script parses and runs without a DOM
//   - every choice has a "current" variant and at least one alternative, a Suggested
//     mark, unique keys, and every variant renders non-empty HTML for every view
//   - every palette text colour reaches 4.5:1 on paper and on surface
//   - no URL points outside fonts.googleapis.com, fonts.gstatic.com, cdnjs.cloudflare.com
//   - no emoji
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, 'dist', 'picker.html');
const problems = [];
const fail = (m) => problems.push(m);

if (!fs.existsSync(file)) {
  console.error('check.mjs: dist/picker.html is missing; run build.py first');
  process.exit(1);
}
const html = fs.readFileSync(file, 'utf8');
const bytes = Buffer.byteLength(html);
if (bytes > 16 * 1024 * 1024) fail(`page is ${(bytes / 1048576).toFixed(2)} MB, over 16 MB`);

// Shape of the artifact body
if (!/^<title>[^<]+<\/title>/.test(html)) fail('page must start with <title>');
if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)) fail('artifact body must not contain doctype, html, head or body tags');
if (html.indexOf('<style>') < 0 || html.indexOf('<style>') > html.indexOf('<div id="app"')) fail('<style> must come before the markup');

// Script parses and runs
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) fail(`expected one inline script, found ${scripts.length}`);
const code = scripts[0] || '';
try { new vm.Script(code); } catch (e) { fail('script does not parse: ' + e.message); }

let api = null;
try {
  const ctx = vm.createContext({ console });
  api = vm.runInContext(code + '\n;({ PICKER, PALETTES, PALETTE_ORDER, minTextContrast, makeCtx, SITE })', ctx);
} catch (e) {
  fail('script does not run without a DOM: ' + e.message);
}

if (api) {
  const { PICKER, PALETTES, minTextContrast, makeCtx } = api;
  PICKER.state = null;
  const ids = PICKER.choices.map((c) => c.id);
  if (!ids.length) fail('no choices registered');
  for (const c of PICKER.choices) {
    const where = `choice "${c.id}"`;
    if (!c.title || !c.problem) fail(`${where}: title and problem are required`);
    if (!['foundation', 'element'].includes(c.group)) fail(`${where}: bad group`);
    if (!Array.isArray(c.views) || !c.views.length) fail(`${where}: no views`);
    const keys = c.variants.map((v) => v.key);
    if (new Set(keys).size !== keys.length) fail(`${where}: duplicate variant keys`);
    if (c.variants.length < 2) fail(`${where}: needs a "current" variant and at least one alternative`);
    if (!c.variants.some((v) => v.current)) fail(`${where}: no variant is marked current`);
    if (!c.variants.some((v) => v.suggested)) fail(`${where}: no variant is marked suggested`);
    if (c.variants.filter((v) => v.suggested).length > 1) fail(`${where}: more than one suggested variant`);
    for (const v of c.variants) {
      if (!v.label || !v.rationale) fail(`${where} ${v.key}: label and rationale are required`);
      for (const view of c.views) {
        for (const mode of ['dark', 'light']) {
          try {
            PICKER.mode = mode;
            const out = v.render(makeCtx({ [c.id]: v.key }, {}), view);
            if (typeof out !== 'string' || out.length < 40) fail(`${where} ${v.key}: render returned too little`);
            if (/href="#/.test(out)) fail(`${where} ${v.key}: a mock-up link would change the page hash`);
          } catch (e) {
            fail(`${where} ${v.key}: render threw ${e.message}`);
          }
        }
      }
    }
  }
  const bags = new Set();
  for (const l of PICKER.lists) {
    const where = `list "${l.id}"`;
    if (!l.title || !l.problem) fail(`${where}: title and problem are required`);
    if (!ids.includes(l.after)) fail(`${where}: "after" must name a choice`);
    if (bags.has(l.bag)) fail(`${where}: bag ${l.bag} used twice`);
    bags.add(l.bag);
    if (!['cardFields', 'pubTools', 'additions'].includes(l.bag)) fail(`${where}: unknown bag ${l.bag}`);
    const itemIds = l.items.map((i) => i.id);
    if (new Set(itemIds).size !== itemIds.length) fail(`${where}: duplicate item ids`);
    for (const it of l.items) {
      if (!l.states.includes(it.def)) fail(`${where} ${it.id}: default "${it.def}" is not one of its states`);
      if (!it.label || !it.why) fail(`${where} ${it.id}: label and why are required`);
    }
    for (const st of l.states) if (!l.stateLabels[st]) fail(`${where}: no label for state ${st}`);
    for (const a of l.affects || []) if (!ids.includes(a)) fail(`${where}: affects unknown choice ${a}`);
  }
  for (const c of PICKER.choices) for (const a of c.affects || []) if (!ids.includes(a)) fail(`choice "${c.id}": affects unknown choice ${a}`);
  for (const [k, pal] of Object.entries(PALETTES)) {
    for (const mode of ['dark', 'light']) {
      const m = minTextContrast(pal[mode]);
      if (m < 4.5) fail(`palette ${k} ${mode}: weakest text contrast ${m.toFixed(2)}:1, below 4.5:1`);
    }
  }
  console.log(`${PICKER.lists.length} lists, ${PICKER.choices.length} choices, ${PICKER.choices.reduce((n, c) => n + c.variants.length, 0)} variants, ${Object.keys(PALETTES).length} palettes checked`);
}

// Allowed hosts, in every URL context
const allowed = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com']);
const urls = new Set();
for (const m of html.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)) urls.add(m[0].replace(/&amp;/g, '&'));
for (const u of urls) {
  let host = '';
  try { host = new URL(u).host; } catch { host = u; }
  if (!allowed.has(host)) fail(`URL outside the allowed hosts: ${u.slice(0, 100)}`);
}
for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const u = m[1];
  if (/^(https?:|\/\/)/.test(u)) continue; // covered above
  if (u.startsWith('#') && !['#pick', '#preview'].includes(u)) fail(`unexpected in-page link ${u}`);
  if (/^(mailto:|tel:|ftp:|file:)/.test(u)) fail(`link scheme not usable inside an artifact: ${u}`);
}
if (/\bfetch\(|XMLHttpRequest|WebSocket|importScripts/.test(code)) fail('script makes a network call');

// No emoji
if (/\p{Extended_Pictographic}/u.test(html)) fail('page contains an emoji');

if (problems.length) {
  console.error('check.mjs: ' + problems.length + ' problem(s)');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check.mjs: ok (${(bytes / 1048576).toFixed(2)} MB, ${urls.size} external URL(s), all on allowed hosts)`);
