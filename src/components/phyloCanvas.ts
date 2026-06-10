import { createNoise3D } from 'simplex-noise';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhyloCanvasOptions {
  canvas:   HTMLCanvasElement;
  seed?:    number;   // deterministic topology + shimmer offset
  speed?:   number;   // wavefront cycles per ~100 frames (default 0.16)
  arcDeg?:  number;   // fan span in degrees (default 170 = upper semicircle)
  shimmer?: number;   // simplex jitter amplitude 0..1 (default 0.5)
}

interface TreeNode {
  children:   TreeNode[];
  clade:      RGB;
  angle:      number;   // assigned in layout
  rFrac:      number;   // 0=root → 1=tips (ultrametric divergence time)
  jSeed:      number;   // unique index for noise shimmer
}

type RGB = [number, number, number];

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32 — tiny, no deps)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// Palette — bright / saturated; pop on #F7F6F1 paper card background
// ---------------------------------------------------------------------------

const CLADE_RED:   RGB = [226,  59,  59];  // #E23B3B
const CLADE_GREEN: RGB = [ 31, 148,  51];  // #1F9433  (darkened for legibility)
const CLADE_BLUE:  RGB = [ 46, 123, 226];  // #2E7BE2
const WARM_GREY:   RGB = [120, 110,  96];  // root / muted base
const BRIGHT_TIP:  RGB = [255, 255, 245];  // near-white pulse peak

// ---------------------------------------------------------------------------
// Colour helpers (mirror topoCanvas.ts style)
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function baseColor(clade: RGB, rFrac: number): RGB {
  const muted = lerpColor(clade, WARM_GREY, 0.38);
  return lerpColor(muted, clade, rFrac * 0.65);
}

function strokeRGB(clade: RGB, rFrac: number, p: number): string {
  const [r, g, b] = lerpColor(baseColor(clade, rFrac), lerpColor(clade, BRIGHT_TIP, 0.45), p);
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Tree building — caterpillar/pectinate topology (realistic asymmetry)
// ---------------------------------------------------------------------------

let _jCounter = 0;

function makeLeaf(clade: RGB): TreeNode {
  return { children: [], clade, angle: 0, rFrac: 1.0, jSeed: _jCounter++ };
}

/** Pectinate-biased split: frequently peels off 1–3 leaves, creating caterpillar look. */
function pectinateSplit(n: number, rng: () => number): number {
  if (n <= 2) return 1;
  const r = rng();
  // r² bias → heavily weighted toward small values
  return Math.max(1, Math.min(n - 1, Math.ceil(r * r * n * 0.45)));
}

function buildSubtree(n: number, clade: RGB, rng: () => number): TreeNode {
  if (n === 1) return makeLeaf(clade);
  const k   = pectinateSplit(n, rng);
  const node: TreeNode = { children: [], clade, angle: 0, rFrac: 0, jSeed: _jCounter++ };
  node.children.push(buildSubtree(k,     clade, rng));
  node.children.push(buildSubtree(n - k, clade, rng));
  return node;
}

/** Root → 3 clade children (red 16 tips / green 20 tips / blue 16 tips = 52 total). */
function buildTree(seed: number): TreeNode {
  _jCounter = 0;
  const rng  = mulberry32(seed * 7 + 13);
  const root: TreeNode = { children: [], clade: WARM_GREY, angle: 0, rFrac: 0, jSeed: _jCounter++ };
  root.children.push(buildSubtree(16, CLADE_RED,   rng));
  root.children.push(buildSubtree(20, CLADE_GREEN, rng));
  root.children.push(buildSubtree(16, CLADE_BLUE,  rng));
  return root;
}

// ---------------------------------------------------------------------------
// Ultrametric divergence times
// Internal nodes get random times in (parentTime, 0.88); all tips at rFrac=1.0
// This scatters internal-node arcs across many radii → no concentric-ring artefact
// ---------------------------------------------------------------------------

function assignTimes(node: TreeNode, parentTime: number, rng: () => number): void {
  if (node.children.length === 0) { node.rFrac = 1.0; return; }
  if (parentTime === 0) {
    // root stays at 0
    node.rFrac = 0;
  } else {
    const remaining = 0.88 - parentTime;
    node.rFrac = clamp01(parentTime + rng() * remaining * 0.72 + remaining * 0.08);
  }
  node.children.forEach(c => assignTimes(c, node.rFrac, rng));
}

// ---------------------------------------------------------------------------
// Angular layout
// ---------------------------------------------------------------------------

function collectLeaves(node: TreeNode, out: TreeNode[]): void {
  if (node.children.length === 0) { out.push(node); return; }
  node.children.forEach(c => collectLeaves(c, out));
}

/** Post-order: internal node angle = mean of children angles. */
function assignAngles(node: TreeNode): number {
  if (node.children.length === 0) return node.angle;
  const a = node.children.map(assignAngles);
  node.angle = a.reduce((s, v) => s + v, 0) / a.length;
  return node.angle;
}

function layoutTree(root: TreeNode, arcDeg: number, seed: number): void {
  const leaves: TreeNode[] = [];
  collectLeaves(root, leaves);

  const span  = (arcDeg * Math.PI) / 180;
  // Fan centred on straight-up (−π/2); gap at bottom
  const start = -Math.PI / 2 - span / 2;
  leaves.forEach((leaf, i) => {
    leaf.angle = start + span * (i + 0.5) / leaves.length;
  });

  assignAngles(root);

  // Assign ultrametric divergence times (separate RNG stream)
  const rng2 = mulberry32(seed * 31 + 97);
  // Assign times to root's 3 clade children first (their times = large divergences)
  root.children.forEach(cladeChild => {
    cladeChild.rFrac = 0.12 + rng2() * 0.15;  // clade-level divergence 0.12–0.27
    cladeChild.children.forEach(c => assignTimes(c, cladeChild.rFrac, rng2));
  });
  // Leaves are forced to 1.0 by assignTimes; internal descendant nodes filled above
}

// ---------------------------------------------------------------------------
// Animation — seamless root→tip wavefront (raised-cosine pulse band)
// ---------------------------------------------------------------------------

const BAND_HALF = 0.20;

function pulseIntensity(rFrac: number, wave: number): number {
  let d = Math.abs(rFrac - wave);
  d     = Math.min(d, 1 - d);                         // toroidal distance → no seam
  if (d > BAND_HALF) return 0;
  const x = d / BAND_HALF;
  let p   = 0.5 * (1 + Math.cos(Math.PI * x));        // raised cosine
  if (rFrac < wave) p *= 0.60;                         // trailing side dimmer → direction clear
  return p;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function startPhyloCanvas(opts: PhyloCanvasOptions): () => void {
  const {
    canvas,
    seed    = 0,
    speed   = 0.16,
    arcDeg  = 170,
    shimmer = 0.5,
  } = opts;

  const ctx     = canvas.getContext('2d')!;
  const noise3D = createNoise3D();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build once (deterministic)
  const tree = buildTree(seed);
  layoutTree(tree, arcDeg, seed);

  let t   = seed * 0.01;
  let raf = 0;

  // -------------------------------------------------------------------
  // Resize — DPR-aware (mirror topoCanvas.ts)
  // -------------------------------------------------------------------
  function resize(): void {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  // -------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------
  function draw(): void {
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, W, H);

    // Semicircle layout: root just below canvas bottom, tips spread across top arc
    const cx     = W * 0.5;
    const cy     = H + 6;                              // root off-canvas, dramatic fan
    // outerR: limited by height (tips near top) AND width (prevent horizontal clip)
    const outerR = Math.min(H * 0.94, W * 0.48);
    const innerR = outerR * 0.06;

    const wave = ((t * speed) % 1 + 1) % 1;

    function radius(rFrac: number): number {
      return innerR + rFrac * (outerR - innerR);
    }

    function polar(angle: number, r: number): [number, number] {
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    }

    // Recursive branch drawing — iTOL rectangular elbow:
    //   (1) radial line along child's angle: child radius → parent radius
    //   (2) arc at parent's radius: child angle → parent angle
    function drawBranch(node: TreeNode, parent: TreeNode): void {
      const rChild  = radius(node.rFrac);
      const rParent = radius(parent.rFrac);
      const df      = node.rFrac;

      // Organic shimmer via simplex noise
      const sh = noise3D(node.jSeed * 0.7, 0, t * 0.10);
      const p  = clamp01(pulseIntensity(df, wave) * (1 + 0.18 * shimmer * sh));

      // Taper: thicker near root, thinner at tips; pulse fattens slightly
      const w = lerp(2.6, 0.65, df) * (1 + 0.45 * p);

      ctx.lineCap     = 'round';
      ctx.strokeStyle = strokeRGB(node.clade, df, p);
      ctx.lineWidth   = w;

      if (p > 0.06) {
        ctx.shadowBlur  = 6 * p;
        ctx.shadowColor = strokeRGB(node.clade, df, Math.max(0, p - 0.15));
      } else {
        ctx.shadowBlur = 0;
      }

      // (1) Radial branch line
      const [x1, y1] = polar(node.angle, rChild);
      const [x2, y2] = polar(node.angle, rParent);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // (2) Arc cross-bar at parent radius
      // Determine shorter-direction (avoid wrapping the long way around)
      let da = node.angle - parent.angle;
      da = ((da + Math.PI) % (2 * Math.PI)) - Math.PI;   // normalise to (−π, π]
      const ccw = da < 0;
      ctx.lineWidth = lerp(2.6, 0.65, parent.rFrac) * (1 + 0.45 * p);
      ctx.beginPath();
      ctx.arc(cx, cy, rParent, node.angle, parent.angle, ccw);
      ctx.stroke();

      ctx.shadowBlur = 0;

      node.children.forEach(c => drawBranch(c, node));
    }

    tree.children.forEach(child => drawBranch(child, tree));

    // Tip dots (extant taxa)
    const leaves: TreeNode[] = [];
    collectLeaves(tree, leaves);
    leaves.forEach(leaf => {
      const p  = clamp01(pulseIntensity(1.0, wave));
      const r  = 1.7 + 1.4 * p;
      const [x, y] = polar(leaf.angle, outerR + 2.5);
      // Only draw if inside canvas
      if (y > H + 4) return;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = strokeRGB(leaf.clade, 1, p * 0.8 + 0.15);
      if (p > 0.08) { ctx.shadowBlur = 4 * p; ctx.shadowColor = ctx.fillStyle; }
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Faint internal-node dots (speciation events)
    function dotInternals(node: TreeNode): void {
      if (node === tree || node.children.length === 0) return;
      const [x, y] = polar(node.angle, radius(node.rFrac));
      if (y > H + 2) return;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = strokeRGB(node.clade, node.rFrac, 0.06);
      ctx.fill();
      node.children.forEach(dotInternals);
    }
    dotInternals(tree);
  }

  // -------------------------------------------------------------------
  // Animation loop (mirror topoCanvas.ts)
  // -------------------------------------------------------------------
  function frame(): void {
    t += 0.016;
    draw();
    raf = requestAnimationFrame(frame);
  }

  resize();
  draw();

  if (!reduced) {
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(() => { resize(); draw(); });
  ro.observe(canvas);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
