import type { Metadata } from "next";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Reveal } from "@/components/site/Reveal";
import { RoundLadder } from "@/components/site/RoundLadder";
import {
  LATE_ENTRY_FROM_ROUND,
  LATE_ENTRY_MULTIPLIER,
  POINT_MNT,
  ROUNDS,
  TOTAL_MINUTES,
  TOTAL_ROUNDS,
} from "@/lib/auction";
import { bidClockLabel, groupNumber } from "@/lib/format";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.rules.title,
  description: t.rules.lede,
};

export default function RulesPage() {
  const hours = Math.floor(TOTAL_MINUTES / 60);
  const minutes = TOTAL_MINUTES % 60;

  return (
    <>
      <Header />

      <main className="gutter pt-14 pb-8 md:pt-20">
        <p className="eyebrow animate-rise-in">{t.rules.eyebrow}</p>
        <h1
          className="display mt-5 animate-rise-in text-[clamp(2.75rem,11vw,6rem)] text-ink"
          style={{ animationDelay: "90ms" }}
        >
          {t.rules.title}
        </h1>
        <p
          className="mt-6 max-w-xl animate-rise-in text-base leading-relaxed text-ink-soft md:text-lg"
          style={{ animationDelay: "180ms" }}
        >
          {t.rules.lede}
        </p>

        <p
          data-numerals
          className="mt-7 animate-rise-in text-sm text-muted"
          style={{ animationDelay: "270ms" }}
        >
          {TOTAL_ROUNDS} тойрог · {hours} цаг {minutes} минут · 1{" "}
          {t.common.point} = {groupNumber(POINT_MNT)}₮
        </p>

        {/* ── The collapsing clock ──────────────────────────────────────── */}
        <Reveal
          as="section"
          className="mt-16 border-t border-line pt-10 md:mt-24"
          y={20}
        >
          <div className="grid gap-10 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-16">
            <div>
              <h2 className="text-xl font-medium tracking-[-0.02em] text-ink">
                {t.rules.clocksTitle}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Хаялтын хугацаа тойрог бүрд хумирна. Доорх зураглал нь тойрог
                тус бүрийн хаялтын хугацааг харьцангуй хэмжээгээр харуулж байна.
              </p>
            </div>
            <RoundLadder />
          </div>
        </Reveal>

        {/* ── The numbers ───────────────────────────────────────────────── */}
        <Reveal as="section" className="mt-16 border-t border-line pt-10" y={20}>
          <h2 className="text-xl font-medium tracking-[-0.02em] text-ink">
            Тойргийн хүснэгт
          </h2>

          <div className="mt-6 -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  <Th>{t.rules.table.round}</Th>
                  <Th>{t.rules.table.bidClock}</Th>
                  <Th>{t.rules.table.duration}</Th>
                  <Th>{t.rules.table.increment}</Th>
                  <Th>{t.rules.table.lateEntry}</Th>
                </tr>
              </thead>
              <tbody>
                {ROUNDS.map((r) => {
                  const isLast = r.n === TOTAL_ROUNDS;
                  return (
                    <tr key={r.n} className="border-b border-line">
                      <Td accent={isLast}>{r.n}</Td>
                      <Td accent={isLast}>{bidClockLabel(r.bidClockSec)}</Td>
                      <Td>
                        {r.durationMin} {t.common.min}
                      </Td>
                      <Td>
                        {r.minIncrementPts} {t.common.point}
                      </Td>
                      <Td>
                        {r.n >= LATE_ENTRY_FROM_ROUND
                          ? `${r.n * LATE_ENTRY_MULTIPLIER} ${t.common.point}`
                          : "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* ── Prose rules ───────────────────────────────────────────────── */}
        <Reveal
          as="section"
          className="mt-16 grid gap-x-16 gap-y-10 border-t border-line pt-10 md:grid-cols-2"
          y={20}
        >
          <Rule title={t.rules.pointsTitle} body={t.rules.pointsBody} />
          <Rule title={t.rules.clocksBidTitle} body={t.rules.clocksBidBody} />
          <Rule
            title={t.rules.clocksRoundTitle}
            body={t.rules.clocksRoundBody}
          />
          <Rule title={t.rules.incrementTitle} body={t.rules.incrementBody} />
          <Rule title={t.rules.lateTitle} body={t.rules.lateBody} highlight />
        </Reveal>
      </main>

      <Footer />
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="eyebrow py-3 pr-4 text-left last:pr-0">
      {children}
    </th>
  );
}

function Td({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <td
      data-numerals
      className={`py-3.5 pr-4 font-medium whitespace-nowrap last:pr-0 ${
        accent ? "text-rust" : "text-ink-soft"
      }`}
    >
      {children}
    </td>
  );
}

function Rule({
  title,
  body,
  highlight = false,
}: {
  title: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "border-l-2 border-flare pl-5" : ""}>
      <h3 className="text-base font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
