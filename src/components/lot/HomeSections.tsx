import Link from "next/link";
import { Reveal } from "@/components/site/Reveal";
import { CountUp } from "@/components/site/CountUp";
import { t } from "@/lib/copy";
import { pts } from "@/lib/format";
import type { HouseStats } from "@/lib/repo/home";
import { coverOf, type Lot } from "@/lib/types";
import { LotPlate } from "./LotPlate";

/**
 * "Саяхны ялагчид" — the latest lots the hammer fell on: what they went for,
 * in which round, after how many bids. The round is the format's most telling
 * figure, so it is on every card.
 *
 * Who won is deliberately not shown. The site stopped putting paddles and
 * names in front of other bidders; a public front page is the last place to
 * start again.
 */
export function SoldStrip({ lots }: { lots: Lot[] }) {
  if (lots.length === 0) return null;
  return (
    <section className="sold-strip gutter" aria-labelledby="sold-title">
      <Reveal className="collection-heading">
        <div>
          <p className="eyebrow text-electric">{t.lots.soldEyebrow}</p>
          <h2
            id="sold-title"
            className="text-ink mt-3 text-2xl font-semibold tracking-tight md:text-3xl"
          >
            {t.lots.soldTitle}
          </h2>
        </div>
        <Link
          href="/lots?filter=results#catalogue"
          className="text-accent text-sm underline underline-offset-4"
        >
          {t.lots.soldAll} →
        </Link>
      </Reveal>

      <ol className="sold-row scroll-quiet">
        {lots.map((lot) => (
          <li key={lot.id}>
            <Link href={`/auction/${lot.id}`} className="sold-card group">
              <LotPlate
                category={lot.category}
                code={lot.code}
                image={coverOf(lot)?.url}
                alt={coverOf(lot)?.alt ?? lot.title}
                ratio="aspect-[4/3]"
                sizes="15rem"
              />
              <div className="p-3.5">
                <p className="text-ink group-hover:text-accent truncate text-sm font-semibold transition-colors">
                  {lot.title}
                </p>
                <p
                  className="text-signal mt-2 text-base font-semibold"
                  data-numerals
                >
                  {pts(lot.hammerPts ?? 0)}
                  <span className="text-muted ml-1 text-xs font-normal">
                    {t.common.point}
                  </span>
                </p>
                <p className="text-muted mt-1 text-xs" data-numerals>
                  {t.lots.soldMeta(lot.hammerRound ?? 6, lot.bidCount ?? 0)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* The three steps' pictures. Each is a small loop in CSS (`.how-icon` in
   edgerunners.css) that ends at rest, so reduced motion leaves the picture
   standing still rather than frozen mid-move. */
function StepIcon({ step }: { step: number }) {
  if (step === 0) {
    /* Six rounds: six arcs of a ring, lighting in turn. */
    return (
      <svg viewBox="0 0 48 48" className="how-icon how-rounds" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.12;
          const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - 0.12;
          const p = (a: number) =>
            `${(24 + Math.cos(a) * 18).toFixed(2)} ${(24 + Math.sin(a) * 18).toFixed(2)}`;
          return (
            <path
              key={i}
              d={`M${p(a0)} A18 18 0 0 1 ${p(a1)}`}
              style={{ animationDelay: `${i * 0.35}s` }}
            />
          );
        })}
      </svg>
    );
  }
  if (step === 1) {
    /* The clock shrinking: a ring that runs down, over and over. */
    return (
      <svg viewBox="0 0 48 48" className="how-icon how-shrink" aria-hidden>
        <circle cx="24" cy="24" r="18" className="how-track" />
        <circle cx="24" cy="24" r="18" className="how-run" pathLength="100" />
      </svg>
    );
  }
  /* The hammer, falling. */
  return (
    <svg viewBox="0 0 48 48" className="how-icon how-hammer" aria-hidden>
      <g className="how-head">
        <rect x="20" y="9" width="16" height="9" rx="2" />
        <path d="M27 18 L17 36" />
      </g>
      <path d="M10 40 H30" className="how-base" />
    </svg>
  );
}

/**
 * How a sale works, in three steps, over the house's figures counting up.
 * For somebody who has never seen this format, this is the whole of it.
 */
export function HowItWorks({ stats }: { stats: HouseStats }) {
  const figures = [
    { label: t.lots.statLots, value: stats.lots },
    { label: t.lots.statBidsToday, value: stats.bidsToday },
    { label: t.lots.statBidders, value: stats.bidders },
  ];

  return (
    <section className="how-it-works gutter" aria-labelledby="how-title">
      <Reveal>
        <p className="eyebrow text-electric">{t.lots.howEyebrow}</p>
        <h2
          id="how-title"
          className="text-ink mt-3 text-2xl font-semibold tracking-tight md:text-3xl"
        >
          {t.lots.howTitle}
        </h2>
      </Reveal>

      <ol className="how-steps">
        {t.lots.howSteps.map((step, i) => (
          <Reveal as="li" key={step.title} delay={i * 80} className="how-step">
            <div className="flex items-center justify-between">
              <StepIcon step={i} />
              <span className="how-num" data-numerals>
                0{i + 1}
              </span>
            </div>
            <h3 className="text-ink mt-6 text-lg font-semibold">
              {step.title}
            </h3>
            <p className="text-muted mt-2 text-sm leading-relaxed">
              {step.body}
            </p>
          </Reveal>
        ))}
      </ol>

      <Reveal className="house-stats">
        <p className="eyebrow">{t.lots.statsEyebrow}</p>
        <dl>
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                <CountUp value={f.value} />
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
