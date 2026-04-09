// Gray-Scott reaction-diffusion — pure WebGL2, no dependencies.
// Based on Pearson (1993) Science 261:189. Math and parameters are public-domain.

export type PresetKey = 'coral' | 'worms' | 'spots' | 'labyrinth' | 'mitosis' | 'zebrafish';

interface Preset {
  f: number;      // feed rate
  k: number;      // kill rate
  dA: number;     // diffusion A
  dB: number;     // diffusion B
  iters: number;  // sim steps per frame
  seeds: number;  // initial seed blobs
}

export const PRESETS: Record<PresetKey, Preset> = {
  coral:     { f: 0.0545, k: 0.062,  dA: 1.0, dB: 0.5, iters: 20, seeds: 4 },
  worms:     { f: 0.046,  k: 0.063,  dA: 1.0, dB: 0.5, iters: 20, seeds: 3 },
  spots:     { f: 0.030,  k: 0.062,  dA: 1.0, dB: 0.5, iters: 20, seeds: 6 },
  labyrinth: { f: 0.039,  k: 0.058,  dA: 1.0, dB: 0.5, iters: 20, seeds: 4 },
  mitosis:   { f: 0.0367, k: 0.0649, dA: 1.0, dB: 0.5, iters: 20, seeds: 3 },
  zebrafish: { f: 0.026,  k: 0.061,  dA: 1.0, dB: 0.5, iters: 20, seeds: 5 },
};

// Site palette (earthy botanical) passed as shader uniforms:
// B=0 → paper,  B≈0.25 → wheat,  B≈0.55 → leaf,  B=1 → soil
const PALETTE = {
  paper:  [0.969, 0.965, 0.945] as [number, number, number], // #F7F6F1
  wheat:  [0.788, 0.635, 0.294] as [number, number, number], // #C9A24B
  leaf:   [0.243, 0.420, 0.290] as [number, number, number], // #3E6B4A
  soil:   [0.227, 0.180, 0.122] as [number, number, number], // #3A2E1F
};

const SIM_SIZE = 512; // fixed simulation grid, independent of display size

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VS = /* glsl */`#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Seed pass: A=1 everywhere, B=1 inside each circular blob
const SEED_FS = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform int u_seedCount;
uniform vec2 u_seeds[8];
uniform float u_radius;
void main() {
  float b = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_seedCount) break;
    float d = distance(v_uv, u_seeds[i]);
    if (d < u_radius) b = 1.0;
  }
  fragColor = vec4(1.0, b, 0.0, 1.0); // R=A, G=B
}`;

// Simulation pass: Gray-Scott update with 3×3 weighted Laplacian
const SIM_FS = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_f;
uniform float u_k;
uniform float u_dA;
uniform float u_dB;
uniform float u_dt;

vec2 laplacian(vec2 uv) {
  vec2 t  = u_texel;
  vec2 c  = texture(u_state, uv).rg;
  vec2 l  = texture(u_state, uv + vec2(-t.x,  0.0)).rg;
  vec2 r  = texture(u_state, uv + vec2( t.x,  0.0)).rg;
  vec2 u  = texture(u_state, uv + vec2( 0.0,  t.y)).rg;
  vec2 d  = texture(u_state, uv + vec2( 0.0, -t.y)).rg;
  vec2 tl = texture(u_state, uv + vec2(-t.x,  t.y)).rg;
  vec2 tr = texture(u_state, uv + vec2( t.x,  t.y)).rg;
  vec2 bl = texture(u_state, uv + vec2(-t.x, -t.y)).rg;
  vec2 br = texture(u_state, uv + vec2( t.x, -t.y)).rg;
  return -c
       + 0.2  * (l + r + u + d)
       + 0.05 * (tl + tr + bl + br);
}

void main() {
  vec2 state = texture(u_state, v_uv).rg;
  float A = state.r;
  float B = state.g;
  vec2 lap = laplacian(v_uv);
  float reaction = A * B * B;
  float dA = u_dA * lap.r - reaction + u_f * (1.0 - A);
  float dB = u_dB * lap.g + reaction - (u_f + u_k) * B;
  float newA = clamp(A + dA * u_dt, 0.0, 1.0);
  float newB = clamp(B + dB * u_dt, 0.0, 1.0);
  fragColor = vec4(newA, newB, 0.0, 1.0);
}`;

// Display pass: map B concentration to earthy botanical ramp
const DISPLAY_FS = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_state;
uniform vec3 u_paper;
uniform vec3 u_wheat;
uniform vec3 u_leaf;
uniform vec3 u_soil;

vec3 colorRamp(float t) {
  if (t < 0.25) return mix(u_paper, u_wheat, t / 0.25);
  if (t < 0.55) return mix(u_wheat, u_leaf,  (t - 0.25) / 0.30);
  return mix(u_leaf, u_soil, (t - 0.55) / 0.45);
}

void main() {
  float b = texture(u_state, v_uv).g;
  fragColor = vec4(colorRamp(b), 1.0);
}`;

// ─── WebGL helpers ─────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

// Try float16 render targets first (required for numerical stability in Gray-Scott).
// EXT_color_buffer_float enables RGBA16F/RGBA32F as render targets in WebGL2.
// Falls back to RGBA8 only if extension is missing (rare on desktop).
function makeFBO(
  gl: WebGL2RenderingContext,
  size: number,
  useFloat: boolean,
): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (useFloat) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { fbo, tex };
}

// ─── Main entry point ──────────────────────────────────────────────────────────

export function startReactionDiffusion({
  canvas,
  preset: presetKey = 'coral',
}: {
  canvas: HTMLCanvasElement;
  preset?: PresetKey;
}): () => void {
  const preset = PRESETS[presetKey] ?? PRESETS.coral;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl2');
  if (!gl) return () => {};

  // Enable float render targets (needed for numerical precision in Gray-Scott)
  const useFloat = !!gl.getExtension('EXT_color_buffer_float');

  // Compile programs
  const seedProg    = linkProgram(gl, VS, SEED_FS);
  const simProg     = linkProgram(gl, VS, SIM_FS);
  const displayProg = linkProgram(gl, VS, DISPLAY_FS);

  // Full-screen quad
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  function bindQuad(prog: WebGLProgram) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // Ping-pong FBOs — float16 for precision, RGBA8 fallback
  let fboA = makeFBO(gl, SIM_SIZE, useFloat);
  let fboB = makeFBO(gl, SIM_SIZE, useFloat);

  // Seed the simulation
  function seedSim() {
    gl.useProgram(seedProg);
    bindQuad(seedProg);
    gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo);

    const seedLoc = gl.getUniformLocation(seedProg, 'u_seeds[0]');
    const seeds: number[] = [];
    for (let i = 0; i < preset.seeds; i++) {
      seeds.push(Math.random(), Math.random());
    }
    // Pad to 8 pairs
    while (seeds.length < 16) seeds.push(0.5, 0.5);
    gl.uniform2fv(seedLoc, seeds);
    gl.uniform1i(gl.getUniformLocation(seedProg, 'u_seedCount'), preset.seeds);
    gl.uniform1f(gl.getUniformLocation(seedProg, 'u_radius'), 0.04);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // One simulation step
  function simStep() {
    gl.useProgram(simProg);
    bindQuad(simProg);
    gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
    gl.uniform2f(gl.getUniformLocation(simProg, 'u_texel'), 1 / SIM_SIZE, 1 / SIM_SIZE);
    gl.uniform1f(gl.getUniformLocation(simProg, 'u_f'), preset.f);
    gl.uniform1f(gl.getUniformLocation(simProg, 'u_k'), preset.k);
    gl.uniform1f(gl.getUniformLocation(simProg, 'u_dA'), preset.dA);
    gl.uniform1f(gl.getUniformLocation(simProg, 'u_dB'), preset.dB);
    gl.uniform1f(gl.getUniformLocation(simProg, 'u_dt'), 1.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
    gl.uniform1i(gl.getUniformLocation(simProg, 'u_state'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Swap
    [fboA, fboB] = [fboB, fboA];
  }

  // Display current state to canvas
  function display() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(displayProg);
    bindQuad(displayProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
    gl.uniform1i(gl.getUniformLocation(displayProg, 'u_state'), 0);
    gl.uniform3fv(gl.getUniformLocation(displayProg, 'u_paper'), PALETTE.paper);
    gl.uniform3fv(gl.getUniformLocation(displayProg, 'u_wheat'), PALETTE.wheat);
    gl.uniform3fv(gl.getUniformLocation(displayProg, 'u_leaf'),  PALETTE.leaf);
    gl.uniform3fv(gl.getUniformLocation(displayProg, 'u_soil'),  PALETTE.soil);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Init
  seedSim();

  // Pre-warm: run iterations synchronously so the pattern is developed before first display.
  // GPU commands queue on the driver; 3000 draw calls submit quickly without blocking.
  const WARMUP = reducedMotion ? 2000 : 3000;
  for (let i = 0; i < WARMUP; i++) simStep();
  display();

  if (reducedMotion) return () => {};

  // Normal: rAF loop, paused when off-screen
  let rafId = 0;
  let visible = false;

  function loop() {
    for (let i = 0; i < preset.iters; i++) simStep();
    display();
    if (visible) rafId = requestAnimationFrame(loop);
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && rafId === 0) {
      rafId = requestAnimationFrame(loop);
    } else if (!visible) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }, { threshold: 0.01 });
  io.observe(canvas);

  return () => {
    io.disconnect();
    cancelAnimationFrame(rafId);
    gl.deleteBuffer(quadBuf);
    gl.deleteProgram(seedProg);
    gl.deleteProgram(simProg);
    gl.deleteProgram(displayProg);
    gl.deleteTexture(fboA.tex);
    gl.deleteTexture(fboB.tex);
    gl.deleteFramebuffer(fboA.fbo);
    gl.deleteFramebuffer(fboB.fbo);
  };
}
