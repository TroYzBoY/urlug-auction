/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CATALOGUE PHOTOGRAPHS
 *
 * Which photograph stands for which lot, and what its caption says.
 *
 * Every file here is a real photograph from Wikimedia Commons, under CC BY,
 * CC BY-SA or CC0. `db/fixtures/fetch-media.ts` downloads them and writes
 * `public/media/lots/CREDITS.md` recording the author and licence of each one.
 *
 * ── Read this before publishing ──────────────────────────────────────────────
 *
 * ⚠ These are photographs of the MODEL, not of the unit being sold. Some are of
 * the closest real model where the catalogue names a newer one. For a
 * development fixture that is the point — the layout can be judged against real
 * photographs instead of drawings.
 *
 * For a real listing it is not acceptable. A bidder committing to a used device
 * sight unseen is buying its faults: the note on lot 101 claims a 3mm scratch on
 * the back bottom corner, and no stock photograph can show it. Selling against
 * an image of a different, unblemished unit is a misrepresentation, whatever the
 * text says.
 *
 * ⚠ CC BY and CC BY-SA require attribution wherever the image is shown. Nothing
 * in the UI surfaces it yet — CREDITS.md records it, but a published page must
 * either display the credit or use photographs the house owns.
 *
 * Replacing them is a file copy: drop photographs into
 * `public/media/lots/<id>/` under the same names.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CREDITS } from "./credits.ts";

export interface Shot {
  /** Exact File: title on Wikimedia Commons, without the "File:" prefix. */
  commons: string;
  /** The caption, describing what this photograph actually shows. */
  alt: string;
}

export const MEDIA: Record<string, Shot[]> = {
  "101": [
    {
      commons: `About iPhone 16 Pro Max Natural Titanium.jpg`,
      alt: "Урд тал — дэлгэц",
    },
    {
      commons: `Back view of iPhone 16 Pro Max Natural Titanium.jpg`,
      alt: "Ар тал — камерын блок",
    },
    {
      commons: `Right view of iPhone 16 Pro Max Natural Titanium.jpg`,
      alt: "Баруун тал — товчлуурууд",
    },
    {
      commons: `IPhone 16 Pro Max Desert Titanium Rear.png`,
      alt: "Ар тал — титан хайлшин гадаргуу",
    },
  ],
  "102": [
    {
      commons: `A 2021 14-inch Silver MacBook Pro.jpg`,
      alt: "Нээлттэй — дэлгэц ба гар",
    },
    {
      commons: `Apple Macbook Pro 14" 2021 - Back cover.png`,
      alt: "Хаалттай — тагны тал",
    },
    {
      commons: `Apple Macbook Pro 14" 2021 - Keyboard.png`,
      alt: "Гар ба трекпад",
    },
    {
      commons: `Apple Macbook Pro 14" 2021 - Ports on the left side.png`,
      alt: "Зүүн тал — Thunderbolt, MagSafe",
    },
    {
      commons: `Apple Macbook Pro 14" 2021 - Ports on the right side.png`,
      alt: "Баруун тал — HDMI, SDXC",
    },
  ],
  "103": [
    { commons: `AirPods Pro (2nd generation).jpg`, alt: "Кейс ба чихэвчүүд" },
    { commons: `AirPods Pro.jpg`, alt: "Кейс хаалттай" },
    { commons: `AirPods Pro 2.jpg`, alt: "Чихэвч ойроос" },
    { commons: `AirPod pro.jpg`, alt: "Чихэвч — сеткэн тор" },
  ],
  "104": [
    {
      commons: `PlayStation 5 and DualSense.jpg`,
      alt: "Урд тал — босоо байрлал",
    },
    {
      commons: `PlayStation 5 and DualSense (2).jpg`,
      alt: "Консол ба удирдлага",
    },
    { commons: `PS5DigitalEdition.png`, alt: "Хажуу тал — бүрхүүл" },
    {
      commons: `PlayStation 5 and DualSense (cropped).jpg`,
      alt: "DualSense удирдлага",
    },
  ],
  "105": [
    { commons: `About iPad Pro 13-inch (M4).jpg`, alt: "Урд тал — дэлгэц" },
    { commons: `IPad Pro 13-inch backside.jpg`, alt: "Ар тал — алюмин их бие" },
    { commons: `M4 iPad Pro back camera.jpg`, alt: "Ар талын камер ойроос" },
    { commons: `M4 iPad Pro series - 2.jpg`, alt: "Magic Keyboard-той" },
    { commons: `M4 iPad Pro series - 3.jpg`, alt: "Дэлгэц асаалттай" },
  ],
  "106": [
    {
      commons: `Apple Watch Ultra Series 3 Natural Titanium Case.jpg`,
      alt: "Урд тал — титан бие",
    },
    { commons: `Apple Watch Ultra - 3.jpg`, alt: "Дэлгэц асаалттай" },
    { commons: `Apple Watch Ultra - 4.jpg`, alt: "Хажуу тал — Digital Crown" },
    { commons: `Apple Watch Ultra 2.jpg`, alt: "Оосортой — бүтэн харагдац" },
  ],
  "107": [
    { commons: `M4 Mac mini.jpg`, alt: "Дээрээс" },
    { commons: `Mac mini (M4, 2024) - Backside.jpg`, alt: "Ар тал — портууд" },
    { commons: `Bottom of M4 Mac mini.jpg`, alt: "Доод тал — суурь" },
    { commons: `Power Button of M4 Mac mini.jpg`, alt: "Асаах товч" },
  ],
  "108": [
    { commons: `Vision Pro - Cover.jpg`, alt: "Урд тал — гадна шил" },
    { commons: `Vision Pro - Facing right.jpg`, alt: "Баруун хажуу тал" },
    { commons: `Vision Pro - Top.jpg`, alt: "Дээрээс — толгойн оосор" },
    { commons: `Vision Pro - Battery.jpg`, alt: "Гадаад батарей" },
    {
      commons: `Vision Pro - Light Seal Cushion.jpg`,
      alt: "Light Seal дэр — ашиглалтын мөр",
    },
  ],
  "109": [
    { commons: `About iPhone 16 Pro White Titanium.jpg`, alt: "Урд тал" },
    { commons: `Back of iPhone 16 Pro - 1.jpg`, alt: "Ар тал" },
    { commons: `Back of iPhone 16 Pro - 2.jpg`, alt: "Ар тал — камерын блок" },
    { commons: `IPhone 16 Pro (54251031612).jpg`, alt: "Гар дээр — хэмжээ" },
  ],
  "110": [
    { commons: `M2 Macbook Air Midnight model - 2.jpg`, alt: "Нээлттэй" },
    {
      commons: `M2 Macbook Air Midnight model - 1.jpg`,
      alt: "Хаалттай — Midnight өнгө",
    },
    {
      commons: `Magsafe 3 of M2 Macbook Air Midnight Model.jpg`,
      alt: "Зүүн тал — MagSafe 3",
    },
  ],
  "111": [
    { commons: `Apple AirPods Max.jpg`, alt: "Урд тал" },
    { commons: `Apple AirPods Max 3.jpg`, alt: "Хажуу тал — Digital Crown" },
    { commons: `Apple AirPods Max 5.jpg`, alt: "Чихний дэр" },
    {
      commons: `AirPods Max - Smart Case (51817627848).jpg`,
      alt: "Smart Case",
    },
  ],
  "112": [
    {
      commons: `Apple TV 4K and Siri Remote.jpg`,
      alt: "Хайрцаг ба Siri Remote",
    },
    {
      commons: `Apple TV 4K (3rd Generation, 2022) with Siri Remote.jpg`,
      alt: "Дээрээс",
    },
    { commons: `Apple TV 4K 4gen 64gb.jpg`, alt: "Ар тал" },
  ],
};

/**
 * The image list for a lot, in the shape `lots.ts` needs.
 *
 * Everything is written as `.jpg` regardless of what Commons holds, because the
 * fetcher asks for a JPEG thumbnail rather than the original — a 6000px PNG is
 * not a catalogue photograph.
 */
export function imagesFor(id: string) {
  const shots = MEDIA[id];
  if (!shots) throw new Error(`No photographs listed for lot ${id}`);
  return shots.map((shot, i) => {
    const url = `/media/lots/${id}/${String(i + 1).padStart(2, "0")}.jpg`;
    return { url, alt: shot.alt, credit: CREDITS[url] ?? null };
  });
}
