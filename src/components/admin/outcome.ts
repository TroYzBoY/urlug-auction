import { t } from "@/lib/copy";

/**
 * How the dashboard names an auction's state. Shared by the dashboard and each
 * lot's page, so the two can never call the same lot different things.
 */
export const OUTCOME_LABEL: Record<string, string> = {
  scheduled: t.lots.filterUpcoming,
  running: t.room.live,
  review: t.admin.reviewStatus,
  sold: t.lot.statusSold,
  unsold: t.lot.statusUnsold,
};
