import type { Lot } from "../../src/lib/types.ts";
import { imagesFor } from "./media.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAMPLE CATALOGUE — consumer electronics
 *
 * Development fixtures, loaded by db/seed.ts. Nothing in `src/` can import this
 * file, so there is no path by which sample data reaches a running server.
 *
 * ── On the photographs ───────────────────────────────────────────────────────
 *
 * ⚠ The photographs are of the MODEL, not of the unit being sold — real
 * images from Wikimedia Commons, listed in `media.ts` and downloaded by
 * `npm run db:media`. Some are of the closest real model where the catalogue
 * names a newer one.
 *
 * For a real listing that is not acceptable. A bidder committing to a used
 * device sight unseen is buying its faults: the note on lot 101 claims a 3mm
 * scratch on the back bottom corner, and no stock photograph can show it.
 * Selling against an image of a different, unblemished unit is a
 * misrepresentation whatever the text says.
 *
 * ⚠ CC BY and CC BY-SA require attribution wherever the image appears. See
 * `public/media/lots/CREDITS.md`; nothing in the UI surfaces it yet.
 *
 * ── On the descriptions ──────────────────────────────────────────────────────
 *
 * Written the way an auction catalogue writes: what it is, what condition it is
 * in, what comes with it, and what is wrong with it. The last one is the part
 * that matters — a condition note that lists no faults on a used device is a
 * note nobody believes.
 *
 * `status` decides where in the schedule db/seed.ts places each lot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Fixed epoch so server and client render identical "starts at" strings. */
const BASE = Date.UTC(2026, 8, 19, 3, 0, 0); // 2026-09-19 11:00 UTC+8

export const LOTS: Lot[] = [
  /* ── Live ──────────────────────────────────────────────────────────────── */
  {
    id: "101",
    code: "ЛОТ 101",
    title: "iPhone 17 Pro Max 256GB",
    maker: "Apple",
    year: "2026",
    category: "timepiece",
    note: `Улбар шар (Cosmic Orange) өнгөтэй, 256GB багтаамжтай iPhone 17 Pro Max. Титан хайлшин хүрээ, Ceramic Shield 2 бүрхүүлтэй урд тал.

Дэлгэц: 6.9 инчийн Super Retina XDR OLED, 120Гц ProMotion, 2000 нит хүртэлх гэрэлтэлт. Дэлгэц дээр зураас, толбо алга.

Процессор: A19 Pro, 8 цөмт CPU, 6 цөмт GPU, 16 цөмт Neural Engine.

Камер: 48МП үндсэн, 48МП хэт өргөн, 12МП 5x теле. ProRes RAW, 4K 120fps бичлэг.

Батарей: 94% багтаамжтай (Тохиргоо → Батарей → Эрүүл байдал хэсгээс шалгасан). Цэнэглэх тоолуур 214.

Иж бүрдэл: жинхэнэ хайрцаг, USB-C кабель, ашиглаагүй SIM зүү. Цэнэглэгч ороогүй.

Байдал: Ар талын доод буланд 3мм урттай маажилт байгаа (4 дэх зурагт тод харагдана). Бусад талаараа сайн. Face ID, бүх камер, чанга яригч, чичиргээ шалгагдсан, бүгд хэвийн.

iCloud-оос гарсан, Activation Lock идэвхгүй. IMEI цэвэр, аль ч оператор дээр ажиллана.`,
    provenance:
      "Улаанбаатар, нэг эзэнтэй байсан, 2026 оны 3-р сард худалдаж авсан",
    condition: "Маш сайн — ар талд 3мм маажилт",
    dimensions: "163 × 77.6 × 8.25 мм · 227 г",
    estimateLowPts: 3200,
    estimateHighPts: 4100,
    openingPts: 2400,
    images: imagesFor("101"),
    status: "live",
    startsAt: new Date(BASE).toISOString(),
  },
  {
    id: "102",
    code: "ЛОТ 102",
    title: "MacBook Pro 14″ M4 Pro 1TB",
    maker: "Apple",
    year: "2025",
    category: "manuscript",
    note: `Сансрын хар (Space Black) өнгөтэй 14 инчийн MacBook Pro. M4 Pro чип, 24GB нэгдсэн санах ой, 1TB SSD.

Дэлгэц: 14.2 инчийн Liquid Retina XDR, 120Гц ProMotion, 1600 нит оргил гэрэлтэлт. Пиксел үхээгүй, гэрэлтэлт жигд.

Портууд: 3 × Thunderbolt 5, HDMI, SDXC, MagSafe 3, 3.5мм. Бүгд шалгагдсан.

Гар: АНУ-ын байрлалтай, кирилл наалт наагаагүй. Товчлуурууд бүгд хэвийн, гялалзсан элэгдэл алга.

Батарей: 156 цэнэглэлт, 96% багтаамж. Тэжээлийн адаптер (96W) хайрцагтайгаа хамт.

Байдал: Тагны дээд гадаргууд гэрлийн дор л харагдах маш нимгэн зураас байгаа (3 дахь зурагт тусгай өнцгөөр авсан). Гар, дэлгэцний хүрээ, доод тал цэвэр.

macOS сүүлийн хувилбар суусан, Find My унтраасан, дискийг бүрэн цэвэрлэсэн.`,
    provenance: "Дизайны студиэс, ажлын машин байсан",
    condition: "Сайн — тагны дээр нимгэн зураас",
    dimensions: "312.6 × 221.2 × 15.5 мм · 1.60 кг",
    estimateLowPts: 5400,
    estimateHighPts: 6800,
    openingPts: 4200,
    images: imagesFor("102"),
    status: "live",
    startsAt: new Date(BASE - 40 * 60_000).toISOString(),
  },
  {
    id: "103",
    code: "ЛОТ 103",
    title: "AirPods Pro 3",
    maker: "Apple",
    year: "2026",
    category: "jewellery",
    note: `AirPods Pro гурав дахь үе, USB-C цэнэглэгч кейстэй.

Идэвхтэй чимээ дарах (ANC) хоёр дахин сайжирсан, Adaptive Audio, Conversation Awareness бүрэн ажиллана.

Дуу: H3 чип, чихний хэлбэрт тохирсон дуу тохируулга. Хоёр чихэвч ижил түвшинд, тэнцвэрийн зөрүү алга.

Батарей: кейсгүйгээр 7 цаг (ANC асаалттай), кейстэй нийт 30 цаг хүртэл. Кейсний батарей эрүүл.

Иж бүрдэл: жинхэнэ хайрцаг, S/M/L хэмжээтэй ашиглаагүй чихний оймс, USB-C кабель.

Байдал: Кейсний ирмэгт халаасны элэгдэл бага зэрэг байгаа. Чихэвчүүд цэвэр, сеткэн тор дээр бохирдол алга (4 дэх зурагт ойроос авсан).

Цуврал дугаар шалгагдсан, Apple-ийн баталгаа 2027 оны 2-р сар хүртэл хүчинтэй.`,
    provenance: "Хувийн эзэмшил, баталгаат хугацаа хүчинтэй",
    condition: "Маш сайн — кейст бага элэгдэл",
    dimensions: "Кейс: 45.2 × 60.6 × 21.7 мм · 50.8 г",
    estimateLowPts: 620,
    estimateHighPts: 850,
    openingPts: 450,
    images: imagesFor("103"),
    status: "live",
    startsAt: new Date(BASE - 25 * 60_000).toISOString(),
  },

  /* ── Upcoming ──────────────────────────────────────────────────────────── */
  {
    id: "104",
    code: "ЛОТ 104",
    title: "PlayStation 5 Pro 2TB",
    maker: "Sony",
    year: "2025",
    category: "arms",
    note: `PlayStation 5 Pro, 2TB SSD, дискний хөтөчтэй хувилбар.

Гүйцэтгэл: 67 CU RDNA-д суурилсан GPU, PSSR масштаблалт, 8K гаралт, VRR дэмжинэ.

Иж бүрдэл: нэг DualSense Edge удирдлага (жинхэнэ хайрцагтай), HDMI 2.1 кабель, тэжээлийн утас, босоо тавиур.

Ашиглалт: гэрийн нөхцөлд, тамхины утаа, тэжээвэр амьтангүй орчинд. Сэнс чимээгүй, хэт халалтын шинж алга.

Байдал: Дээд бүрхүүлийн нэг буланд хуруу шилжсэн ул мөр байгаа боловч арчихад арилна. Дискний хөтөч чимээгүй ажиллана, туршилтын диск уншсан.

Данснаас гарсан, дискийг бүрэн форматласан. Бүх шинэчлэлт суусан.`,
    provenance: "Хувийн эзэмшил, гэрийн ашиглалт",
    condition: "Сайн — бүрхүүлд ул мөр",
    dimensions: "388 × 89 × 216 мм · 3.1 кг",
    estimateLowPts: 2400,
    estimateHighPts: 3100,
    openingPts: 1800,
    images: imagesFor("104"),
    status: "upcoming",
    startsAt: new Date(BASE + DAY).toISOString(),
  },
  {
    id: "105",
    code: "ЛОТ 105",
    title: "iPad Pro 13″ M4 512GB",
    maker: "Apple",
    year: "2025",
    category: "painting",
    note: `13 инчийн iPad Pro, M4 чип, 512GB, Wi-Fi + Cellular хувилбар.

Дэлгэц: Ultra Retina XDR, хоёр давхар OLED, 1000 нит тогтмол / 1600 нит оргил. Nano-texture бүрхүүлгүй энгийн шилтэй.

Иж бүрдэл: Apple Pencil Pro (ашиглагдсан, үзүүр шинэ), Magic Keyboard (арын тал бага зэрэг элэгдэлтэй).

Батарей: 92% багтаамж, 187 цэнэглэлт.

Байдал: Дэлгэц төгс, зураасгүй. Ар талын алюминид хэрэглээний нарийн шугамууд бий (5 дахь зурагт хажуугийн гэрлээр авсан). Камерын шил цэвэр.

eSIM идэвхжүүлээгүй, оператороос салгагдсан.`,
    provenance: "Уран бүтээлчийн ажлын хэрэгсэл",
    condition: "Сайн — ар талд хэрэглээний шугамууд",
    dimensions: "281.6 × 215.5 × 5.1 мм · 579 г",
    estimateLowPts: 2900,
    estimateHighPts: 3600,
    openingPts: 2200,
    images: imagesFor("105"),
    status: "upcoming",
    startsAt: new Date(BASE + 2 * DAY).toISOString(),
  },
  {
    id: "106",
    code: "ЛОТ 106",
    title: "Apple Watch Ultra 3 49мм",
    maker: "Apple",
    year: "2026",
    category: "timepiece",
    note: `Apple Watch Ultra 3, 49мм титан бие, Байгалийн өнгө (Natural Titanium).

Дэлгэц: 3000 нит хүртэл, LTPO3 OLED, үргэлж асаалттай горим. Сапфир шил зураасгүй.

Функц: 100м ус нэвтрэхгүй, гүнзгий усны мэдрэгч, хос давтамжийн GPS, түргэн тусламжийн дуут дохио, биеийн температур.

Батарей: 100% багтаамж, 38 цэнэглэлт. Хэвийн ашиглалтад 72 цаг.

Иж бүрдэл: Trail Loop (S/M) болон Ocean Band хоёулаа, жинхэнэ хайрцаг, соронзон цэнэглэгч.

Байдал: Титан биеийн зүүн ирмэгт микро түвшний ул мөр (3 дахь зурагт). Дижитал титэм, Action товч бүгд хэвийн.`,
    provenance: "Уулын аяллын хэрэглээ, 8 сар ашигласан",
    condition: "Маш сайн — биед микро ул мөр",
    dimensions: "49 × 44 × 14.4 мм · 61.8 г (биеэрээ)",
    estimateLowPts: 1400,
    estimateHighPts: 1900,
    openingPts: 1000,
    images: imagesFor("106"),
    status: "upcoming",
    startsAt: new Date(BASE + 3 * DAY).toISOString(),
  },
  {
    id: "107",
    code: "ЛОТ 107",
    title: "Mac mini M4 Pro 24GB / 1TB",
    maker: "Apple",
    year: "2025",
    category: "antique",
    note: `Mac mini, M4 Pro чип, 24GB нэгдсэн санах ой, 1TB SSD. Шинэ жижиг корпустай үе.

Портууд: урд талд 2 × USB-C ба чихэвчний оролт, ар талд 3 × Thunderbolt 5, HDMI, Gigabit Ethernet.

Ашиглалт: студийн орчинд, тасралтгүй асаалттай ажиллаж байсан. Сэнсний чимээ анхны байдлаараа.

Иж бүрдэл: жинхэнэ хайрцаг, тэжээлийн утас. Гар, хулгана ороогүй.

Байдал: Корпус бараг шинэ. Доод талын дугуй суурьт бага зэрэг тоос суусан (4 дэх зурагт). Бүх порт шалгагдсан, Ethernet 1Гб/с батлагдсан.

macOS цэвэр суулгасан, Find My унтраасан.`,
    provenance: "Дуу бичлэгийн студи",
    condition: "Маш сайн",
    dimensions: "127 × 127 × 50 мм · 0.73 кг",
    estimateLowPts: 3100,
    estimateHighPts: 3900,
    openingPts: 2400,
    images: imagesFor("107"),
    status: "upcoming",
    startsAt: new Date(BASE + 4 * DAY).toISOString(),
  },
  {
    id: "108",
    code: "ЛОТ 108",
    title: "Apple Vision Pro 512GB",
    maker: "Apple",
    year: "2024",
    category: "arms",
    note: `Apple Vision Pro, 512GB. Solo Knit Band (M) болон Dual Loop Band хоёулаа.

Дэлгэц: хоёр micro-OLED, нийт 23 сая пиксел. Гэрэлтэлт жигд, үхсэн пиксел алга.

Light Seal: 21W хэмжээтэй. Нэмэлт хэмжээ ороогүй.

Иж бүрдэл: жинхэнэ хайрцаг, тээвэрлэх гэр (Travel Case), гадаад батарей, 30W адаптер, шүршигч даавуу.

Байдал: Гадна шил төгс. Light Seal-ийн даавуун гадаргууд ашиглалтын мөр байгаа (5 дахь зурагт). Батарейн блокны кабель бүрэн бүтэн.

ZEISS оптик оруулга ОРООГҮЙ — нүдний шилтэй хүн тусад нь захиалах шаардлагатай.

Apple ID-аас салгаж, бүрэн шинэчилсэн.`,
    provenance: "Хөгжүүлэгчийн хэрэглээ",
    condition: "Сайн — Light Seal-д ашиглалтын мөр",
    dimensions: "Бие: ~600–650 г (оосорноос хамаарна)",
    estimateLowPts: 6200,
    estimateHighPts: 7800,
    openingPts: 4800,
    images: imagesFor("108"),
    status: "upcoming",
    startsAt: new Date(BASE + 5 * DAY).toISOString(),
  },
  {
    id: "109",
    code: "ЛОТ 109",
    title: "iPhone 16 Pro 128GB",
    maker: "Apple",
    year: "2024",
    category: "timepiece",
    note: `Цөлийн титан (Desert Titanium) өнгөтэй iPhone 16 Pro, 128GB.

Дэлгэц: 6.3 инчийн Super Retina XDR, 120Гц. Дэлгэц дээр урьд нь хамгаалалтын шил наасан байсан тул зураасгүй.

Камерын удирдлага (Camera Control) товч хэвийн ажиллана.

Батарей: 87% багтаамж, 412 цэнэглэлт. Солих шаардлагатай болж магадгүй.

Иж бүрдэл: хайрцаггүй. USB-C кабель дагалдана.

Байдал: Хүрээний баруун доод буланд унасны мөр байгаа (4 дэх зурагт тод). Ар талын шил бүрэн бүтэн. Бүх камер, Face ID хэвийн.

⚠ Батарейн багтаамж 87% — үнэлгээнд тусгагдсан.

iCloud-оос гарсан, IMEI цэвэр.`,
    provenance: "Хувийн эзэмшил",
    condition: "Дунд зэрэг — хүрээнд унасны мөр, батарей 87%",
    dimensions: "149.6 × 71.5 × 8.25 мм · 199 г",
    estimateLowPts: 1600,
    estimateHighPts: 2200,
    openingPts: 1100,
    images: imagesFor("109"),
    status: "upcoming",
    startsAt: new Date(BASE + 6 * DAY).toISOString(),
  },

  /* ── Results ───────────────────────────────────────────────────────────── */
  {
    id: "110",
    code: "ЛОТ 110",
    title: "MacBook Air 15″ M3 512GB",
    maker: "Apple",
    year: "2024",
    category: "manuscript",
    note: `Шөнө дунд (Midnight) өнгөтэй 15 инчийн MacBook Air, M3 чип, 16GB санах ой, 512GB SSD.

Батарей: 91% багтаамж, 203 цэнэглэлт.

Иж бүрдэл: 35W хос портот адаптер, USB-C кабель.

Байдал: Midnight өнгө хуруу мөр татдаг тул арчсаны дараа цэвэр. Тагны нэг буланд бага зэрэг элэгдэл.`,
    provenance: "Оюутны хэрэглээ",
    condition: "Сайн",
    dimensions: "340.4 × 237.6 × 11.5 мм · 1.51 кг",
    estimateLowPts: 2600,
    estimateHighPts: 3300,
    openingPts: 2000,
    images: imagesFor("110"),
    status: "sold",
    startsAt: new Date(BASE - 3 * DAY).toISOString(),
    hammerPts: 3140,
    hammerRound: 5,
    bidCount: 84,
  },
  {
    id: "111",
    code: "ЛОТ 111",
    title: "AirPods Max (USB-C)",
    maker: "Apple",
    year: "2024",
    category: "jewellery",
    note: `AirPods Max, USB-C хувилбар, Хөх өнгө (Midnight Blue).

Иж бүрдэл: Smart Case, USB-C кабель.

Байдал: Чихний дэрүүд анхныхаараа, гэхдээ элэгдсэн — солих зөвлөмжтэй. Толгойн зөөлөвч цэвэр. Металл хүрээнд зураас алга.`,
    provenance: "Хувийн эзэмшил",
    condition: "Дунд зэрэг — чихний дэр элэгдсэн",
    dimensions: "187.3 × 168.6 × 83.4 мм · 386.8 г",
    estimateLowPts: 900,
    estimateHighPts: 1300,
    openingPts: 700,
    images: imagesFor("111"),
    status: "sold",
    startsAt: new Date(BASE - 5 * DAY).toISOString(),
    hammerPts: 1180,
    hammerRound: 4,
    bidCount: 51,
  },
  {
    id: "112",
    code: "ЛОТ 112",
    title: "Apple TV 4K 128GB",
    maker: "Apple",
    year: "2023",
    category: "antique",
    note: `Apple TV 4K, 128GB, Wi-Fi + Ethernet хувилбар. Siri Remote (USB-C) дагалдана.

Байдал: Бүрэн ажиллагаатай, гадаргуу цэвэр. Тэжээлийн утас, HDMI кабель дагалдана.

⚠ Энэ лот дуудлага худалдаагаар худалдагдаагүй — нөөц үнэд хүрээгүй.`,
    provenance: "Хувийн эзэмшил",
    condition: "Маш сайн",
    dimensions: "93 × 93 × 31 мм · 208 г",
    estimateLowPts: 420,
    estimateHighPts: 580,
    openingPts: 350,
    images: imagesFor("112"),
    status: "unsold",
    startsAt: new Date(BASE - 7 * DAY + 6 * HOUR).toISOString(),
    bidCount: 7,
  },
];
