// node scripts/social-image.mjs <screenshot.png>
//
// Writes the picture a shared link to the site shows (public/og.jpg; src/site.config.ts names
// it as `socialImage`) from a screenshot of design/social/card.html. The screenshot must have
// exactly the size the config states, 1200 x 630 px. The JPEG is written at the highest quality
// that keeps the file within the image limit of the site, 80 KB.
//
// How to take the screenshot: README.md, "The social image". Needs Node 22.18 or newer.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { site } from '../src/site.config.ts';

/** The image limit of the site, as tests/site/budget.test.mjs holds it. */
export const LIMIT = 80 * 1024;
const QUALITIES = { from: 88, to: 50, step: 2 };

/** The JPEG of the highest quality within the limit, or null when even the lowest is over. */
export async function encode(input, limit = LIMIT) {
  for (let quality = QUALITIES.from; quality >= QUALITIES.to; quality -= QUALITIES.step) {
    const data = await sharp(input).flatten({ background: '#000000' }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (data.length <= limit) return { data, quality };
  }
  return null;
}

async function main() {
  const [input] = process.argv.slice(2);
  if (!input) {
    console.error('usage: node scripts/social-image.mjs <screenshot.png>');
    process.exit(2);
  }
  const { width, height, path: served } = site.socialImage;
  const meta = await sharp(input).metadata();
  if (meta.width !== width || meta.height !== height) {
    console.error(`${input} is ${meta.width} x ${meta.height} px; the social image is ${width} x ${height} px`);
    process.exit(1);
  }
  const result = await encode(input);
  if (!result) {
    console.error(`over ${LIMIT} bytes even at quality ${QUALITIES.to}: simplify the picture`);
    process.exit(1);
  }
  const out = fileURLToPath(new URL(`../public${served}`, import.meta.url));
  await writeFile(out, result.data);
  console.log(`public${served}: ${result.data.length} bytes at quality ${result.quality} (limit ${LIMIT})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
