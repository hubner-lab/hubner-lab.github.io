/**
 * TixyCanvas — "Hübner Lab" dot-grid wordmark.
 *
 *   Larger dots masked to the text "Hübner Lab", deep botanical palette,
 *   orbital ripple + diagonal color sweep. Each word ("Hübner", "Lab")
 *   has its own phase offset so they pulse slightly out of sync. The
 *   canvas is transparent except the wordmark dots, so a static photo
 *   placed behind it (see TixyCanvas.astro `bgImage`) shows through.
 */

export interface TixyCanvasOptions {
  canvas: HTMLCanvasElement;
  text?: string;         // (unused — words are split internally)
  cols?: number;         // grid columns (default 120)
  rows?: number;         // grid rows    (default 34)
  wordSpeed?: number;    // wordmark time increment (default 0.003)
  ambientSpeed?: number; // ambient time increment (default 0.0005)
}

// ── Palettes ────────────────────────────────────────────────────────────────
// Wordmark: deep field green → fresh barley → golden wheat
// Follows the crop life cycle: dark soil → spring shoot → ripe grain
const WORDMARK_COLORS: [number, number, number][] = [
  [ 45,  80,  22],  // #2D5016 deep field green
  [122, 158,  46],  // #7A9E2E barley / young crop
  [201, 162,  75],  // #C9A24B golden wheat (original site wheat token)
];

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
): Promise<WordMask> {
  const W = canvasW;
  const H = canvasH;

  const offscreen = document.createElement('canvas');
  offscreen.width  = W;
  offscreen.height = H;
  const mctx = offscreen.getContext('2d', { willReadFrequently: true })!;
  mctx.clearRect(0, 0, W, H);

  mctx.font = `700 ${fontSize}px "Fraunces Variable", Georgia, serif`;
  mctx.textAlign    = 'center';
  mctx.textBaseline = 'middle';
  mctx.fillStyle    = 'white';
  mctx.fillText(word, W * xRatio, H * yRatio);

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
 */
async function prepareWordMasks(
  cols: number,
  rows: number,
  canvasW: number,
  canvasH: number,
): Promise<WordMask[]> {
  let fontSize = Math.floor(canvasH * 0.40);
  await document.fonts.load(`700 ${fontSize}px "Fraunces Variable"`);

  // Measure each word to compute natural x positions
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = `700 ${fontSize}px "Fraunces Variable", Georgia, serif`;
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
    tmp.font = `700 ${fontSize}px "Fraunces Variable", Georgia, serif`;
    wHub  = tmp.measureText('Hübner').width;
    wLab  = tmp.measureText('Lab').width;
    gap   = fontSize * 0.35;
    total = wHub + gap + wLab;
  }

  // Left edge in pixels of the composite wordmark, centered in canvas
  const leftPx = (canvasW - total) / 2;
  const hubCenterPx = leftPx + wHub / 2;
  const labCenterPx = leftPx + wHub + gap + wLab / 2;

  const yRatio = 0.38; // upper-ish placement to leave room for overlay text

  const [hub, lab] = await Promise.all([
    buildWordMask('Hübner', cols, rows, canvasW, canvasH,
      hubCenterPx / canvasW, yRatio, fontSize, 0),
    buildWordMask('Lab',    cols, rows, canvasW, canvasH,
      labCenterPx / canvasW, yRatio, fontSize, Math.PI),
  ]);

  return [hub, lab];
}

// ── Main ────────────────────────────────────────────────────────────────────
export function startTixyCanvas(opts: TixyCanvasOptions): () => void {
  const {
    canvas,
    cols      = 140,
    rows      = 40,
    wordSpeed = 0.012,
  } = opts;

  const ctx     = canvas.getContext('2d')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let tWord    = 0;
  let raf      = 0;
  let wordMasks: WordMask[] | null = null;

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset + scale in one call
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

    // ── Wordmark — orbital ripple + color sweep ─────────────────────────
    // A focal point traces a slow elliptical orbit inside each word's bounds.
    // Concentric rings expand outward from it (radial ripple). Users track the
    // moving focal point and follow the rings — creates a "want to watch" quality.
    // Color drifts on an independent diagonal wave for decoupled visual rhythm.
    ctx.shadowColor = 'rgba(90, 110, 20, 0.30)'; // olive-wheat glow
    ctx.shadowBlur  = 10;

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
          const hueWave = 0.5 + 0.5 * Math.sin(dx * 0.07 - dy * 0.04 + tWord * 0.55 + wm.phase);

          const r  = m * maxR * breathe;
          const cx = (xi + 0.5) * cellW;
          const cy = (yi + 0.5) * cellH;

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
  function frame() {
    tWord += wordSpeed;
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  resize();
  draw(); // ambient-only first frame while masks build

  const rect0 = canvas.getBoundingClientRect();
  prepareWordMasks(cols, rows, rect0.width || 1280, rect0.height || 520)
    .then((masks) => {
      wordMasks = masks;
      draw();
      if (!reduced) raf = requestAnimationFrame(frame);
    });

  const ro = new ResizeObserver(() => {
    resize();
    draw();
  });
  ro.observe(canvas);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
