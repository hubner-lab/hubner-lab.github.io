/**
 * TixyCanvas — "Hübner Lab" dot-grid wordmark.
 *
 *   Larger dots masked to the text "Hübner Lab", deep botanical palette,
 *   orbital ripple + diagonal color sweep. Each word ("Hübner", "Lab")
 *   has its own phase offset so they pulse slightly out of sync. The
 *   canvas is transparent except the wordmark dots, so whatever is
 *   placed behind it shows through.
 *
 *   Two layouts, chosen with `layout`:
 *   - 'hero' (default): the two words large in the upper part of a canvas
 *     that fills its box, on a soft dark plate.
 *   - 'strip': one line of small dots. The canvas takes the size of the
 *     line, never wider than its parent; the cells around the letters show
 *     as faint dots, like an unlit display, and there is no plate.
 *
 *   A visitor who asked for reduced motion gets one still frame.
 */

export interface TixyCanvasOptions {
  canvas: HTMLCanvasElement;
  text?: string;         // strip: the words, each on its own phase (default "Hübner Lab"); hero: unused
  cols?: number;         // hero: most grid columns (default 140)
  rows?: number;         // hero: most grid rows (default 40); strip: its height in cells (default 22)
  wordSpeed?: number;    // wordmark time increment (default 0.012)
  ambientSpeed?: number; // (unused)
  cell?: number;         // size of one dot cell in CSS px (default 9)
  layout?: 'hero' | 'strip';
}

// ── Palettes ────────────────────────────────────────────────────────────────
// Wordmark: dark forest green → leaf green → lime → soft straw
// Deeper, darker plant-green range to correspond with the warm dark theme;
// yellow end present but calmer than the previous neon straw.
const WORDMARK_COLORS: [number, number, number][] = [
  [ 65, 130,  28],  // #41821C bright forest green
  [ 62, 139,  30],  // #3E8B1E leaf green
  [143, 181,  46],  // #8FB52E lime
  [232, 210,  58],  // #E8D23A soft straw
];

// ── Responsive grid ──────────────────────────────────────────────────────────
/** Dot-cell size in CSS px when the caller gives none — drives adaptive col/row count on resize. */
const TARGET_CELL_PX = 9;
/** Glow around the dots in px, at the default cell size; it scales with the cell. */
const GLOW_PX = 14;

// ── Helpers ─────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

/** Three-stop palette lerp. h ∈ [0,1]. */
function palette(stops: [number, number, number][], h: number): string {
  const hc = Math.max(0, Math.min(0.9999, h));
  const seg = hc * (stops.length - 1);
  const i   = Math.floor(seg);
  const f   = seg - i;
  const [r, g, b] = lerpColor(stops[i], stops[i + 1], f);
  return `rgb(${r},${g},${b})`;
}

// ── Per-word text mask ──────────────────────────────────────────────────────
interface WordMask {
  mask: Float32Array;   // length cols*rows, values 0..1
  phase: number;        // time offset for this word
  cxGrid: number;       // mean x-index of the word (for center-based math)
  cyGrid: number;       // mean y-index
}

/**
 * Rasterize one word centered at (xRatio, yRatio) of the high-res canvas,
 * then downsample to the cols×rows grid by averaging pixel alpha per cell.
 */
/**
 * The font of the wordmark: the site's display typeface, read from the `--font-display` token,
 * so the dots follow the typeface the pages use.
 */
function wordFont(px: number): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
  return `700 ${px}px ${family || 'Georgia, serif'}`;
}

async function buildWordMask(
  word: string,
  cols: number,
  rows: number,
  canvasW: number,
  canvasH: number,
  xRatio: number,
  yRatio: number,
  fontSize: number,
  phase: number,
  place: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline; stroke?: number } = {},
): Promise<WordMask> {
  const W = canvasW;
  const H = canvasH;

  const offscreen = document.createElement('canvas');
  offscreen.width  = W;
  offscreen.height = H;
  const mctx = offscreen.getContext('2d', { willReadFrequently: true })!;
  mctx.clearRect(0, 0, W, H);

  mctx.font = wordFont(fontSize);
  mctx.textAlign    = place.align ?? 'center';
  mctx.textBaseline = place.baseline ?? 'middle';
  mctx.fillStyle    = 'white';
  mctx.fillText(word, W * xRatio, H * yRatio);
  if (place.stroke) {
    // A thin outline keeps small letters from breaking up into too few dots.
    mctx.lineWidth   = place.stroke;
    mctx.lineJoin    = 'round';
    mctx.strokeStyle = 'white';
    mctx.strokeText(word, W * xRatio, H * yRatio);
  }

  const imageData = mctx.getImageData(0, 0, W, H).data;

  const cellW = W / cols;
  const cellH = H / rows;
  const mask = new Float32Array(cols * rows);
  let sumX = 0, sumY = 0, sumW = 0;

  for (let yi = 0; yi < rows; yi++) {
    for (let xi = 0; xi < cols; xi++) {
      const x0 = Math.floor(xi * cellW);
      const x1 = Math.floor((xi + 1) * cellW);
      const y0 = Math.floor(yi * cellH);
      const y1 = Math.floor((yi + 1) * cellH);
      let sum = 0, count = 0;
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          sum += imageData[(py * W + px) * 4 + 3];
          count++;
        }
      }
      const m = count > 0 ? sum / count / 255 : 0;
      mask[yi * cols + xi] = m;
      if (m > 0.1) {
        sumX += xi * m;
        sumY += yi * m;
        sumW += m;
      }
    }
  }

  return {
    mask,
    phase,
    cxGrid: sumW > 0 ? sumX / sumW : cols / 2,
    cyGrid: sumW > 0 ? sumY / sumW : rows / 2,
  };
}

/**
 * Pre-measure the two words so they don't overlap when rendered.
 * Returns per-word xRatio (center point) and the shared fontSize.
 *
 * On narrow viewports (< 640 px wide) the words stack vertically so each
 * word fills the canvas width — roughly doubles the per-letter dot count
 * and keeps the wordmark readable on portrait phones.
 */
async function prepareWordMasks(
  cols: number,
  rows: number,
  canvasW: number,
  canvasH: number,
): Promise<WordMask[]> {
  // ── Stacked layout (mobile: portrait phones) ────────────────────────────
  if (canvasW < 640) {
    let fontSize = Math.floor(canvasH * 0.30); // two lines → smaller per-line budget
    await document.fonts.load(wordFont(fontSize), 'Hübner Lab');

    const tmp = document.createElement('canvas').getContext('2d')!;
    tmp.font = wordFont(fontSize);
    let wHub     = tmp.measureText('Hübner').width;
    let wLab     = tmp.measureText('Lab').width;
    const wWidest = Math.max(wHub, wLab);

    // Fit the wider word within 90% of canvas width; scale both uniformly.
    const maxWidth = canvasW * 0.90;
    if (wWidest > maxWidth) {
      fontSize = Math.floor(fontSize * (maxWidth / wWidest));
      tmp.font = wordFont(fontSize);
      wHub = tmp.measureText('Hübner').width; // re-measure (for consistency)
    }

    // Both words horizontally centered; placed in the upper sky band.
    // yHub ≈ 0.24, yLab ≈ 0.50 — clear of the bottom tagline (absolute bottom-10).
    const yHub = 0.24;
    const yLab = 0.50;

    const [hub, lab] = await Promise.all([
      buildWordMask('Hübner', cols, rows, canvasW, canvasH, 0.5, yHub, fontSize, 0),
      buildWordMask('Lab',    cols, rows, canvasW, canvasH, 0.5, yLab, fontSize, Math.PI),
    ]);
    return [hub, lab];
  }

  // ── Side-by-side layout (desktop / landscape) ───────────────────────────
  let fontSize = Math.floor(canvasH * 0.40);
  await document.fonts.load(wordFont(fontSize), 'Hübner Lab');

  // Measure each word to compute natural x positions
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = wordFont(fontSize);
  let wHub = tmp.measureText('Hübner').width;
  let wLab = tmp.measureText('Lab').width;
  let gap  = fontSize * 0.35;
  let total = wHub + gap + wLab;

  // Fit-to-width clamp: fontSize is derived from canvas height, but on a wide-
  // but-short hero the wordmark can exceed the canvas width and spill past the
  // edges. measureText scales linearly with fontSize, so shrink to fit (leave
  // ~7% margin each side) and re-measure.
  const maxWidth = canvasW * 0.86;
  if (total > maxWidth) {
    fontSize = Math.floor(fontSize * (maxWidth / total));
    tmp.font = wordFont(fontSize);
    wHub  = tmp.measureText('Hübner').width;
    wLab  = tmp.measureText('Lab').width;
    gap   = fontSize * 0.35;
    total = wHub + gap + wLab;
  }

  // Left edge in pixels of the composite wordmark, centered in canvas
  const leftPx = (canvasW - total) / 2;
  const hubCenterPx = leftPx + wHub / 2;
  const labCenterPx = leftPx + wHub + gap + wLab / 2;

  const yRatio = 0.30; // center in sky portion of background video

  const [hub, lab] = await Promise.all([
    buildWordMask('Hübner', cols, rows, canvasW, canvasH,
      hubCenterPx / canvasW, yRatio, fontSize, 0),
    buildWordMask('Lab',    cols, rows, canvasW, canvasH,
      labCenterPx / canvasW, yRatio, fontSize, Math.PI),
  ]);

  return [hub, lab];
}

// ── Strip layout ────────────────────────────────────────────────────────────
interface Strip {
  cols: number;
  rows: number;
  fontPx: number;
}

/**
 * One line of text as a strip of dots. The letters are as tall as `maxRows`
 * cells allow, or smaller when the line would be wider than `room` px; two
 * cells stay free on each side. Call it once the font is loaded.
 */
function stripGeometry(text: string, cell: number, maxRows: number, room: number): Strip {
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = wordFont(100);
  const w100 = tmp.measureText(text).width || 1;              // width of the line at 100 px
  const fit  = (100 * (Math.floor(room / cell) - 4)) / w100;   // font size, in cells, that fits the room
  const size = Math.max(4, Math.min(maxRows * 0.845, fit));    // font size in cells
  return {
    cols: Math.ceil((w100 * size) / 100) + 4,
    rows: Math.ceil(size * 1.12) + 1,
    fontPx: size * cell,
  };
}

/** A mask per word of the line, each with its own phase, all on one baseline. */
function prepareStripMasks(text: string, strip: Strip, cell: number): Promise<WordMask[]> {
  const { cols, rows, fontPx } = strip;
  const W = cols * cell;
  const H = rows * cell;
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = wordFont(fontPx);
  const baseline = (fontPx * 0.9) / H;
  const masks: Promise<WordMask>[] = [];
  let at = 0;
  for (const piece of text.split(/(\s+)/)) {   // the words and the spaces between them
    if (piece.trim()) {
      const x = 2 * cell + tmp.measureText(text.slice(0, at)).width;
      masks.push(buildWordMask(piece, cols, rows, W, H, x / W, baseline, fontPx, masks.length * Math.PI,
        { align: 'left', baseline: 'alphabetic', stroke: 0.12 * cell }));
    }
    at += piece.length;
  }
  return Promise.all(masks);
}

// ── Main ────────────────────────────────────────────────────────────────────
export function startTixyCanvas(opts: TixyCanvasOptions): () => void {
  const {
    canvas,
    wordSpeed = 0.012,
  } = opts;
  const cell  = opts.cell ?? TARGET_CELL_PX;
  const strip = opts.layout === 'strip';
  const text  = (opts.text ?? 'Hübner Lab').trim();

  // Grid caps — prop values become the upper bound; actual live values shrink
  // on narrow viewports so dots stay visible (cells of about `cell` px).
  // In the strip layout `rows` is the height of the strip in cells.
  const maxCols = opts.cols ?? 140;
  const maxRows = opts.rows ?? (strip ? 22 : 40);
  let cols = maxCols;
  let rows = maxRows;

  /** Compute col/row counts giving cells of about `cell` px, capped at maxima. */
  function computeGrid(W: number, H: number): { newCols: number; newRows: number } {
    const newCols = Math.min(maxCols, Math.max(24, Math.round(W / cell)));
    const newRows = Math.min(maxRows, Math.max(8,  Math.round(H / cell)));
    return { newCols, newRows };
  }

  const ctx     = canvas.getContext('2d')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let tWord    = 0;
  let raf      = 0;
  let wordMasks: WordMask[] | null = null;

  // Dark backing plate — cached offscreen, rebuilt only when W/H/dpr change
  let plateCanvas: HTMLCanvasElement | null = null;
  let plateW = 0, plateH = 0, plateDpr = 0, plateCols = 0, plateRows = 0;

  // ── Shadow plate builder ──────────────────────────────────────────────────
  // Stamps dark dots at static (non-breathing) radius into an offscreen canvas,
  // then blurs them into one continuous soft dark halo that hugs the letterforms.
  // Built ONCE per unique (W, H, dpr) — blitted each frame with a single drawImage.
  function buildShadowPlate(masks: WordMask[], W: number, H: number, dpr: number): void {
    const cellW = W / cols;
    const cellH = H / rows;
    const maxR  = Math.min(cellW, cellH) * 0.55; // same formula as draw()
    const plateR = maxR * 1.25;                  // slightly larger than colored dots
    const blurPx = maxR * 1.6;                   // merges adjacent stamps into soft shape

    // 1) Stamp dark dots into an unblurred offscreen (device-px sized, logical-px drawn)
    const oc = document.createElement('canvas');
    oc.width  = Math.max(1, Math.round(W * dpr));
    oc.height = Math.max(1, Math.round(H * dpr));
    const octx = oc.getContext('2d')!;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in logical px like main ctx

    octx.fillStyle = 'rgba(8,12,16,0.55)';
    for (const wm of masks) {
      for (let yi = 0; yi < rows; yi++) {
        for (let xi = 0; xi < cols; xi++) {
          const m = wm.mask[yi * cols + xi];
          if (m < 0.12) continue;
          const r  = Math.max(m, 0.5) * plateR; // floor so thin strokes cast shade
          const cx = (xi + 0.5) * cellW;
          const cy = (yi + 0.5) * cellH;
          octx.beginPath();
          octx.arc(cx, cy, r, 0, Math.PI * 2);
          octx.fill();
        }
      }
    }

    // 2) Blur the stamped canvas into a continuous soft halo (true Gaussian via filter)
    const blurred = document.createElement('canvas');
    blurred.width  = oc.width;
    blurred.height = oc.height;
    const bctx = blurred.getContext('2d')!;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.filter = `blur(${blurPx}px)`;
    bctx.drawImage(oc, 0, 0, W, H); // logical dest (transform handles dpr)
    bctx.filter = 'none';           // always reset filter

    plateCanvas = blurred;
    plateW = W; plateH = H; plateDpr = dpr; plateCols = cols; plateRows = rows;
  }

  // ── Unlit layer (strip) ───────────────────────────────────────────────────
  // The cells that belong to no letter, as faint dots in the colour of the text
  // over the video (--color-on-media). They never change, so they are drawn once
  // and kept in the same cache as the plate of the hero layout.
  function buildUnlitLayer(masks: WordMask[], W: number, H: number, dpr: number): void {
    const cellW = W / cols;
    const cellH = H / rows;
    const oc = document.createElement('canvas');
    oc.width  = Math.max(1, Math.round(W * dpr));
    oc.height = Math.max(1, Math.round(H * dpr));
    const octx = oc.getContext('2d')!;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.fillStyle = 'rgba(246,241,230,0.16)';
    const r = Math.max(0.8, Math.min(cellW, cellH) * 0.1);
    for (let yi = 0; yi < rows; yi++) {
      for (let xi = 0; xi < cols; xi++) {
        if (masks.some((wm) => wm.mask[yi * cols + xi] >= 0.12)) continue;
        octx.beginPath();
        octx.arc((xi + 0.5) * cellW, (yi + 0.5) * cellH, r, 0, Math.PI * 2);
        octx.fill();
      }
    }
    plateCanvas = oc;
    plateW = W; plateH = H; plateDpr = dpr; plateCols = cols; plateRows = rows;
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  let rebuildTimer = 0;

  function resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset + scale in one call
    if (strip) return; // the strip sets its own grid, in layoutStrip()

    // Recompute adaptive grid from live canvas size.  If dimensions changed
    // AND masks already exist (not the first build), schedule a debounced
    // rebuild — font rasterisation is expensive, 200 ms debounce avoids
    // thrashing during window-resize drags.  The initial build is driven
    // by the init block below (which calls resize() first to set cols/rows).
    const { newCols, newRows } = computeGrid(rect.width, rect.height);
    if (newCols !== cols || newRows !== rows) {
      cols = newCols;
      rows = newRows;
      plateCanvas = null; // stale geometry — force shadow-plate rebuild
      const hadMasks = wordMasks !== null;
      wordMasks = null;   // clear stale masks so draw() exits early (prevents
                          // out-of-bounds when cols changed but masks haven't rebuilt yet)
      if (hadMasks) {
        clearTimeout(rebuildTimer);
        rebuildTimer = window.setTimeout(() => {
          const r = canvas.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            prepareWordMasks(cols, rows, r.width, r.height).then((masks) => {
              wordMasks = masks;
              draw();
            });
          }
        }, 200);
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    const W     = canvas.getBoundingClientRect().width;
    const H     = canvas.getBoundingClientRect().height;
    const cellW = W / cols;
    const cellH = H / rows;
    // Wordmark dots get a larger cell budget for dominance
    const maxR  = Math.min(cellW, cellH) * 0.55;

    // Transparent canvas — the wheat photo behind shows through everywhere
    // except the wordmark dots drawn below.
    ctx.clearRect(0, 0, W, H);

    if (!wordMasks) return; // nothing to draw until masks are ready

    // ── Dark backing plate (text-shaped shading) ────────────────────────
    // Rebuild only when geometry or DPR changes; blit with one drawImage per frame.
    // Plate blit happens BEFORE the glow is set so the plate itself is not glowed.
    const dpr = window.devicePixelRatio || 1;
    if (!plateCanvas || plateW !== W || plateH !== H || plateDpr !== dpr || plateCols !== cols || plateRows !== rows) {
      if (strip) buildUnlitLayer(wordMasks, W, H, dpr);
      else buildShadowPlate(wordMasks, W, H, dpr);
    }
    if (plateCanvas) ctx.drawImage(plateCanvas, 0, 0, W, H); // logical dest — DPR-safe

    // ── Wordmark — orbital ripple + color sweep ─────────────────────────
    // A focal point traces a slow elliptical orbit inside each word's bounds.
    // Concentric rings expand outward from it (radial ripple). Users track the
    // moving focal point and follow the rings — creates a "want to watch" quality.
    // Color drifts on an independent diagonal wave for decoupled visual rhythm.
    ctx.shadowColor = 'rgba(150, 200, 55, 0.42)'; // plant-green glow (matched to darker palette)
    ctx.shadowBlur  = (GLOW_PX * cell) / TARGET_CELL_PX;
    const ringK = Math.max(0.75, maxR * 0.18); // dark contour ring width

    for (const wm of wordMasks) {
      // Focal point orbits the word's centroid (different ellipse per word via phase)
      const focalX = wm.cxGrid + Math.cos(tWord * 0.35 + wm.phase) * cols * 0.14;
      const focalY = wm.cyGrid + Math.sin(tWord * 0.22 + wm.phase) * rows * 0.20;

      for (let yi = 0; yi < rows; yi++) {
        for (let xi = 0; xi < cols; xi++) {
          const m = wm.mask[yi * cols + xi];
          if (m < 0.12) continue;

          const dx = xi - wm.cxGrid;
          const dy = yi - wm.cyGrid;

          // Distance to the moving focal point — drives the expanding rings
          const dfx  = xi - focalX;
          const dfy  = yi - focalY;
          const dist = Math.sqrt(dfx * dfx + dfy * dfy);

          // Ring pulse: ~3.5 s per ring at wordSpeed=0.012
          const ring    = Math.sin(dist * 0.85 - tWord * 2.5);
          const breathe = 0.74 + 0.28 * (ring * 0.5 + 0.5); // 0.74 → 1.02

          // Color: independent slow diagonal sweep (decoupled from ring phase)
          const baseHue  = 0.5 + 0.5 * Math.sin(dx * 0.07 - dy * 0.04 + tWord * 0.55 + wm.phase);
          // Border dots (low m) pushed toward straw end (+0.34, reduced from +0.42 for
          // 4-stop palette so borders reach soft straw without flooding the whole range);
          // inner dots sweep the darker green half.
          const edgeFactor = Math.max(0, 1 - (m - 0.12) / 0.38);
          const hueWave    = Math.min(1, baseHue + edgeFactor * 0.34);

          const r  = m * maxR * breathe;
          const cx = (xi + 0.5) * cellW;
          const cy = (yi + 0.5) * cellH;

          // Dark contour ring — thin dark rim for crispness on bright backgrounds
          ctx.beginPath();
          ctx.arc(cx, cy, r + ringK, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(10,14,18,0.5)';
          ctx.fill();

          // Colored dot on top
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = palette(WORDMARK_COLORS, hueWave);
          ctx.fill();
        }
      }
    }

    ctx.shadowBlur = 0; // reset glow
  }

  // ── Frame loop ────────────────────────────────────────────────────────────
  // Nothing is drawn while the canvas is out of sight.
  let visible = true;
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; })
    : null;
  io?.observe(canvas);

  function frame() {
    if (visible) {
      tWord += wordSpeed;
      draw();
    }
    raf = requestAnimationFrame(frame);
  }

  /** The masks are in: draw, and move unless the visitor asked for stillness. */
  function begin(masks: WordMask[]) {
    wordMasks = masks;
    draw();
    canvas.dataset.tixyState = reduced ? 'still' : 'running'; // for whoever checks the page
    if (!reduced && !raf) raf = requestAnimationFrame(frame);
  }

  // ── Strip: the canvas takes the size of the line ──────────────────────────
  let stripRun = 0;
  async function layoutStrip() {
    const run = ++stripRun;
    await document.fonts.load(wordFont(100), text);
    const room = canvas.parentElement?.clientWidth ?? 0;
    if (run !== stripRun || room <= 0) return;
    const next = stripGeometry(text, cell, maxRows, room);
    if (wordMasks && next.cols === cols && next.rows === rows) return; // same grid as before
    cols = next.cols;
    rows = next.rows;
    canvas.style.width  = `${cols * cell}px`;
    canvas.style.height = `${rows * cell}px`;
    wordMasks = null;
    plateCanvas = null;
    resize();
    const masks = await prepareStripMasks(text, next, cell);
    if (run === stripRun) begin(masks);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  let ro: ResizeObserver;
  if (strip) {
    layoutStrip();
    // The room for the line is the parent's width: lay the line out again when it changes.
    ro = new ResizeObserver(() => {
      clearTimeout(rebuildTimer);
      rebuildTimer = window.setTimeout(layoutStrip, 200);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);
  } else {
    resize();
    draw(); // ambient-only first frame while masks build

    const rect0 = canvas.getBoundingClientRect();
    prepareWordMasks(cols, rows, rect0.width || 1280, rect0.height || 520).then(begin);

    ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
  }

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(rebuildTimer);
    ro.disconnect();
    io?.disconnect();
  };
}
