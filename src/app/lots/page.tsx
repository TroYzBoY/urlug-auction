import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Reveal } from "@/components/site/Reveal";
import { LotCard } from "@/components/lot/LotCard";
import { Pagination } from "@/components/lot/Pagination";
import { getLiveLots, getResultLots, getUpcomingLots } from "@/lib/api";
import { t } from "@/lib/copy";
import type { Lot } from "@/lib/types";

export const metadata: Metadata = {
  title: t.lots.title,
  description: t.lots.lede,
};

const BEAT = 90;

/** 9 fills the desktop grid exactly (3×3) and the phone grid evenly (2-up). */
const PAGE_SIZE = 9;

const FILTERS = [
  { key: "all", label: t.lots.filterAll },
  { key: "live", label: t.lots.filterLive },
  { key: "upcoming", label: t.lots.filterUpcoming },
  { key: "results", label: t.lots.filterResults },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** searchParams values arrive as string | string[] | undefined. */
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The full catalogue: filter, then page.
 *
 * Both live in the URL rather than in component state, so a page of results can
 * be linked, bookmarked and shared, and the whole thing stays a Server
 * Component with no client JS.
 */
export default async function LotsPage(props: PageProps<"/lots">) {
  const params = await props.searchParams;

  const rawFilter = one(params.filter);
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter)
    ? (rawFilter as FilterKey)
    : "all";

  const [live, upcoming, results] = await Promise.all([
    getLiveLots(),
    getUpcomingLots(),
    getResultLots(),
  ]);

  /* Live first in the combined view — it is the only group with a clock. */
  const pools: Record<FilterKey, Lot[]> = {
    all: [...live, ...upcoming, ...results],
    live,
    upcoming,
    results,
  };
  const lots = pools[filter];

  const totalPages = Math.max(1, Math.ceil(lots.length / PAGE_SIZE));
  /* Clamped, so a hand-edited ?page=99 lands on the last page rather than an
     empty grid. */
  const page = Math.min(
    Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1),
    totalPages,
  );

  const from = (page - 1) * PAGE_SIZE;
  const visible = lots.slice(from, from + PAGE_SIZE);

  const makeHref = (p: number) =>
    `/lots?filter=${filter}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <Header />

      <main className="pt-28 md:pt-36">
        <section className="gutter border-b border-line/40 pb-10 md:pb-14">
          <p className="eyebrow animate-rise-in text-muted">{t.lots.eyebrow}</p>

          <h1
            className="display mt-6 animate-rise-in text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.96] tracking-[-0.035em] text-ink"
            style={{ animationDelay: `${BEAT}ms` }}
          >
            {t.lots.title}
          </h1>

          <p
            className="mt-6 max-w-xl animate-rise-in text-base leading-relaxed text-ink-soft md:text-lg"
            style={{ animationDelay: `${BEAT * 2}ms` }}
          >
            {t.lots.lede}
          </p>
        </section>

        <section className="gutter py-10 md:py-14">
          {/* Filters. Links, not buttons — each is a real, shareable URL.
              Scrollable on phones so four chips never wrap awkwardly. */}
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scroll-quiet md:mx-0 md:px-0">
            {FILTERS.map((f) => {
              const active = f.key === filter;
              const count = pools[f.key].length;
              return (
                <Link
                  key={f.key}
                  href={`/lots?filter=${f.key}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[0.75rem] font-medium tracking-[0.08em] uppercase transition-colors ${
                    active
                      ? "border-transparent bg-ink text-ground"
                      : "border-line-strong/30 text-ink-soft hover:border-accent hover:text-accent"
                  }`}
                >
                  {f.label}
                  <span
                    data-numerals
                    className={active ? "opacity-60" : "text-faint"}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="mt-10 text-sm text-muted">{t.lots.empty}</p>
          ) : (
            <>
              <p className="eyebrow mt-6" data-numerals>
                {t.lots.showing(from + 1, from + visible.length, lots.length)}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-8">
                {visible.map((lot, i) => (
                  /* Stagger by column, not index — otherwise the last card in a
                     nine-item grid waits most of a second. */
                  <Reveal key={lot.id} delay={(i % 3) * 80} y={18}>
                    <LotCard lot={lot} />
                  </Reveal>
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                makeHref={makeHref}
              />
            </>
          )}
        </section>
      </main>

      <Footer />
    </>
  );
}
