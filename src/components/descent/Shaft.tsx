"use client";

import { useEffect, useRef } from "react";
import { descent, smoothstep, clamp, type DescentState } from "./useDescent";

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
  umberInk: [28, 23, 20],
  umberMute: [116, 106, 93],
  creamInk: [246, 241, 232],
  creamMute: [168, 158, 144],
  chestnut: [140, 90, 56],
  amber: [196, 139, 72],
  rust: [217, 85, 56],
} as const;

type RGB = readonly number[];
const mix = (a: RGB, b: RGB, t: number): number[] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
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
 * Depth → colour. The descent is not a theme switch; light simply runs out.
 * `hi` is the lit tone and `lo` the shadow, and the shader mixes between them
 * by luminance. `heat` pushes `hi` toward chestnut, rust or amber — one number,
 * and it is the whole drama control.
 */
function depthColors(s: DescentState) {
  const dim = smoothstep(0.04, 0.5, s.p);

  let hi = mix(C.bone, C.dusk, dim);
  let lo = mix(C.boneInset, C.duskInset, dim);
  hi = mix(hi, C.roastInset, s.night); // roast lifts toward the top
  lo = mix(lo, C.roast, s.night); //      and bottoms out in the ground

  const heat = clamp(
    s.burn * 0.35 + s.climax + s.door * 0.55 + s.vel * 0.12,
    0,
    1,
  );
  let hot = mix(C.chestnut, C.rust, s.climax);
  hot = mix(hot, C.amber, s.door * 0.8);

  hi = mix(hi, hot, heat * 0.8);
  lo = mix(lo, hot, heat * 0.22);

  return { hi, lo };
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
    let lastNight = -1;
    let lastLo = -1;
    let burnOn = false;

    const unsub = descent.subscribe((s) => {
      const { hi, lo } = depthColors(s);

      if (field) draw(field, 0, hi, lo, s);

      if (burn) {
        if (s.burn > 0.004) {
          if (!burnOn) {
            burnOn = true;
            burnCv.style.opacity = "1";
          }
          draw(burn, 1, hi, lo, s);
        } else if (burnOn) {
          burnOn = false;
          burnCv.style.opacity = "0";
          burn.gl.clearColor(0, 0, 0, 0);
          burn.gl.clear(burn.gl.COLOR_BUFFER_BIT);
        }
      }

      /* Hand the live depth back to CSS, so type and hairlines follow the
         light without a single dark: variant anywhere in the landing.
         Throttled by perceptible change — rewriting custom properties every
         frame invalidates style for the subtree sixty times a second. */
      if (
        Math.abs(s.night - lastNight) < 0.004 &&
        Math.abs(lo[0] - lastLo) < 1.2
      ) {
        return;
      }
      lastNight = s.night;
      lastLo = lo[0];

      root.setProperty("--descent-ground", css(lo));
      root.setProperty("--descent-ground-hi", css(hi));
      root.setProperty("--descent-ink", css(mix(C.umberInk, C.creamInk, s.night)));
      root.setProperty(
        "--descent-muted",
        css(mix(C.umberMute, C.creamMute, s.night)),
      );
      root.setProperty(
        "--descent-line",
        s.night > 0.5
          ? `rgba(246,236,222,${(0.09 + 0.1 * s.night).toFixed(3)})`
          : `rgba(60,42,26,${(0.16 - 0.05 * s.night).toFixed(3)})`,
      );
      root.setProperty(
        "--descent-glow",
        s.night > 0.5 ? "rgba(196,139,72,.55)" : "rgba(140,90,56,.45)",
      );
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
