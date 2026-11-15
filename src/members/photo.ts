// Square photo: pan + zoom crop, stepped downscale to 640 x 640, JPEG quality lowered until the
// result fits. Re-encoding through a canvas also strips EXIF (location, camera, orientation tags).

export const PHOTO_SIZE = 640;
export const PHOTO_MAX_BYTES = 200 * 1024;

export interface PhotoResult {
  bytes: Uint8Array;
  rev: string;
  url: string; // object URL for the preview
}

/** First 16 hex of the SHA-256, the same rule as the card's `rev`. */
export async function revOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Halve repeatedly until the next halving would go below the target, then draw the final step. */
function downscale(src: HTMLCanvasElement, target: number): HTMLCanvasElement {
  let cur = src;
  while (cur.width >= target * 2) {
    const next = document.createElement('canvas');
    next.width = next.height = Math.max(target, Math.floor(cur.width / 2));
    const ctx = next.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
  }
  if (cur.width !== target) {
    const last = document.createElement('canvas');
    last.width = last.height = target;
    const ctx = last.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, target, target);
    cur = last;
  }
  return cur;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', quality),
  );
}

/** JPEG quality from about 0.85 downwards until the file is at most 200 KB. */
export async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  for (let q = 0.85; q >= 0.3; q -= 0.05) {
    const blob = await toBlob(canvas, q);
    if (blob.size <= PHOTO_MAX_BYTES) return new Uint8Array(await blob.arrayBuffer());
  }
  throw new Error('The photo is too detailed to fit in 200 KB. Try a smaller or simpler picture.');
}

export interface Cropper {
  load(file: File): Promise<void>;
  reset(): void;
  /** Crop what the viewport shows into the final 640 x 640 JPEG. */
  commit(): Promise<PhotoResult>;
}

export function createCropper(view: HTMLCanvasElement, zoomInput: HTMLInputElement): Cropper {
  const ctx = view.getContext('2d')!;
  let img: ImageBitmap | null = null;
  let zoom = 1;
  // Centre of the visible square, in source pixels.
  let cx = 0;
  let cy = 0;

  const side = () => (img ? Math.min(img.width, img.height) / zoom : 1);

  function limit() {
    if (!img) return;
    const half = side() / 2;
    cx = clamp(cx, half, img.width - half);
    cy = clamp(cy, half, img.height - half);
  }

  function draw() {
    if (!img) return;
    limit();
    const s = side();
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s, 0, 0, view.width, view.height);
  }

  let drag: { x: number; y: number } | null = null;
  view.addEventListener('pointerdown', (e) => {
    if (!img) return;
    drag = { x: e.clientX, y: e.clientY };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag || !img) return;
    const k = side() / view.getBoundingClientRect().width; // source px per screen px
    cx -= (e.clientX - drag.x) * k;
    cy -= (e.clientY - drag.y) * k;
    drag = { x: e.clientX, y: e.clientY };
    draw();
  });
  const end = () => (drag = null);
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  zoomInput.addEventListener('input', () => {
    zoom = Number(zoomInput.value);
    draw();
  });

  return {
    async load(file) {
      img?.close();
      img = await createImageBitmap(file); // honours EXIF orientation by default
      zoom = 1;
      zoomInput.value = '1';
      cx = img.width / 2;
      cy = img.height / 2;
      draw();
    },
    reset() {
      img?.close();
      img = null;
      ctx.clearRect(0, 0, view.width, view.height);
    },
    async commit() {
      if (!img) throw new Error('Choose a photo first.');
      limit();
      const s = side();
      const crop = document.createElement('canvas');
      crop.width = crop.height = Math.max(PHOTO_SIZE, Math.round(s));
      const c = crop.getContext('2d')!;
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, cx - s / 2, cy - s / 2, s, s, 0, 0, crop.width, crop.height);
      const out = downscale(crop, PHOTO_SIZE);
      const bytes = await encodeJpeg(out);
      const rev = await revOf(bytes);
      return { bytes, rev, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })) };
    },
  };
}
