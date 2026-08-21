# things-to-do.md — Production readiness

**MAISON** — дуудлага худалдааны танхим. Энэ бол одоо байгаа кодоос уншиж
гаргасан, production-д гарахын тулд хийгдэх ёстой зүйлсийн бүрэн жагсаалт.

Сүүлд шинэчилсэн: 2026-08-21 · Дүгнэсэн commit: `2c00e00`

---

## 0. Одоогийн байдал (2026-08-21 шинэчлэв)

**P0 бүхэлдээ хийгдсэн.** Backend нь Next.js-ийн дотор — тусдаа сервис байхгүй.
Postgres, SSE, сессийн нэвтрэлт, серверийн талын bid шалгалт бүгд байна.

| Юу | Байдал | Хаана |
| --- | --- | --- |
| Өгөгдөл | Postgres | `db/schema.sql`, `src/lib/repo/*` |
| Bid шалгалт | **Сервер талд, row lock дор** | `src/lib/repo/bids.ts` |
| Цагийн эрх мэдэл | Сервер. Цэвэр функц + ticker | `src/lib/auction-engine.ts`, `src/lib/ticker.ts` |
| Real-time | SSE + Postgres LISTEN/NOTIFY | `src/app/api/room/[lotId]/stream/route.ts` |
| Нэвтрэлт | Утас + нууц үг + SMS OTP, httpOnly cookie | `src/app/actions/auth.ts`, `src/lib/session.ts` |
| Баланс | Ledger + кэш, зөвхөн сервер хасна | `src/lib/repo/users.ts` |
| Симулятор | **Устгасан** | — |
| Цагийн хурдасгалт | `NEXT_PUBLIC_ROUND_TIME_SCALE`, production-д 1 биш бол throw | `src/lib/auction.ts` |
| Тест | 52 unit ногоон + 38 integration бэлэн | `src/lib/*.test.ts`, `*.integration.test.ts` |
| Docker | Postgres + app + adminer | `docker-compose.yml`, `Dockerfile` |

Шалгагдсан: `npm run typecheck` цэвэр, `npm test` 52/52, `next build` амжилттай.
**Шалгагдаагүй: бодит Postgres-тэй ажиллуулж үзээгүй** — энэ машинд Docker
хараахан суугаагүй. Integration тест болон compose stack бэлэн байгаа тул
Docker суусны дараа доорх командуудыг ажиллуулахад л болно.

---

## Эхлээд хийх — P0-г бодитоор баталгаажуулах

Docker stack болон 38 integration тест бэлэн. Docker суусны дараа:

```bash
npm run db:up          # Postgres 16 + maison_test өгөгдлийн сан
npm run db:migrate     # schema хэрэгжүүлэх
npm run test:db        # 38 integration тест — энэ л P0-г батална
npm run db:seed        # 12 лот
npm run dev
```

`npm run test:db` дараах зүйлсийг **бодит Postgres дээр** шалгана — эдгээрийг
mock дээр шалгах утгагүй, учир нь mock хийсэн row lock үргэлж ажилладаг:

- [ ] 20 биддер нэг агшинд нэг үнээр bid хийхэд **яг нэг** нь ялах
- [ ] Дараалсан үер дор үнэ зөвхөн өсөх (буурахгүй)
- [ ] Нэг idempotency key-ээр хоёр удаа илгээхэд нэг л bid үүсэх
      (дараалан ба зэрэг хоёуланд нь)
- [ ] Балансаас хэтрүүлэн хасах боломжгүй
- [ ] `bids` / `ledger_entries` UPDATE, DELETE-ийг татгалзах
- [ ] Late entry floor (6-р тойрогт +2 биш +60)
- [ ] Баталгаажаагүй / түдгэлзүүлсэн хэрэглэгчийг татгалзах
- [ ] Хугацаа нь дууссан лотыг хаах ба тэр төлөвийг хадгалах
- [ ] Join fee нэг лотод нэг л удаа хасагдах, 1-р тойрогт хасагдахгүй
- [ ] 40 хэрэглэгч зэрэг бүртгүүлэхэд паддл давхцахгүй
- [ ] OTP код 5 буруу оролдлогын дараа үхэх, зөвхөн hash хадгалагдах
- [ ] Давтагдсан цэнэглэлт нэг л удаа тооцогдох (ledger idempotency)
- [ ] Баланс кэш ledger-тэйгээ таарах (`reconcileBalances`)

Дараа нь гараар:

- [ ] Бүртгүүлэх → серверийн лог дээрх `[sms:dev]` кодыг оруулах → нэвтрэх
- [ ] Хоёр браузераар нэг лот руу орж, нэг нь bid хийхэд нөгөө нь **шууд**
      шинэчлэгдэж байгааг харах (SSE)
- [ ] DevTools-оос хууль бус bid илгээж сервер татгалзаж байгааг харах
- [ ] `NEXT_PUBLIC_ROUND_TIME_SCALE=60` тавьж бүтэн 6 тойргийг 2м45с-д гүйцээх
- [ ] `docker compose --profile app up --build` — production image ажиллаж,
      ticker "elected leader" гэж лог бичиж байгааг харах

⚠ `npm run test:db` нь бүх хүснэгтийг TRUNCATE хийдэг. `test/db.ts` нь нэр нь
`_test`-ээр төгсөөгүй өгөгдлийн сан дээр ажиллахаас **татгалздаг**.

---

## P1 — Заавал (нээхээс өмнө)

### 8. Дутуу хуудсууд

Одоо байгаа: `/` `/lots` `/auction/[id]` `/overview` `/rules` `/about`
`/contact` `/login` `/register` `/forgot`

- [x] ~~`/forgot`~~ — нууц үг сэргээх. Хоёр алхам нэг URL дээр: тусдаа `/reset`
      хуудас утасны дугаарыг URL-аар зөөх шаардлагатай болно, тэгвэл дугаар нь
      browser history болон Referer header-т үлдэнэ.
- [x] ~~`/verify`~~ — тусдаа хуудас хэрэггүй: `AuthForm` OTP алхам руу өөрөө
      шилждэг тул нууц үгийн менежер кодыг дахин илгээх боломжгүй.
- [ ] `/profile` — баланс, миний bid-ийн түүх, ялсан лотууд, хувийн мэдээлэл
- [ ] `/wallet` — цэнэглэлт, гүйлгээний түүх
- [ ] **Админ панел** — лот үүсгэх/засах, дуудлага эхлүүлэх/түр зогсоох/цуцлах,
      хэрэглэгч удирдах, гүйлгээ харах, статистик. Энэ бол тусдаа нэлээд том ажил.

### 9. Хууль, эрх зүй

- [ ] `/rules` хуудсыг **бодит эрх зүйн текстээр** солих (одоо форматын танилцуулга).
      Багтах ёстой: оролцох шаардлага, төлбөр, ялагчийн үүрэг, хүргэлт,
      маргаан шийдвэрлэх журам, эрх түдгэлзүүлэх үндэслэл.
- [ ] Нууцлалын бодлого — Хувь хүний мэдээлэл хамгаалах тухай хуулийн дагуу.
- [ ] Үйлчилгээний нөхцөл.
- [ ] **18+ насны шаардлага** — бүртгэл дээр баталгаажуулах.
- [ ] Компанийн албан ёсны мэдээлэл footer-т: нэр, регистр, хаяг, утас, и-мэйл.
- [ ] Дуудлага худалдаа эрхлэх зөвшөөрөл шаардлагатай эсэхийг хуульчаар шалгуулах.
- [ ] Cookie / tracking мэдэгдэл (analytics нэмэх бол).

### 10. Тест — **52 тест байна**, гэхдээ бүгд цэвэр функцийн

- [x] ~~`test` script~~ — Vitest, `npm test`.
- [x] ~~`auction.ts`-ийн unit тест~~ — 27 тест. Хязгаарын утга, `NaN`,
      `Infinity`, сөрөг, тойргоос гарсан индекс бүгд багтсан.
- [x] ~~`auction-engine.ts`-ийн тест~~ — 25 тест. Хоёр цаг зэрэг дуусах,
      алдсан boundary-г replay хийх, унтарсан серверийн дараа зөв ялагч гаргах.
- [x] ~~DB-тэй тест~~ — 38 тест, `npm run test:db`. Concurrency, idempotency,
      append-only, ledger, OTP бүгд багтсан. **Ажиллуулж үзээгүй** — дээрх
      "Эхлээд хийх" хэсгийг үзнэ үү.
- [ ] CI дээр Postgres service нэмж `test:db`-г автоматжуулах.
- [ ] E2E (Playwright): бүртгүүлэх → нэвтрэх → лот → bid → hammer.
- [ ] Load test: нэг лот дээр 500+ зэрэг холболт, сүүлийн 5 секундэд bid-ийн үер.

### 11. Ops / infra

- [x] ~~`.env.example` + runtime config баримт~~ — `.env.example`, `.env.local`.
- [x] ~~Container~~ — `Dockerfile` (standalone, non-root), `docker-compose.yml`.
- [ ] Хостинг сонгох (VPS / container platform — **serverless биш**, SSE болон
      ticker удаан ажиллах процесс шаарддаг) + backup хуваарь.
- [ ] **Error tracking** (Sentry) — client болон server.
- [ ] **Uptime monitoring** — дуудлага явж байх үед сервер унавал шууд маргаан болно.
      Дуудлага явж байх үеийн тусгай alert.
- [ ] Структурлаг лог (bid бүрийг latency-тэй нь).
- [x] ~~typecheck script~~ — `npm run typecheck` нь `next typegen`-ийг эхлээд
      ажиллуулдаг (`PageProps` / `LayoutProps` нь `.next/types`-д үүсдэг).
- [ ] CI workflow: `typecheck` → `lint` → `test` → `build`. Build-д DB хэрэггүй
      (env болон pool хоёул lazy), тиймээс CI-д нууц үг өгөх шаардлагагүй.
- [ ] Staging орчин — production-той ижил тохиргоотой.
- [ ] Deploy буцаах (rollback) төлөвлөгөө.
- [ ] Дуудлага явж байх үед deploy хийхгүй байх дүрэм.

### 12. SEO / assets — `public/`-д одоо зөвхөн 12 лотын зураг байна

- [ ] `favicon.ico`, `icon.png`, `apple-icon.png`
- [ ] `opengraph-image.png` (1200×630) — `layout.tsx`-д OG тохиргоо байгаа ч зураг байхгүй
- [ ] `metadataBase` нэмэх (`src/app/layout.tsx`) — үүнгүйгээр OG зургийн URL
      харьцангуй болж, share card эвдэрнэ
- [ ] `robots.ts`, `sitemap.ts`
- [ ] `manifest.ts` (PWA хүсвэл)
- [ ] Бодит каталогийн зураг — одоо 12 placeholder, `credits.json`-той

---

## P2 — Сайжруулалт (нээсний дараа)

- [ ] Мэдэгдэл: "таны bid давагдлаа", "дуудлага 10 минутын дараа эхэлнэ",
      "5 секунд үлдлээ" — SMS / push / email.
- [ ] Тухайн лотыг "дагах" (watchlist).
- [ ] Дуудлагын дараах тайлан: хэдэн bid, ямар тойрогт алх буусан.
- [ ] Analytics (Plausible / Umami — cookie-гүй нь эрх зүйн хувьд хялбар).
- [ ] Accessibility audit — keyboard navigation, screen reader, contrast.
      Bid panel утсан дээр `position: fixed` — тэнд онцгой анхаарах.
- [ ] Performance budget + Lighthouse CI.
- [ ] i18n — copy бүгд `src/lib/copy.ts`-д цуглуулсан нь бэлтгэл сайтай.
- [ ] `prefers-reduced-motion` дор бүрэн шалгах (кодод хийгдсэн, тест хийгээгүй).

---

## Мэдэгдсэн зөрүү / жижиг ажил

- [x] ~~README-ийн фонт/брэндийн зөрүү~~ — засагдсан.
- [x] ~~`next.config.ts` хоосон~~ — security header, `serverExternalPackages`,
      `poweredByHeader: false` нэмэгдсэн. CSP нь `src/proxy.ts`-д (nonce хэрэгтэй).
- [x] ~~`typecheck` / `test` script байхгүй~~ — нэмэгдсэн.
- [ ] `format` script (Prettier) байхгүй.
- [ ] **`Descent.tsx` / `useDescent.ts`-д 9 eslint алдаа** — `react-hooks/refs`,
      "Cannot access refs during render". Энэ бол өмнөөс байсан, би хөндөөгүй.
      Анимаци ажиллаж байгаа тул засвар нь болгоомжтой хийгдэх ёстой.
- [ ] **`urgencyOf`-ийн тайлбар кодтойгоо зөрж байна** (`src/lib/auction.ts`).
      Тайлбар нь "6-р тойрог байнга hot байхаас сэргийлнэ" гэсэн ч нөхцөл нь
      `||` учир `sec <= 10` дангаараа ажиллаж, 5 секундын цаг эхнээсээ л hot.
      Зөвхөн өнгө, тиймээс P0 биш. Тест нь бодит зан төлөвийг баримтжуулсан.
- [ ] `globals.css`-ийн хоёр dark блокыг гар аргаар синк байлгах шаардлагатай
      (README-д тэмдэглэсэн) — линт дүрэм эсвэл тестээр хамгаалах боломжтой.
- [ ] HSTS одоо `next.config.ts`-д асаалттай, `preload`-той. ⚠ Домэйн болон бүх
      subdomain HTTPS болтол production-д гаргаж болохгүй — буцаах боломж бараг
      байхгүй.

---

## Нээхийн өмнөх эцсийн шалгалт

```
[x] ROUND_TIME_SCALE — production build 1 биш бол throw хийдэг болсон
[x] SIMULATE_RIVALS — симулятор бүхэлдээ устгагдсан, flag үлдээгүй
[x] src/lib/mock.ts устгасан (фикстур нь db/fixtures/lots.ts руу шилжсэн)
[x] AuthForm / ContactForm-ийн "front-end only" notice устгасан
[ ] placeBid сервер талд дүрмээ шалгаж байгааг гараар нотолсон
    (DevTools-оос хууль бус bid илгээж, сервер татгалзаж байгааг харах)
[ ] Баланс client-ээс өөрчлөгдөхгүй байгааг нотолсон
[ ] Тестийн дуудлагыг эхнээс нь дуустал бодит цагаар (2ц45м) нэг удаа явуулсан
[ ] Load test давсан
[ ] Дүрэм, нууцлалын бодлого хуульчаар хянагдсан
[ ] Backup сэргээлтийг нэг удаа туршиж үзсэн
[ ] Дуудлага явж байх үеийн alert ажиллаж байгааг шалгасан
```

---

## Дараалал (шинэчлэгдсэн)

1. ~~Schema + API~~ ✓
2. ~~Auth + OTP~~ ✓
3. ~~Сервер талын bid validation + concurrency~~ ✓ (кодоор; DB тест хүлээгдэж байна)
4. ~~Real-time~~ ✓ (WebSocket биш SSE — нэг чиглэлтэй тул илүү тохирно)
5. **Бодит Postgres дээр P0-г баталгаажуулах** ← дараагийн алхам
   (`npm run db:up && npm run db:migrate && npm run test:db`)
6. **Point цэнэглэлт / QPay** — ledger бэлэн, төлбөрийн интеграц дутуу
7. **Админ панел**
8. **DB-тэй тест + concurrency + load test**
9. **Хууль, дүрэм, ops, SEO**

5-р алхам одоо хамгийн эрэмбэ өндөртэй нь: код бүрэн боловч нэг ч SQL бодит
Postgres дээр ажиллаж үзээгүй.
