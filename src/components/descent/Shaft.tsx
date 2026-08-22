"use client";

import { useEffect, useRef } from "react";
import { descent, type DescentState } from "./useDescent";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHAFT — the landing's ground, drawn by one fragment shader.
 *
 * Continuous tone, start to finish. There is no threshold anywhere in the
 * fragment path, so the field cannot speckle: daylight falloff, wall curvature,
 * the floors sweeping past, the haze and the door glow all composite as smooth
 * gradients and then mix between a lit tone and a shadow tone.
 *
 * Two passes share this source and differ only by `uMode`:
 *   0 — the ambient field, behind the content
 *   1 — the dissolve, above it
 *
 * Raw WebGL rather than a library: this is a single fullscreen triangle with
 * ten uniforms, and three.js would be ~600kB to draw it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime, uP, uVel, uBurn, uClimax, uDoor, uMode;
uniform vec3  uHi, uLo;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main(){
  vec2  uv = gl_FragCoord.xy / uRes;
  float v  = 1.0 - uv.y;            // 0 at the top of the frame
  float cu = uv.x - 0.5;

  if (uMode > 0.5) {
    /* The dissolve. Every pixel takes its own threshold from an fbm field
       plus a downward bias, and uBurn sweeps past those thresholds — so the
       front is organic, and each pixel still ramps softly over 0.30 rather
       than flipping.

       Written as a per-pixel threshold rather than "front + noise" so it is
       monotonic by construction: at uBurn 0 nothing is covered anywhere, at
       uBurn 1 everything is, and no value between them snaps.

       fbm clusters around its mean instead of filling 0…1, so these
       coefficients are deliberately wide. Too narrow and every pixel's
       threshold is nearly the same number, which collapses the sweep back
       into a hard cut. */
    float n = fbm(vec2(uv.x * 2.6, v * 3.2) + vec2(uTime * 0.05, -uTime * 0.03));
    float thresh = n * 0.9 + v * 0.35;
    gl_FragColor = vec4(uLo, smoothstep(thresh, thresh + 0.30, uBurn * 1.38));
    return;
  }

  /* Daylight from the street, receding as we fall. */
  float L = exp(-(v * 0.9 + uP * 1.45) * 1.85);

  /* The shaft is brighter down its centre line. */
  float wall = 1.0 - cu * cu * 2.6;

  /* Floors sweeping upward past the camera. Soft bands, so they read as light
     passing rather than as drawn rules. */
  float fb = fract(v * 4.5 + uP * 22.0 + uTime * 0.05) - 0.5;
  float band = exp(-fb * fb * 34.0) * (0.14 + uVel * 0.26);

  /* Slow volumetric haze — the thing that makes it feel like air. */
  float haze = fbm(vec2(uv.x * 2.2, v * 3.0 + uP * 5.5)
                   + vec2(uTime * 0.028, -uTime * 0.042));

  /* The hall's door, only ever lit on the last floor. */
  float dv = v - 0.66;
  float glow = uDoor * exp(-(cu * cu * 11.0 + dv * dv * 9.0));

  float lum = L * wall * 1.15 + band * wall + glow * 1.4
            + (haze - 0.5) * 0.16 + uClimax * 0.30;

  /* Soft shoulder, not a hard clamp.
     The door's glow peaks well above 1, and clamp() collapses everything past
     that into one flat colour — a plateau covering ~13% of the frame in the
     hall, with a visible edge where it stops. Because the wall term is a
     parabola in x and the band term is horizontal, that edge runs
     near-vertical at the sides and near-horizontal top and bottom, so it
     reads as a rectangle sitting in the middle of the picture.

     No backticks in this comment: the whole shader is a JS template literal,
     and one would end the string.

     This curve approaches 1 without ever reaching it, so no two neighbouring
     pixels can ever resolve to the same value and there is no edge to see.
     The gain keeps midtones roughly where they were. */
  vec3 col = mix(uLo, uHi, 1.0 - exp(-lum * 1.5));

  /* ⚠ THIS LINE IS NOT GRAIN. DO NOT DELETE IT.
     It is +/-0.5 of one 8-bit code value, on a fixed R2 lattice — half a step
     of the smallest colour the display can show, which is below the threshold
     of anything anyone can see.

     Without it the field bands: measured across the hall, a horizontal line
     held only 31-48 distinct values over 1038 pixels, with runs of up to 149
     identical pixels. Those plateaus meet at hard steps, and because the field
     is parabolic in x and smooth in y, the steps trace rounded rectangles —
     which is exactly what a viewer reports as a box sitting in the picture.

     Amplitude measured, not guessed. Widest run of identical pixels on that
     same line: 149px undithered, 36px at +/-0.5 LSB, 16px at +/-1.0, and 4px
     at +/-1.5 — which is where the contours stop being resolvable. The
     textbook +/-0.5 is right for a normal image; this field's gradient is so
     shallow in the dark scenes that it needs the wider figure.

     Removing this does not make the image cleaner. It brings the box back. */
  col += (fract(dot(gl_FragCoord.xy, vec2(0.7548776662, 0.5698402909))) - 0.5)
       * (1.5 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}`;

/* Palette, lifted from the raw swatches in globals.css. Kept as numbers here
   because the shader needs to interpolate them per frame; globals.css stays
   the source of truth for everything CSS can express. */
const C = {
  bone: [250, 246, 239],
  boneInset: [233, 226, 212],
  dusk: [150, 133, 113],
  duskInset: [122, 106, 89],
  roast: [25, 19, 16],
  roastInset: [50, 40, 32],

  /*
   * The shaft's two tones.
   *
   * ⚠ `shaftLo` IS `--roast-page` (#191310), exactly. The shader canvas is
   * `position: fixed` and the footer below the descent has no ground of its
   * own, so the shaft's darkest tone and the page's ground meet on screen. When
   * they were four code values apart — #17120e against #191310 — scrolling out
   * of the descent showed a visible change of colour where none was intended.
   * If the palette moves, this moves with it.
   *
   * `shaftHi` is four values up. The shader mixes between the two by a
   * noise-driven luminance, so that distance IS how blotchy the ground looks:
   * enough for the geometry to sit in air, little enough that a still frame
   * reads as one colour.
   */
  shaftLo: [25, 19, 16],
  shaftHi: [29, 23, 20],
  umberInk: [28, 23, 20],
  umberMute: [116, 106, 93],
  creamInk: [246, 241, 232],
  creamMute: [168, 158, 144],
  chestnut: [140, 90, 56],
  amber: [196, 139, 72],
  rust: [217, 85, 56],
} as const;

type RGB = readonly number[];
const css = (c: RGB) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`;

type Renderer = {
  gl: WebGLRenderingContext;
  u: Record<string, WebGLUniformLocation | null>;
  canvas: HTMLCanvasElement;
};

function makeGL(canvas: HTMLCanvasElement, opaque: boolean): Renderer | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: !opaque,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    }) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
  if (!gl) return null;
  const ctx = gl;

  const compile = (type: number, src: string) => {
    const s = ctx.createShader(type)!;
    ctx.shaderSource(s, src);
    ctx.compileShader(s);
    if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
      throw new Error(ctx.getShaderInfoLog(s) ?? "compile failed");
    }
    return s;
  };

  let prog: WebGLProgram;
  try {
    prog = ctx.createProgram()!;
    ctx.attachShader(prog, compile(ctx.VERTEX_SHADER, VERT));
    ctx.attachShader(prog, compile(ctx.FRAGMENT_SHADER, FRAG));
    ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
      throw new Error(ctx.getProgramInfoLog(prog) ?? "link failed");
    }
  } catch (e) {
    /* Loud on purpose. A swallowed compile error is indistinguishable from
       "this machine has no WebGL", and the page just quietly loses its
       ground with nothing in the console to say why. */
    console.error("[shaft] shader failed:", (e as Error).message);
    return null;
  }

  ctx.useProgram(prog);

  /* One oversized triangle rather than a quad: no diagonal seam, one fewer
     vertex, and no index buffer. */
  const buf = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(
    ctx.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    ctx.STATIC_DRAW,
  );
  const loc = ctx.getAttribLocation(prog, "aPos");
  ctx.enableVertexAttribArray(loc);
  ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);

  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of [
    "uRes", "uTime", "uP", "uVel", "uBurn", "uClimax", "uDoor", "uMode",
    "uHi", "uLo",
  ]) {
    u[n] = ctx.getUniformLocation(prog, n);
  }

  return { gl: ctx, u, canvas };
}

function draw(r: Renderer, mode: number, hi: RGB, lo: RGB, s: DescentState) {
  const { gl, u } = r;
  gl.uniform2f(u.uRes, r.canvas.width, r.canvas.height);
  gl.uniform1f(u.uTime, s.t);
  gl.uniform1f(u.uP, s.p);
  gl.uniform1f(u.uVel, s.vel);
  gl.uniform1f(u.uBurn, s.burn);
  gl.uniform1f(u.uClimax, s.climax);
  gl.uniform1f(u.uDoor, s.door);
  gl.uniform1f(u.uMode, mode);
  gl.uniform3f(u.uHi, hi[0] / 255, hi[1] / 255, hi[2] / 255);
  gl.uniform3f(u.uLo, lo[0] / 255, lo[1] / 255, lo[2] / 255);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPTH → COLOUR
 *
 * One palette, top to bottom. `hi` is the lit tone and `lo` the shadow; the
 * shader mixes between them by luminance, which is what gives the shaft its
 * air. Neither changes as you scroll.
 *
 * ── What was here before ─────────────────────────────────────────────────────
 *
 * A colour journey: bone at the top, dimming through dusk to roast, with a
 * `heat` term pushing the lit tone toward chestnut, rust and amber at the
 * dramatic moments. It was doing a great deal — and it was the thing that read
 * as restless rather than as depth, because the page's own colour kept moving
 * underneath text that was trying to be read.
 *
 * The geometry, the parallax and the burn are all still driven by scroll. Only
 * the palette is now fixed, so the eye has one thing changing instead of two.
 *
 * ⚠ `hi` and `lo` are deliberately CLOSE together. A wide gap reintroduces the
 * same problem in miniature — the ground visibly lightening and darkening as
 * geometry drifts past.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function depthColors() {
  return { hi: C.shaftHi, lo: C.shaftLo };
}

export function Shaft() {
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const burnRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const fieldCv = fieldRef.current;
    const burnCv = burnRef.current;
    if (!fieldCv || !burnCv) return;

    const field = makeGL(fieldCv, true);
    const burn = makeGL(burnCv, false);

    /* No WebGL, or the context died: hand the ground to a CSS gradient. The
       piece loses its air, not its content. */
    const fail = () => {
      document.documentElement.dataset.noGl = "true";
    };
    if (!field) fail();

    const onLost = (e: Event) => {
      e.preventDefault();
      fail();
    };
    fieldCv.addEventListener("webglcontextlost", onLost);
    burnCv.addEventListener("webglcontextlost", onLost);

    /* Smooth gradients survive downsampling almost perfectly, so there is no
       reason to pay for 3× device pixels on a retina panel. */
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const size = () => {
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      for (const r of [field, burn]) {
        if (!r) continue;
        r.canvas.width = w;
        r.canvas.height = h;
        r.gl.viewport(0, 0, w, h);
      }
    };
    size();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(size, 140);
    };
    window.addEventListener("resize", onResize, { passive: true });

    const root = document.documentElement.style;
    let published = false;

    const unsub = descent.subscribe((s) => {
      const { hi, lo } = depthColors();

      if (field) draw(field, 0, hi, lo, s);

      /*
       * The burn layer is held off.
       *
       * It composited a full-screen alpha pass over the page at the dramatic
       * moments — the second of the two colour washes the redesign set out to
       * remove, and the more expensive one: a viewport-sized WebGL surface
       * blended over everything, on a phone.
       *
       * The canvas and its renderer are still created rather than deleted.
       * Bringing it back is this one branch, and a shader that has been
       * compiled and proven is worth keeping compiled.
       */
      void burn;

      /*
       * Hand the descent's colour to CSS once.
       *
       * It used to be rewritten as the scroll moved, throttled by perceptible
       * change — and rewriting a custom property on <html> invalidates style
       * for the whole subtree, so that was a full restyle several times a
       * second while somebody was reading. With a fixed palette it is one
       * write for the life of the page.
       */
      if (published) return;
      published = true;

      /*
       * Published once and then constant. They stay as custom properties
       * rather than becoming literals in the stylesheet because the CSS
       * fallback path (`html[data-no-gl]`) reads the same names, so one place
       * still defines the descent's colour.
       */
      root.setProperty("--descent-ground", css(lo));
      root.setProperty("--descent-ground-hi", css(hi));
      root.setProperty("--descent-ink", css(C.creamInk));
      root.setProperty("--descent-muted", css(C.creamMute));
      root.setProperty("--descent-line", "rgba(246,236,222,0.14)");
      root.setProperty("--descent-glow", "rgba(196,139,72,.42)");
    });

    return () => {
      unsub();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      fieldCv.removeEventListener("webglcontextlost", onLost);
      burnCv.removeEventListener("webglcontextlost", onLost);
    };
  }, []);

  return (
    <>
      <canvas ref={fieldRef} data-shaft="field" aria-hidden />
      <canvas ref={burnRef} data-shaft="burn" aria-hidden />
    </>
  );
}
