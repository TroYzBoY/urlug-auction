import { notFound } from "next/navigation";
import { AuctionRoom } from "@/components/room/AuctionRoom";
import { LotPreview } from "@/components/lot/LotPreview";
import { getLot, getRoomState } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { isWatching } from "@/lib/repo/watchlist";
import { t } from "@/lib/copy";

/*
 * No `generateStaticParams`. A prerendered auction page is stale the moment
 * anybody bids, and every render here reads the session anyway — so the page is
 * dynamic by nature and pretending otherwise would only mean a build that needs
 * a database.
 */

export async function generateMetadata(props: PageProps<"/auction/[id]">) {
  const { id } = await props.params;
  const lot = await getLot(id);
  if (!lot) return { title: t.common.notFound };
  return {
    title: `${lot.code} — ${lot.title}`,
    description: lot.note,
  };
}

/**
 * One URL per lot, two surfaces. A lot that is live — or closed and awaiting a
 * decision — gets the dark room; everything else gets the catalogue preview,
 * and the same link becomes the room when the session opens.
 */
export default async function AuctionPage(props: PageProps<"/auction/[id]">) {
  const { id } = await props.params;

  const [lot, user] = await Promise.all([getLot(id), currentUser()]);
  if (!lot) notFound();

  /*
   * `review` gets the room as well as `live`. Bidding is over, but everyone who
   * was in there is waiting on an answer, and the room is the only surface with
   * an open stream — so the award arrives on screen the moment an admin makes
   * it, instead of on the viewer's next reload.
   */
  if (lot.status !== "live" && lot.status !== "review") {
    return (
      <LotPreview
        lot={lot}
        watching={user ? await isWatching(user.id, id) : null}
      />
    );
  }

  /*
   * The room's opening state is read here, on the server, and rendered into the
   * page — so the first paint shows the real price and the real clock rather
   * than a spinner while the stream connects.
   *
   * `user.id` is passed from the session. It is what makes `hasBid` and `isYou`
   * correct, and it is never accepted from the client: `hasBid` decides whether
   * the late-entry floor applies.
   */
  const room = await getRoomState(id, user?.id ?? null);
  if (!room) {
    return (
      <LotPreview
        lot={lot}
        watching={user ? await isWatching(user.id, id) : null}
      />
    );
  }

  return (
    <AuctionRoom
      initialState={room}
      viewerPaddle={user?.paddle ?? null}
      viewerName={user?.name ?? null}
      canBid={user !== null && user.phoneVerified && user.status === "active"}
      balancePts={user?.balancePts ?? 0}
    />
  );
}
