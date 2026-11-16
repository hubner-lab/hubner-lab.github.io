#!/usr/bin/env node
// Draws the static map of the Contact page from OpenStreetMap's standard tiles.
//
//   node scripts/contact-map.mjs                  # writes the three files below
//   node scripts/contact-map.mjs --dry-run        # says which tiles it would fetch, fetches nothing
//   node scripts/contact-map.mjs --zoom 16 --out /tmp/try    # a look at another zoom, in a folder of your own
//
// It reads the point and the zoom from src/site.config.ts (`site.map`), fetches the few tiles
// around the point, joins them and writes into src/assets/contact/
//
//   map-1x.png   the picture as large as the page shows it, for a plain screen
//   map-2x.png   the same ground twice as large, for a dense screen (a phone, most laptops)
//   map.json     what the pictures show: the point, the zoom, their sizes, the day
//
// The point is the exact centre of both pictures: the Contact page puts its pin there and prints
// the credit. tests/site/contact.test.mjs compares map.json with site.config.ts, so a point that is
// changed there without new pictures fails the tests. Nothing runs this in the build: run it by
// hand when the place changes, look at the pictures, commit the three files. With --out only the
// pictures are written, into that folder, and nothing in src/ is touched.
//
// Why two pictures and not one that the browser scales. The tiles are drawings with their
// lettering baked in, made for one size. The plain picture is cut from the tiles of the zoom
// itself, so its street names are as large as on openstreetmap.org. The dense picture is cut
// from the tiles one level deeper and shown at half their size: twice the detail and sharp, with
// smaller names. Scaling either one to stand in for the other gives a blurred map or names too
// small to read.
//
// The tile server asks for few requests and for a User-Agent that says what is asking
// (https://operations.osmfoundation.org/policies/tiles/). This fetches about two dozen tiles,
// one at a time, and sends no name and no address of anybody.
// Needs Node 22.18 or newer (it imports a TypeScript file) and the project's packages (sharp).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { site } from '../src/site.config.ts';

/** The size the page shows the map at, in CSS px. src/pages/contact.astro lays it out so. */
export const SHOWN = { width: 600, height: 300 };
/** Picture px per CSS px: one picture for each. */
export const SCALES = [1, 2];
const TILE = 256;
const SERVER = 'https://tile.openstreetmap.org';
const USER_AGENT = 'contact-map-script/1.0 (draws one static map image; run by hand, about 24 tiles)';
const CREDIT = '© OpenStreetMap contributors';

/** Where a point lies on the world map of one zoom level, in px from its top left corner. */
export function project(lat, lon, zoom) {
  const n = 2 ** zoom * TILE;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n,
  };
}

/**
 * The frame of a picture of `width` x `height` px with the point in its centre: its top left
 * corner on the world map of `tileZoom`, and the tiles it touches.
 */
export function frame(lat, lon, tileZoom, width, height) {
  const centre = project(lat, lon, tileZoom);
  const left = Math.round(centre.x - width / 2);
  const top = Math.round(centre.y - height / 2);
  const x0 = Math.floor(left / TILE), x1 = Math.floor((left + width - 1) / TILE);
  const y0 = Math.floor(top / TILE), y1 = Math.floor((top + height - 1) / TILE);
  const tiles = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { left, top, x0, x1, y0, y1, tiles };
}

/** The pictures to draw for one zoom: a file name, a size in px and a frame for each scale. */
export function pictures(lat, lon, zoom) {
  return SCALES.map((scale) => {
    const tileZoom = zoom + Math.log2(scale);
    const width = SHOWN.width * scale, height = SHOWN.height * scale;
    return { file: `map-${scale}x.png`, scale, width, height, tileZoom, ...frame(lat, lon, tileZoom, width, height) };
  });
}

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function draw(p) {
  const layers = [];
  for (const { x, y } of p.tiles) {
    const url = `${SERVER}/${p.tileZoom}/${x}/${y}.png`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/png')) throw new Error(`${url} sent ${type || 'no content type'}, not a PNG tile`);
    layers.push({ input: Buffer.from(await res.arrayBuffer()), left: (x - p.x0) * TILE, top: (y - p.y0) * TILE });
    await new Promise((done) => setTimeout(done, 150)); // one tile at a time, unhurried
  }
  const cols = p.x1 - p.x0 + 1, rows = p.y1 - p.y0 + 1;
  const mosaic = await sharp({ create: { width: cols * TILE, height: rows * TILE, channels: 3, background: '#f2efe9' } })
    .composite(layers)
    .png()
    .toBuffer();
  return sharp(mosaic)
    .extract({ left: p.left - p.x0 * TILE, top: p.top - p.y0 * TILE, width: p.width, height: p.height })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const zoom = Number(option('zoom') ?? site.map.zoom);
  const out = option('out');
  if (!Number.isInteger(zoom) || zoom < 1 || zoom > 18) throw new Error(`zoom must be a whole number from 1 to 18, got ${zoom}`);

  const { lat, lon } = site.map;
  const list = pictures(lat, lon, zoom);
  console.log(`point ${lat}, ${lon}; zoom ${zoom}`);
  for (const p of list) {
    console.log(`  ${p.file}: ${p.width} x ${p.height} px from ${p.tiles.length} tiles of zoom ${p.tileZoom} (x ${p.x0} to ${p.x1}, y ${p.y0} to ${p.y1})`);
  }
  if (dryRun) return;

  const dir = out ? path.resolve(out) : fileURLToPath(new URL('../src/assets/contact/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const p of list) {
    const picture = await draw(p);
    writeFileSync(path.join(dir, p.file), picture);
    console.log(`wrote ${path.join(dir, p.file)} (${(picture.length / 1024).toFixed(0)} KB)`);
  }
  if (out) return;

  const about = {
    lat, lon, zoom,
    shown: SHOWN,
    pictures: list.map((p) => ({
      file: p.file, scale: p.scale, width: p.width, height: p.height,
      tiles: `zoom ${p.tileZoom}, x ${p.x0} to ${p.x1}, y ${p.y0} to ${p.y1}`,
    })),
    source: SERVER,
    fetched: new Date().toISOString().slice(0, 10),
    credit: CREDIT,
  };
  writeFileSync(path.join(dir, 'map.json'), JSON.stringify(about, null, 2) + '\n');
  console.log(`wrote ${path.join(dir, 'map.json')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`contact-map: ${error.message}`);
    process.exit(1);
  });
}
