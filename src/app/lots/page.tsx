import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Reveal } from "@/components/site/Reveal";
import { LotCard } from "@/components/lot/LotCard";
import { Pagination } from "@/components/lot/Pagination";
import { getLiveLots, getResultLots, getUpcomingLots } from "@/lib/api";
import { t } from "@/lib/copy";
import type { Lot } from "@/lib/types";
import { CatalogueHero } from "@/components/lot/CatalogueHero";
import { coverOf } from "@/lib/types";

export const metadata: Metadata = {
  title: t.lots.title,
  description: t.lots.lede,
};

/** Nine lots fill three desktop rows; phones use two columns. */
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
 * The full catalogue: search and filter, then page.
 *
 * All three live in the URL rather than component state, so results can
 * be linked, bookmarked and shared, and the whole thing stays a Server
 * Component with no client JS.
 */
export default async function LotsPage(props: PageProps<"/lots">) {
  const params = await props.searchParams;

  const query = (one(params.q) ?? "").trim().slice(0, 100);
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
  const featured =
    [live, upcoming, results]
      .map((pool) => pool.find((lot) => coverOf(lot)))
      .find((lot) => lot !== undefined) ??
    pools.all[0] ??
    null;
  const search = query.toLocaleLowerCase("mn");
  const matching = (pool: Lot[]) =>
    search
      ? pool.filter((lot) =>
          `${lot.title} ${lot.maker} ${lot.code} ${lot.year}`
            .toLocaleLowerCase("mn")
            .includes(search),
        )
      : pool;
  const lots = matching(pools[filter]);

  const totalPages = Math.max(1, Math.ceil(lots.length / PAGE_SIZE));
  /* Clamped, so a hand-edited ?page=99 lands on the last page rather than an
     empty grid. */
  const page = Math.min(
    Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1),
    totalPages,
  );

  const from = (page - 1) * PAGE_SIZE;
  const visible = lots.slice(from, from + PAGE_SIZE);

  const makeHref = (p: number, key: FilterKey = filter) => {
    const values = new URLSearchParams({ filter: key });
    if (query) values.set("q", query);
    if (p > 1) values.set("page", String(p));
    return `/lots?${values.toString()}#catalogue`;
  };

  return (
    <>
      <SiteHeader />

      <main id="main" className="pt-28 md:pt-32">
        <CatalogueHero lot={featured} />

        <section id="catalogue" className="catalogue-collection gutter">
          <div className="collection-heading">
            <div>
              <p className="eyebrow text-electric">{t.lots.eyebrow}</p>
              <h2 className="text-ink mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                {t.lots.collectionTitle}
              </h2>
              <p className="text-muted mt-2 text-sm">{t.lots.collectionLede}</p>
            </div>
            <form
              action="/lots#catalogue"
              method="get"
              className="catalogue-search"
              key={`${filter}:${query}`}
            >
              <input type="hidden" name="filter" value={filter} />
              <label htmlFor="lot-search" className="sr-only">
                {t.lots.searchLabel}
              </label>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-4 shrink-0"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                id="lot-search"
                type="search"
                name="q"
                defaultValue={query}
                maxLength={100}
                placeholder={t.lots.searchPlaceholder}
              />
              <button type="submit" aria-label={t.lots.searchLabel}>
                →
              </button>
            </form>
          </div>

          <div className="catalogue-toolbar">
            <nav className="catalogue-filters" aria-label={t.lots.eyebrow}>
              {FILTERS.map((f) => {
                const active = f.key === filter;
                const count = matching(pools[f.key]).length;
                return (
                  <Link
                    key={f.key}
                    href={makeHref(1, f.key)}
                    aria-current={active ? "page" : undefined}
                    className="catalogue-filter"
                  >
                    {f.key === "live" && (
                      <span aria-hidden className="filter-live-dot" />
                    )}
                    {f.label}
                    <span data-numerals>{count}</span>
                  </Link>
                );
              })}
            </nav>
            <p className="catalogue-count" data-numerals>
              {t.lots.countLabel(lots.length)}
            </p>
          </div>
          {query && (
            <div className="text-muted mt-5 flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-0 wrap-anywhere">«{query}»</span>
              <Link
                href={`/lots?filter=${filter}#catalogue`}
                className="text-accent underline underline-offset-4"
              >
                {t.lots.clearSearch}
              </Link>
            </div>
          )}

          {visible.length === 0 ? (
            /*
              Two different kinds of empty, and saying the wrong one costs a
              visitor. "No lots in this category" is only true when another
              category has some — it invites a click that helps. When the whole
              catalogue is empty it is a lie that sends somebody round all four
              filters before they leave, and right now it is the first thing
              anybody arriving at the site would read.
            */
            <div className="catalogue-empty mt-8">
              {query ? (
                <>
                  <p className="text-ink text-base">{t.lots.searchEmpty}</p>
                  <p className="text-muted mt-2 text-sm">
                    {t.lots.searchEmptyHint}
                  </p>
                  <Link
                    href={`/lots?filter=${filter}#catalogue`}
                    className="text-accent mt-5 inline-block text-sm underline underline-offset-4"
                  >
                    {t.lots.clearSearch}
                  </Link>
                </>
              ) : pools.all.length === 0 ? (
                <>
                  <p className="text-ink text-base">{t.lots.emptyHouse}</p>
                  <p className="text-muted mt-2 max-w-prose text-sm leading-relaxed">
                    {t.lots.emptyHouseHint}
                  </p>
                  <Link
                    href="/rules"
                    className="eyebrow border-line text-ink hover:border-accent hover:text-accent mt-5 inline-flex h-10 items-center border px-4 transition-colors"
                  >
                    {t.room.rulesLink}
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-muted text-sm">{t.lots.empty}</p>
                  <Link
                    href="/lots?filter=all#catalogue"
                    className="text-accent mt-3 inline-block text-sm underline underline-offset-4"
                  >
                    {t.lots.emptyOther}
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="eyebrow mt-7 text-[0.625rem]" data-numerals>
                {t.lots.showing(from + 1, from + visible.length, lots.length)}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 lg:gap-6">
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
