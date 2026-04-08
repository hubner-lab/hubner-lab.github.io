import { createNoise3D } from 'simplex-noise';

export interface TopoCanvasOptions {
  canvas: HTMLCanvasElement;
  freq?: number;   // noise spatial frequency (default 0.12)
  speed?: number;  // time increment per frame (default 0.004)
  seed?: number;   // seed offset for noise (default 0)
  cols?: number;   // dot grid columns (default 40)
  rows?: number;   // dot grid rows (default 60)
}

// Palette
const COLORS = {
  wheat: [201, 162,  75] as [number, number, number],
  leaf:  [ 62, 107,  74] as [number, number, number],
  data:  [ 30,  95, 191] as [number, number, number],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

/** Three-stop palette lerp: wheat → leaf → data, driven by noise value 0..1 */
function paletteColor(h: number): string {
  let r: number, g: number, b: number;
  if (h < 0.5) {
    [r, g, b] = lerpColor(COLORS.wheat, COLORS.leaf, h * 2);
  } else {
    [r, g, b] = lerpColor(COLORS.leaf, COLORS.data, (h - 0.5) * 2);
  }
  return `rgb(${r},${g},${b})`;
}

export function startTopoCanvas(opts: TopoCanvasOptions): () => void {
  const {
    canvas,
    freq  = 0.12,
    speed = 0.004,
    cols  = 40,
    rows  = 60,
    seed  = 0,
  } = opts;

  const noise3D = createNoise3D();
  const ctx = canvas.getContext('2d')!;
  let t = seed;
  let raf = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function draw() {
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    const cellW = W / cols;
    const cellH = H / rows;
    const maxR = Math.min(cellW, cellH) * 0.42;

    ctx.clearRect(0, 0, W, H);

    for (let xi = 0; xi < cols; xi++) {
      for (let yi = 0; yi < rows; yi++) {
        // noise returns -1..1, map to 0..1
        const raw = noise3D(xi * freq, yi * freq, t);
        const h = (raw + 1) / 2;

        const r = 0.5 + h * maxR;
        const cx = (xi + 0.5) * cellW;
        const cy = (yi + 0.5) * cellH;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = paletteColor(h);
        ctx.fill();
      }
    }
  }

  function frame() {
    t += speed;
    draw();
    raf = requestAnimationFrame(frame);
  }

  resize();
  draw(); // always render first frame

  if (!reduced) {
    raf = requestAnimationFrame(frame);
  }

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
