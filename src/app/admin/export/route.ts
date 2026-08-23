import { headers } from "next/headers";
import { recordDetached } from "@/lib/audit";
import { log } from "@/lib/observability";
import { ledgerRows, settlementRows, topupRows } from "@/lib/repo/export";
import { clientIpFrom, requireAdmin } from "@/lib/session";
import { stamp, workbook, type Sheet } from "@/lib/xlsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /admin/export — the money, as a spreadsheet
 *
 * Three tabs: point purchases, what winners owe, and the ledger both are
 * reconciled against.
 *
 * `requireAdmin()` first, and it calls `notFound()` rather than returning 403 —
 * the same 404 the /admin page gives a signed-out visitor, so the route does
 * not confirm its own existence to someone guessing at URLs.
 *
 * ⚠ Every row carries a bidder's phone number, so the download is written to
 * the audit log. A file of everyone's contact details leaving the building
 * should leave a trace of who took it and when.
 *
 * Not cached, at any layer. A spreadsheet of live financial data served from a
 * CDN edge would be both stale and readable by whoever asked next.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  const h = await headers();

  const [topups, settlements, ledger] = await Promise.all([
    topupRows(),
    settlementRows(),
    ledgerRows(),
  ]);

  const sheets: Sheet[] = [
    {
      name: "Цэнэглэлт",
      columns: [
        "№",
        "Үүссэн",
        "Төлсөн",
        "Паддл",
        "Нэр",
        "Утас",
        "Оноо",
        "Дүн (₮)",
        "Төлөв",
        "Суваг",
        "Гүйлгээний дугаар",
        "Лавлах",
      ],
      rows: topups.map((r) => [
        r.id,
        stamp(r.createdAt),
        stamp(r.paidAt),
        r.paddle,
        r.name,
        r.phone,
        r.points,
        r.amountMnt,
        r.status,
        r.provider,
        r.providerRef,
        r.reference,
      ]),
    },
    {
      name: "Лотын төлбөр",
      columns: [
        "Лот",
        "Код",
        "Нэр",
        "Паддл",
        "Худалдан авагч",
        "Утас",
        "Алхны үнэ (оноо)",
        "Төлөв",
        "Эцсийн хугацаа",
        "Төлсөн",
        "Тэмдэглэл",
      ],
      rows: settlements.map((r) => [
        r.lotId,
        r.code,
        r.title,
        r.paddle,
        r.name,
        r.phone,
        r.hammerPts,
        r.status,
        stamp(r.dueBy),
        stamp(r.paidAt),
        r.note,
      ]),
    },
    {
      name: "Гүйлгээ",
      columns: [
        "№",
        "Огноо",
        "Паддл",
        "Нэр",
        "Утас",
        "Өөрчлөлт (оноо)",
        "Төрөл",
        "Холбоос",
        "Дугаар",
        "Тайлбар",
      ],
      rows: ledger.map((r) => [
        r.id,
        stamp(r.createdAt),
        r.paddle,
        r.name,
        r.phone,
        r.deltaPts,
        r.kind,
        r.refType,
        r.refId,
        r.memo,
      ]),
    },
  ];

  const file = workbook(sheets);
  const today = stamp(new Date()).slice(0, 10);
  const name = `urlug-tulbur-${today}.xlsx`;

  recordDetached({
    actorUserId: admin.id,
    action: "admin.export_downloaded",
    detail: {
      topups: topups.length,
      settlements: settlements.length,
      ledger: ledger.length,
    },
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  });

  log.info({
    event: "admin.export_downloaded",
    actorId: admin.id,
    rows: topups.length + settlements.length + ledger.length,
  });

  return new Response(new Uint8Array(file), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      /* The filename is ASCII, so no RFC 5987 encoding is needed for it. */
      "content-disposition": `attachment; filename="${name}"`,
      "content-length": String(file.length),
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
