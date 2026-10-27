"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { ROUNDS } from "@/lib/auction";
import { bidClockLabel } from "@/lib/format";
import { t } from "@/lib/copy";
import { Shaft } from "./Shaft";
import { Decode } from "./Decode";
import {
  descent,
  easeIn,
  easeOut,
  seg,
  useDescentFrame,
  useSceneRef,
  type DescentState,
} from "./useDescent";
import s from "./Descent.module.css";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESCENT — the front door.
 *
 * You fall. The page is a shaft: daylight is above and recedes, the hall is
 * below and is dark, and every scene is one floor further down. The palette is
 * not themed — it is simply how much light reaches that depth.
 *
 * Five floors, named rather than numbered:
 *   Гудамж → Үүд → Шат → Босго → Танхим
 *
 * Nothing here touches the auction mechanics. The round table is *read* from
 * `auction.ts` and the clock labels from `format.ts`, so the stair scene can
 * never drift out of sync with the rules it is dramatising — but this file
 * owns no rule of its own.
 *
 * Animation never re-renders React. One subscriber writes custom properties
 * onto five stage elements per frame, and the CSS module does the rest; the
 * component tree renders exactly once.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* Circumference of the r=86 sweep ring, for the dash offset. */
const CIRC = 2 * Math.PI * 86;

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Masked character roll — the connective typography of the whole piece. */
function Split({ text }: { text: string }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span key={i} className={s.ch}>
          <span className={s.chIn} style={{ "--i": i } as CSSProperties}>
            {ch === " " ? " " : ch}
          </span>
        </span>
      ))}
    </>
  );
}

/** Sixty tick marks. Authoring these by hand would be sixty lines of nothing. */
function Ticks() {
  return (
    <g className={s.tick}>
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const r1 = i % 5 === 0 ? 66 : 72;
        return (
          <line
            key={i}
            x1={(100 + Math.cos(a) * r1).toFixed(2)}
            y1={(100 + Math.sin(a) * r1).toFixed(2)}
            x2={(100 + Math.cos(a) * 76).toFixed(2)}
            y2={(100 + Math.sin(a) * 76).toFixed(2)}
            strokeWidth={i % 5 === 0 ? 1.4 : 0.7}
          />
        );
      })}
    </g>
  );
}

/*
 * Rail A travels exactly its own length (22% → −78% of 6 × 34svh), so round i
 * crosses the 50% axis at p = (11.88 + 34i) / 204. Rail B travels 124% of it,
 * so the clocks slide against the rounds by up to ~0.09 progress — visibly a
 * different velocity, without the pair ever decoupling far enough that the lit
 * round and its clock stop reading as one row.
 */
const A0 = 0.0582;
const ASTEP = 1 / 6;

export function Descent() {
  /*
   * Named rather than held in an array.
   *
   * `stage[3]` reads identically to a human but not to `react-hooks/refs`,
   * which cannot tell an index into a list of ref OBJECTS from an access to a
   * ref's `.current` and flags every one. Five names cost five lines and remove
   * five false positives — and the array was never iterated anyway.
   */
  const stage0 = useRef<HTMLDivElement | null>(null);
  const stage1 = useRef<HTMLDivElement | null>(null);
  const stage2 = useRef<HTMLDivElement | null>(null);
  const stage3 = useRef<HTMLDivElement | null>(null);
  const stage4 = useRef<HTMLDivElement | null>(null);

  const scene0 = useSceneRef(0);
  const scene1 = useSceneRef(1);
  const scene2 = useSceneRef(2);
  const scene3 = useSceneRef(3);
  const scene4 = useSceneRef(4);

  const sweepBid = useRef<SVGCircleElement | null>(null);
  const sweepRound = useRef<SVGCircleElement | null>(null);
  const bidVal = useRef<HTMLDivElement | null>(null);
  const roundVal = useRef<HTMLDivElement | null>(null);
  const railA = useRef<HTMLDivElement | null>(null);
  const railB = useRef<HTMLDivElement | null>(null);
  const activeRow = useRef(-1);
  /* Last progress written per scene. Four of the five scenes are parked at 0
     or 1 at any moment, and rewriting their custom properties every frame
     invalidates style for those subtrees sixty times a second to produce the
     identical result. */
  const lastT = useRef<number[]>([-1, -1, -1, -1, -1]);

  /* The glitch writes onto its own few headings, not onto the root: a custom
     property changed on the root restyles every element in the descent, every
     frame the glitch runs. */
  const rootEl = useRef<HTMLDivElement | null>(null);
  const glitchEls = useRef<HTMLElement[]>([]);
  const glitchOn = useRef(false);
  /* When the hammer last landed, in descent seconds, and whether it is past
     the landing point now — the burst plays on the crossing, not while the
     scroll happens to rest there. */
  const hammerAt = useRef(-Infinity);
  const hammerDown = useRef(false);
  /* The last handover fade written to the stages. */
  const lastHandoff = useRef(-1);

  useEffect(() => {
    const root = rootEl.current;
    if (!root) return;
    glitchEls.current = Array.from(
      root.querySelectorAll<HTMLElement>(`.${s.glitch}`),
    );
  }, []);

  /*
   * One loop, owned by the one component that needs it. Started in an effect
   * rather than at module scope so that navigating away to /lots actually
   * stops it — a module-level start leaves a rAF running for the rest of the
   * session, measuring a page that is no longer mounted.
   *
   * The scene refs register in effects declared above this one, and React
   * runs effects in declaration order, so geometry is already known by the
   * time `start()` measures. The frame subscriber below is primed on
   * subscribe, so it cannot miss the single emit of the reduced-motion path.
   */
  useEffect(() => {
    descent.start();
    return () => descent.stop();
  }, []);

  useDescentFrame((d: DescentState) => {
    /*
     * ── The handover ──
     *
     * Near each scene boundary the stages fade toward nothing and back, so
     * one scene's content dissolves into the ground and the next one's rises
     * out of it. The ground itself stays still. `burn` is already the right
     * curve — zero away from a boundary, full exactly where the incoming
     * stage pins, smooth in between — it just no longer drives a fog over the
     * page. Written to all five stages only when it moves; at most two are
     * ever on screen, and the rest cost a no-op restyle.
     */
    if (Math.abs(d.burn - lastHandoff.current) > 0.002) {
      lastHandoff.current = d.burn;
      const h = d.burn.toFixed(3);
      for (const st of [stage0, stage1, stage2, stage3, stage4]) {
        st.current?.style.setProperty("--handoff", h);
      }
    }

    /*
     * ── The glitch ──
     *
     * The headings split into cyan and purple and jump sideways. It peaks
     * halfway through each
     * dissolve, when the burn is at its most ragged, and only while the page
     * is moving — a reader who stops mid-dissolve gets a still screen. It
     * bursts for under half a second as the hammer lands, and once as the page
     * opens. Nothing is written while it is idle, and the reduced-motion path
     * never sets a burn or a clock, so it never runs there.
     */
    const b = d.burn;
    const down = d.scene[3] >= 0.56 && d.scene[3] < 0.95;
    if (down && !hammerDown.current) hammerAt.current = d.t;
    hammerDown.current = down;
    const impact = 1 - seg(d.t - hammerAt.current, 0.05, 0.45);
    const intro = seg(d.t, 0.1, 0.25) * (1 - seg(d.t, 0.3, 0.9));
    const g = Math.max(
      4 * b * (1 - b) * Math.min(1, d.vel * 5),
      impact,
      intro * 0.8,
    );
    if (g > 0.02) {
      /* New offsets on roughly every third frame: a stepped jump reads as a
         bad signal, a smooth one as a wobble. */
      const jump = !glitchOn.current || Math.random() < 0.35;
      const gj = (Math.random() * 2 - 1).toFixed(2);
      for (const el of glitchEls.current) {
        if (!glitchOn.current) el.setAttribute("data-on", "");
        el.style.setProperty("--glitch", g.toFixed(3));
        if (jump) el.style.setProperty("--gj", gj);
      }
      glitchOn.current = true;
    } else if (glitchOn.current) {
      glitchOn.current = false;
      for (const el of glitchEls.current) el.removeAttribute("data-on");
    }

    /** True when this scene's progress moved enough to be worth restyling. */
    const moved = (i: number) => {
      if (Math.abs(d.scene[i] - lastT.current[i]) < 0.0004) return false;
      lastT.current[i] = d.scene[i];
      return true;
    };

    /* ── 01 · ГУДАМЖ — the monolith docks, then we fall through it ── */
    const s1 = stage0.current;
    if (s1 && moved(0)) {
      const t = d.scene[0];
      set(s1, {
        roll: -1.25 * t,
        fade: 1 - seg(t, 0, 0.45),
        lift: seg(t, 0, 0.5),
        lineFade: 1 - seg(t, 0.05, 0.5),
        portalScale: 1 + easeIn(t) * 6.5,
        portalFade: 1 - seg(t, 0.55, 0.95),
      });
    }

    /* ── 02 · ҮҮД — the two clocks arrive, are dissected, then the camera
          pushes into the bid clock ── */
    const s2 = stage1.current;
    if (s2 && moved(1)) {
      const t = d.scene[1];
      const arrive = easeOut(seg(t, 0, 0.28));
      const run = seg(t, 0.3, 0.74);
      const leave = seg(t, 0.68, 0.8);
      set(s2, {
        dialA: -140 * (1 - arrive),
        dialB: 140 * (1 - arrive),
        dialFade: arrive,
        roundFade: (1 - leave) * arrive,
        titleFade: seg(t, 0.03, 0.25) * (1 - seg(t, 0.72, 0.88)),
        laser: seg(t, 0.24, 0.38),
        txtFade: seg(t, 0.29, 0.46),
        coFade: 1 - seg(t, 0.76, 0.9),
        zoom: 1 + easeIn(seg(t, 0.7, 1)) * 1.55,
      });
      /* The bid clock runs down while the round clock barely moves. That
         contrast is the entire argument for the format. */
      if (sweepBid.current) {
        sweepBid.current.style.strokeDashoffset = String(CIRC * run);
      }
      if (sweepRound.current) {
        sweepRound.current.style.strokeDashoffset = String(CIRC * run * 0.22);
      }
      const first = ROUNDS[0];
      if (bidVal.current) {
        bidVal.current.textContent = mmss(first.bidClockSec * (1 - run));
      }
      if (roundVal.current) {
        roundVal.current.textContent = mmss(
          first.durationMin * 60 * (1 - run * 0.22),
        );
      }
    }

    /* ── 03 · ШАТ — split velocity ── */
    const s3 = stage2.current;
    if (s3 && moved(2)) {
      const t = d.scene[2];
      set(s3, {
        railA: 22 - 100 * t,
        railB: 34 - 124 * t,
      });
      /* Index from rail A's own geometry, so the lit row is always the one
         actually sitting on the axis. */
      const i = Math.min(5, Math.max(0, Math.round((t - A0) / ASTEP)));
      if (i !== activeRow.current) {
        activeRow.current = i;
        for (const rail of [railA.current, railB.current]) {
          if (!rail) continue;
          for (let k = 0; k < rail.children.length; k++) {
            rail.children[k].classList.toggle(s.rowOn, k === i);
          }
        }
      }
    }

    /* ── 04 · БОСГО — the shear, then the hammer ── */
    const s4 = stage3.current;
    if (s4 && moved(3)) {
      const t = d.scene[3];
      const out = 1 - seg(t, 0.83, 0.95);
      set(s4, {
        shearFade: seg(t, 0, 0.24) * (1 - seg(t, 0.5, 0.56)),
        shearScale: 1.3 - easeOut(seg(t, 0, 0.24)) * 0.3,
        shear: easeIn(seg(t, 0.36, 0.55)),
        flood: 0.85 * seg(t, 0.07, 0.48) * (1 - seg(t, 0.72, 0.9)),
        hammerFade: seg(t, 0.55, 0.62) * out,
        hammerScale: 1.45 - easeOut(seg(t, 0.55, 0.72)) * 0.45,
        subFade: seg(t, 0.64, 0.78) * out,
      });
    }

    /* ── 05 · ТАНХИМ — the door opens ── */
    const s5 = stage4.current;
    if (s5 && moved(4)) {
      const t = d.scene[4];
      set(s5, {
        door: easeOut(seg(t, 0, 0.6)),
        /* Out completely by the end of the scene. It used to keep a third of
           its light, and that wash then scrolled away with the stage and
           showed its bottom edge as a hard line across the epilogue. */
        doorFade: seg(t, 0, 0.2) * (1 - seg(t, 0.7, 1)),
        roll: 1.15 * (1 - easeOut(seg(t, 0.2, 0.62))),
        ledeFade: seg(t, 0.35, 0.62),
      });
    }
  });

  return (
    <div ref={rootEl} className={s.root}>
      <Shaft />
      <div className={s.vignette} aria-hidden />

      {/* The wordmark is a way out, not just a label — on the About page this
          landing has no navbar, so tapping the logo returns to the catalogue.
          Anchor nested inside the .float .mark box, the same shape as the jump
          link below, so `.float a` gives it the right opacity, hover glow and
          no underline. */}
      <div className={`${s.float} ${s.mark}`}>
        <Link href="/lots">{t.brand.name}</Link>
      </div>
      <div className={`${s.float} ${s.jump}`}>
        <Link href="/lots">{t.nav.lots}</Link>
      </div>

      {/* ══ 01 · ГУДАМЖ ═══════════════════════════════════════════════════ */}
      <section ref={scene0} className={`${s.scene} ${s.s1}`}>
        <div ref={stage0} className={s.stage}>
          <svg className={s.portal} viewBox="0 0 100 100" aria-hidden>
            <rect x="6" y="6" width="88" height="88" strokeWidth="1" opacity=".22" />
            <rect x="17" y="17" width="66" height="66" strokeWidth="1" opacity=".16" />
            <rect x="28" y="28" width="44" height="44" strokeWidth="1" opacity=".11" />
            <rect x="39" y="39" width="22" height="22" strokeWidth="1" opacity=".07" />
          </svg>

          <div className={s.s1Wrap}>
            <div className={s.slate}>
              <span><Decode text={t.home.slatePlace} scene={0} /></span>
              <span><Decode text={t.home.slateEdition} scene={0} /></span>
              <span><Decode text={t.home.slateYear} scene={0} /></span>
            </div>
            <h1 className={`${s.wordmark} ${s.glitch}`}>
              <Split text={t.brand.name} />
            </h1>
            <p className={s.s1Line}>
              <b>{t.home.headline[0]}</b> {t.home.headline[1]}
            </p>
            <p className={s.s1Sub}>
              <Decode text={t.home.eyebrow} scene={0} duration={900} />
            </p>
          </div>

          <div className={s.cue}>
            <span>{t.descent.scrollCue}</span>
            <i />
          </div>
          <div className={s.floor}>
            <Decode text={t.descent.floors.street} scene={0} />
          </div>
        </div>
      </section>

      {/* ══ 02 · ҮҮД ══════════════════════════════════════════════════════ */}
      <section ref={scene1} className={`${s.scene} ${s.s2}`}>
        <div ref={stage1} className={s.stage}>
          <div className={s.s2Wrap}>
            <div className={s.s2Title}>
              <p className={s.eyebrow}>
                <Decode text={t.descent.clocksEyebrow} scene={1} />
              </p>
              <h2 className={s.glitch}>
                <Decode text={t.descent.clocksTitle} scene={1} duration={900} />
              </h2>
            </div>

            <div className={s.dials}>
              <div className={`${s.dial} ${s.dialBid}`}>
                <svg viewBox="0 0 200 200">
                  <circle className={s.rim} cx="100" cy="100" r="94" />
                  <circle className={s.rim} cx="100" cy="100" r="78" opacity=".14" />
                  <Ticks />
                  <circle
                    ref={sweepBid}
                    className={s.sweep}
                    cx="100" cy="100" r="86"
                    transform="rotate(-90 100 100)"
                    strokeDasharray={CIRC}
                  />
                </svg>
                <div ref={bidVal} className={s.dialVal}>
                  {mmss(ROUNDS[0].bidClockSec)}
                </div>
              </div>

              <div className={`${s.dial} ${s.dialRound}`}>
                <svg viewBox="0 0 200 200">
                  <circle className={s.rim} cx="100" cy="100" r="94" />
                  <circle className={s.rim} cx="100" cy="100" r="78" opacity=".14" />
                  <Ticks />
                  <circle
                    ref={sweepRound}
                    className={s.sweep}
                    cx="100" cy="100" r="86"
                    transform="rotate(-90 100 100)"
                    strokeDasharray={CIRC}
                  />
                </svg>
                <div ref={roundVal} className={s.dialVal}>
                  {mmss(ROUNDS[0].durationMin * 60)}
                </div>
              </div>
            </div>

            <div className={s.coRow}>
              <div className={s.callout}>
                <div className={s.laser} />
                <div className={s.calloutTxt}>
                  <h3>
                    <Decode text={t.room.bidClock} scene={1} at={0.3} />
                  </h3>
                  <p>{t.rules.clocksBidBody}</p>
                </div>
              </div>
              <div className={`${s.callout} ${s.coRound}`}>
                <div className={s.laser} />
                <div className={s.calloutTxt}>
                  <h3>
                    <Decode text={t.rules.clocksRoundTitle} scene={1} at={0.3} />
                  </h3>
                  <p>{t.rules.clocksRoundBody}</p>
                </div>
              </div>
            </div>
          </div>
          <div className={s.floor}>
            <Decode text={t.descent.floors.vestibule} scene={1} />
          </div>
        </div>
      </section>

      {/* ══ 03 · ШАТ ══════════════════════════════════════════════════════ */}
      <section ref={scene2} className={`${s.scene} ${s.s3}`}>
        <div ref={stage2} className={s.stage}>
          <div className={s.s3Wrap}>
            <div className={s.axis} />

            <div ref={railA} className={`${s.rail} ${s.railA}`}>
              {ROUNDS.map((r) => (
                <div key={r.n} className={s.row}>
                  <span className={s.n}>{String(r.n).padStart(2, "0")}</span>
                  <span className={s.lab}>{t.descent.roundWord}</span>
                </div>
              ))}
            </div>

            <div ref={railB} className={`${s.rail} ${s.railB}`}>
              {ROUNDS.map((r, i) => (
                <div key={r.n} className={s.row}>
                  <span
                    className={s.clock}
                    /* The type grows as the clock shrinks. */
                    style={{ fontSize: `clamp(${2.6 + i * 0.36}rem, ${7.5 + i * 1.3}vw, ${6.5 + i * 1.3}rem)` }}
                  >
                    {bidClockLabel(r.bidClockSec)}
                  </span>
                  <span className={s.dur}>
                    {t.descent.lasts(`${r.durationMin} ${t.common.min}`)}
                  </span>
                </div>
              ))}
            </div>

            <p className={s.s3Note}>
              <Decode text={t.descent.stairNote} scene={2} duration={1000} />
            </p>
          </div>
          <div className={s.floor}>
            <Decode text={t.descent.floors.stair} scene={2} />
          </div>
        </div>
      </section>

      {/* ══ 04 · БОСГО ════════════════════════════════════════════════════ */}
      <section ref={scene3} className={`${s.scene} ${s.s4}`}>
        <div ref={stage3} className={s.stage}>
          <div className={s.flood} aria-hidden />
          <div className={s.s4Wrap}>
            <div className={s.s4Stack}>
              <span
                className={`${s.shear} ${s.glitch}`}
                aria-label={t.descent.finalClock}
              >
                <span className={`${s.half} ${s.halfTop}`} aria-hidden>
                  {t.descent.finalClock}
                </span>
                <span className={`${s.half} ${s.halfBot}`} aria-hidden>
                  {t.descent.finalClock}
                </span>
              </span>
              <p className={`${s.hammer} ${s.glitch}`}>{t.descent.hammered}</p>
            </div>
            <p className={s.s4Sub}>
              <Decode text={t.room.soldNote} scene={3} at={0.62} duration={900} />
            </p>
          </div>
          <div className={s.floor}>
            <Decode text={t.descent.floors.threshold} scene={3} />
          </div>
        </div>
      </section>

      {/* ══ 05 · ТАНХИМ ═══════════════════════════════════════════════════ */}
      <section ref={scene4} className={`${s.scene} ${s.s5}`}>
        <div ref={stage4} className={s.stage}>
          <div className={s.door} aria-hidden>
            <i />
          </div>
          <div className={s.s5Wrap}>
            <p className={s.eyebrow}>
              <Decode text={t.descent.floors.hall} scene={4} />
            </p>
            <h2 className={s.glitch}>
              <Split text={t.descent.hallTitle} />
            </h2>
            <p className={s.s5Lede}>{t.descent.hallLede}</p>
          </div>
          <div className={s.floor}>
            <Decode text={t.descent.floors.hall} scene={4} />
          </div>
        </div>
      </section>

      {/* ══ epilogue — the one thing on this page that goes anywhere ═══════ */}
      <div className={s.epilogue}>
        <div className={s.enter}>
          <Link href="/lots">{t.descent.enter}</Link>
          <small>{t.home.pointNote}</small>
        </div>
      </div>

      {/*
        The dissolve into the page below. Rendered last so it paints over the
        final scene, and absolutely positioned at the bottom of the descent so
        it only exists there — see `.tail` in the stylesheet for why the shaft
        used to end at a visible line.
      */}
      <div className={s.tail} aria-hidden />
    </div>
  );
}

/** Writes a batch of custom properties onto a stage element. */
function set(el: HTMLElement, vars: Record<string, number>) {
  for (const k in vars) el.style.setProperty(`--${k}`, String(vars[k]));
}
