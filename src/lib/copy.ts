/**
 * Every user-facing string, in one place.
 *
 * The site ships Mongolian only. Components import `t` and never inline copy.
 *
 * ── Adding a second language ─────────────────────────────────────────────────
 *
 * The groundwork is this file existing and being complete; the remaining work
 * is smaller than it looks, but it is not nothing:
 *
 *   1. Copy this file to `copy.en.ts` and translate the values. `Dictionary`
 *      below makes a missing or misspelled key a TYPE ERROR rather than an
 *      `undefined` rendered into the page.
 *   2. Add `[locale]` to the route segments, or pick from a cookie in
 *      `src/proxy.ts`.
 *   3. Replace the `t` import with a `useTranslations()`-style accessor. That
 *      is the only mechanical edit across components, and it is one codemod.
 *
 * ⚠ Two things do NOT come along for free, and both are in `src/lib/format.ts`:
 * number grouping (hand-rolled, because Intl's mn-MN separator differs between
 * Node and browser ICU builds and mismatches on hydration) and dates (built
 * from UTC parts for the same reason). A second locale needs its own decisions
 * there, not a switch to Intl.
 *
 * The legal pages are a separate problem again: `/terms` and `/privacy` are
 * binding text, and a translation of them needs the same review the original
 * needs. Do not machine-translate those.
 */
export const t = {
  /*
   * URLUG — the house's own name.
   *
   * Left in Latin caps against a page of Cyrillic on purpose: it reads as a
   * mark rather than as a word, which is what a wordmark wants.
   *
   * Renaming the house is these three lines and nothing else. Everything that
   * shows the name — page titles, the favicon, the share card, every SMS —
   * reads `brand.name` from here. That was ALMOST true before this rename: a
   * handful of SMS bodies and one legal sentence had "URLUG" typed into them,
   * and they were the only things the rename did not reach. They interpolate
   * now, so the next rename really is three lines.
   */
  brand: {
    name: "URLUG",
    mark: "U",
    tagline: "Дуудлага худалдааны танхим",
  },

  nav: {
    lots: "Лотууд",
    overview: "Тойм",
    rules: "Журам",
    about: "Бидний тухай",
    contact: "Холбоо барих",
    back: "Буцах",
    schedule: "Хөтөлбөр",
    enter: "Нэвтрэх",
    register: "Бүртгүүлэх",
    menu: "Цэс",
    close: "Хаах",
  },

  home: {
    eyebrow: "Зургаан тойрог · 2 цаг 45 минут",
    headline: ["Хугацаа", "хумигдана."],
    lede: "Тойрог давах тусам дарах хугацаа 5 минутаас 5 секунд болж хумирна. Хамгийн тэвчээртэй нь бус, хамгийн шийдэмгий нь ялна.",
    ctaPrimary: "Танхимд орох",
    /* The hero CTA now opens the catalogue, not a room. "Enter the hall" would
       promise a specific sale and drop you into whichever lot happened to be
       first, which is what it used to do. */
    ctaBrowse: "Лотуудыг үзэх",
    ctaSecondary: "Журмыг үзэх",
    liveNow: "Шууд эхэлсэн",
    rightNow: "Яг одоо",
    /* `lastBid` устгагдсан. Тэр нь LiveTicker-ийн зохиосон тоог шошголж
       байсан бөгөөд шошго нь ч буруу байв — нээлтийн үнийг "сүүлийн хаялт"
       гэж нэрлэж байсан. */
    bidsSoFar: (n: number) => `${n} удаа дарсан`,

    /* Slate — the metadata strip across the top of the opening frame, set like
       a film slate or the masthead of a Swiss journal. */
    slatePlace: "Улаанбаатар",
    slateEdition: "Дөрөвдүгээр цуглуулга",
    slateYear: "2026",

    scrollCue: "Гүйлгэ",
    indexEyebrow: "Каталог",
    indexTitle: "Жагсаалт",
    indexHintDesktop: "Мөр дээр очиход зураг солигдоно",
    colLot: "Лот",
    colObject: "Бүтээл",
    colEstimate: "Үнэлгээ",
    colPressCost: "Нэг дарах",
    colStatus: "Төлөв",
    liveNowPlural: "Шууд явагдаж байна",
    /* Shown when no lot is live and none is scheduled — the house is between
       sales. Says when to come back rather than merely that nothing is on. */
    houseClosed:
      "Одоогоор явагдаж буй дуудлага худалдаа алга. Товлогдсон лотууд гарангуут энд харагдана — каталогийг доор үзнэ үү.",
    liveCount: (n: number) => `${n} лот шууд явагдаж байна`,
    otherLive: "Бусад шууд лот",
    upcoming: "Хүлээгдэж байна",
    upcomingLede: "Дараагийн лотууд",
    allLots: "Бүх лот",
    /* Used on the featured lot, where "enter the room" is already the hero CTA
       and repeating it verbatim would read as two identical buttons. */
    ctaEnter: "Орж үзэх",
    results: "Үр дүн",
    resultsLede: "Ялагч тодорсон лотууд",
    resultsNote: "Өмнөх худалдааны дүн",
    howItWorks: "Хэрхэн явагддаг",
    pointNote: "1 оноо = 1 000₮",
    statRounds: "тойрог",
    statDuration: "нийт хугацаа",
    statPoint: "нэг оноо",
    statFinal: "сүүлийн тойрог",
  },

  /*
   * The Descent — the cinematic landing at `/`.
   *
   * Floors are *named*, never numbered. A numbered floor is a progress
   * indicator, and a progress indicator tells you how much is left, which is
   * the one thing this piece is built to withhold.
   */
  descent: {
    floors: {
      street: "Гудамж",
      vestibule: "Үүд",
      stair: "Шат",
      threshold: "Босго",
      hall: "Танхим",
    },

    scrollCue: "Гүйлгэ",

    /* 02 — the two clocks, dissected. */
    clocksEyebrow: "Танхимын дэг",
    clocksTitle: "Хоёр цаг зэрэг явна",

    /* 03 — the six rounds, on two rails at different speeds. */
    roundWord: "Тойрог",
    lasts: (label: string) => `${label} үргэлжилнэ`,
    stairNote: "Тойрог давах тусам хугацаа хумирна",

    /* 04 — the hammer. */
    finalClock: "5 СЕК",
    hammered: "ЯЛАВ",

    /* 05 — the hall. */
    hallTitle: "Цаг хугацаа шийднэ.",
    hallLede: "Хамгийн тэвчээртэй нь бус, хамгийн шийдэмгий нь ялна.",
    enter: "Танхимд орох",
  },

  lot: {
    lot: "Лот",
    estimate: "Үнэлгээ",
    /* Нэг удаа дарахын үнэ — лот бүрт админ тогтооно. */
    pressCost: "Нэг дарах",
    /* Лотын нийт дарсан тоо, бүх оролцогчоор. */
    totalPresses: "Нийт дарсан",
    maker: "Зохиогч",
    year: "Он",
    provenance: "Гарал үүсэл",
    condition: "Хадгалалтын байдал",
    dimensions: "Хэмжээ",
    note: "Тайлбар",
    details: "Дэлгэрэнгүй",
    viewLot: "Лотыг үзэх",
    startsAt: "Эхлэх",
    placeholder: "Гэрэл зураг ороогүй",
    statusSold: "Ялагч тодорсон",
    statusUnsold: "Худалдагдаагүй",
    /* Дууссан ч үр дүн нь хараахан гараагүй лот. */
    statusReview: "Үр дүн гараагүй",
    hammerRound: "Хаагдсан тойрог",
    result: "Үр дүн",
    bidCount: "Нийт дарсан",

    /* Дагах — гол нь жагсаалт биш, лот эхлэхэд мэдэгдэл очих нь. Тогтсон
       цагт эхэлдэг 2ц45м-ын дуудлагад энэ нь оролцох эсэхийг шийднэ. */
    gallery: "Гэрэл зургууд",
    watch: "Дагах",
    watching: "Дагаж байна",
    watchlist: "Дагаж буй лотууд",
    watchlistEmpty: "Дагаж буй лот алга.",
  },

  room: {
    live: "ШУУД",
    /* Header badge in the room — names the place, not the status. */
    liveRoom: "Шууд танхим",
    /* Үлдэгдэл хүрэхгүй бол ДАРАХААС ӨМНӨ хэлнэ. Сервер ямар ч байсан
       татгалзана; ялгаа нь хүн дарж үзсэний дараа мэдэх үү, өмнө нь мэдэх үү. */
    pressShort: (need: number, have: number) =>
      `Нэг дарахад ${need} оноо шаардана. Танд ${have} оноо байна.`,
    topUp: "Оноо цэнэглэх",
    round: "Тойрог",
    ofRounds: "6 тойргоос",
    /* Лотын нийт дарсан тоо — өрөөний том тоо. */
    totalPresses: "Нийт дарсан",
    noBidsYet: "Хараахан дараагүй",
    /* Хамгийн сүүлд дарсан хүн — цаг дуусвал тэр ялна. */
    leader: "Сүүлд дарсан",
    youLead: "Та сүүлд дарсан — цаг дуусвал та ялна",
    outbid: "Таны араас өөр хүн дарсан",
    bidClock: "Дарах хугацаа",
    roundClock: "Тойрог дуусахад",
    /* Дуусвал лот хаагдахгүй, дараагийн тойрог руу шилжинэ. Танхимд байгаа
       хүнд хамгийн чухал нь эхнийх нь — цаг яагаад ухардгийг хэлж байгаа юм. */
    bidClockHint: "Дарах бүрт дахин тоологдоно",
    feed: "Дарсан түүх",
    feedEmpty: "Анхны даралтыг хүлээж байна",
    /* Лот дууссаны дараа түүхийн дээд талд тусдаа мөрөөр. Даралтууд
       жинхэнэ дарааллаараа доор нь үлдэнэ. */
    feedWinner: "Ялагч",
    you: "Та",
    /* Даралт бүрийн хажууд — тухайн хүний хэд дэх даралт болох. */
    pressNo: (n: number) => `${n} дахь`,
    times: (n: number) => `${n} удаа`,
    /* Тооны ард, жишээ нь «120 удаа». */
    timesUnit: "удаа",
    yourCount: "Таны дарсан",
    pressCost: "Нэг дарах",
    balance: "Үлдэгдэл",
    placeBid: "Дарах",
    sold: "ЯЛАГЧ ТОДОРЛОО",
    soldNote: "Цаг дууслаа",
    unsold: "Худалдагдсангүй",
    winner: "Ялагч",

    /* ── Үр дүнг хүлээх ───────────────────────────────────────────────────
     * Хаялт хаагдсанаас ялагч зарлагдах хүртэл өрөө ачааллаж буй дэлгэц
     * харуулна. Хүлээлт гэдгийг нь хэлэх ёстой — юу ч бичээгүй зогссон
     * дэлгэц эвдэрсэн систем шиг харагддаг.
     */
    review: "LOADING",
    reviewNote: "Лот хаагдлаа",
    reviewBody: "Үр дүнг ачааллаж байна.",
    reviewWait: "Энэ хуудсыг нээлттэй үлдээгээрэй — үр дүн шууд гарч ирнэ.",
    reviewStanding: "Сүүлд дарсан",
    reviewYouStanding: "Та сүүлд дарсан",
    /* Хаялт хаагдаад ялагч хараахан зарлагдаагүй үеийн гарчиг, эргэлддэг
       дүрсний хажууд. Админ ялагчийг зарлах хүртэл үргэлжилнэ. */
    deciding: "Loading…",

    decisionStandings: "Сүүлд дарсан хүмүүс",
    /* Сүүлийн тойргийн цаг энэ дэлгэц дээр 0 болсон ч серверийн хариу хараахан
       ирээгүй хэдэн агшин. Сервер хоцорсон хаялтыг татгалздаг тул товчийг
       идэвхтэй үлдээх нь утгагүй. */
    closing: "Лот хаагдаж байна",
    closingBody: "Цаг дууслаа. Сүүлийн даралтыг баталгаажуулж байна.",

    /* ── Фокус горим ──────────────────────────────────────────────────────
     * Утсан дээр зөвхөн цаг, тойрог, үнэ, хаялтын товч үлдэнэ. Товчны нэр
     * нь дарахад юу болохыг хэлнэ — төлөвийг биш.
     */
    focusOn: "Фокус",
    focusOff: "Бүгдийг харах",
    focusHint: "Зөвхөн цаг, тойрог, товчийг харуулна",
    rulesLink: "Журам",
    connection: "Холболт",
    connected: "Шууд дамжуулалт",
    roundAdvanced: (n: number) => `${n}-р тойрог эхэллээ`,
    roundClockShrunk: (label: string) => `Дарах хугацаа ${label} болов`,

    /* ── Server rejections ────────────────────────────────────────────────
     * One line per reason the back end can turn a bid down. They are written
     * to tell the bidder what to DO, not to name an error class — "sign in",
     * "top up", not "unauthorised", "insufficient funds".
     */
    signInToBid: "Дарахын тулд нэвтэрнэ үү",
    rejectClosed: "Энэ лотын хугацаа дууссан байна.",
    rejectSignIn: "Дарахын тулд нэвтэрнэ үү.",
    rejectVerify: "Утасны дугаараа баталгаажуулсны дараа дарах боломжтой.",
    rejectFunds: "Онооны үлдэгдэл хүрэлцэхгүй байна.",
    rejectSuspended: "Таны бүртгэл түр хаагдсан байна.",
    rejectError: "Даралт бүртгэгдсэнгүй. Дахин оролдоно уу.",
  },

  rules: {
    title: "Журам",
    eyebrow: "Лотын дэг",
    lede: "Лот зургаан тойрогтой, нийт 2 цаг 45 минут үргэлжилнэ. Тойрог бүрд дарах хугацаа багасна. Цаг дуусахад хамгийн сүүлд дарсан хүн ялна.",
    table: {
      round: "Тойрог",
      bidClock: "Дарах хугацаа",
      duration: "Үргэлжлэх",
    },
    pointsTitle: "Нэг дарах үнэ",
    pointsBody:
      "Товчийг дарах бүрт тухайн лотын нэг дарах үнэ таны онооны үлдэгдлээс хасагдана. Үнийг лот бүр дээр зарлана. 1 оноо нь 1 000₮-тэй тэнцэнэ. Үлдэгдэл хүрэлцэхгүй бол дарах боломжгүй.",
    clocksTitle: "Хоёр цаг зэрэг явна",
    clocksBidTitle: "Дарах хугацаа",
    clocksBidBody:
      "Дарах бүрт тухайн тойргийн хугацаа дахин тоологдоно. Хэн ч дарахгүй өнгөрч хугацаа дуусвал лот дуусахгүй — дараагийн тойрог руу шилжиж, хариу өгөх хугацаа богиносно.",
    clocksRoundTitle: "Тойргийн хугацаа",
    clocksRoundBody:
      "Тойрог өөрийн хугацаагаараа явж, дуусахад мөн адил дараагийн тойрог эхэлнэ. Энэ хугацаа нээлтээс тогтсон бөгөөд даралтаар өөрчлөгдөхгүй — иймд лот заавал 2 цаг 45 минутын дотор дуусна.",
    clocksEndTitle: "Лот хэзээ дуусах вэ",
    clocksEndBody:
      "Зөвхөн 6-р тойрогт. Хамгийн сүүлийн тойрогт шилжих газар байхгүй тул хоёр цагийн аль нэг нь дуусмагц лот хаагдана.",
    winnerTitle: "Хэн ялах вэ",
    winnerBody:
      "Лот хаагдах мөчид товчийг хамгийн сүүлд дарсан хүн ялна. Хэдэн удаа дарсан нь ялахад нөлөөлөхгүй. Ялагч нэмэлт төлбөр төлөхгүй.",
    lateTitle: "Хэзээ ч нэгдэж болно",
    lateBody:
      "Лот явагдаж байх хооронд хэзээ ч орж дарж болно. Нэгдэх төлбөр байхгүй — зөвхөн дарсан удаа бүрийн үнэ.",
  },

  auth: {
    /* Мессеж илгээгч тасалдсан үед. Хэрэглэгчийн буруу биш гэдгийг хэлж,
       дахин оролдох, эсвэл холбогдох гарц үлдээнэ — "серверийн алдаа" гэсэн
       хоосон хуудас нь сайт бүхэлдээ унасан мэт уншигддаг. */
    codeUndelivered:
      "Баталгаажуулах код илгээх боломжгүй байна. Түр хүлээгээд дахин оролдоно уу — асуудал үргэлжилвэл бидэнтэй холбогдоно уу.",

    /* Овог, нэр тусад нь. Нэг талбарт нийлүүлбэл дараа нь салгах арга байхгүй —
       "Мөнхболд Тэмүүлэн"-ий аль нь овог болохыг машин мэдэхгүй, хоёр дараалал
       хоёулаа монголоор жам ёсны. */
    familyName: "Овог",

    loginTitle: "Нэвтрэх",
    loginLede: "Дуудлага худалдаанд оролцохын тулд бүртгэлдээ нэвтэрнэ үү.",
    registerTitle: "Бүртгүүлэх",
    registerLede:
      "Оролцогчийн бүртгэл үүсгэснээр танд паддлын дугаар олгогдоно.",

    /* Зөвхөн нэр. Овог нь дээрх `familyName` талбарт тусад нь. */
    name: "Нэр",
    phone: "Утасны дугаар",
    password: "Нууц үг",
    passwordConfirm: "Нууц үгээ давтах",
    passwordHint: "Хамгийн багадаа 8 тэмдэгт.",

    showPassword: "Нууц үг харуулах",
    hidePassword: "Нууц үг нуух",
    forgot: "Нууц үгээ мартсан уу?",
    remember: "Намайг сана",

    terms:
      "Үйлчилгээний нөхцөл, нууцлалын бодлого, дуудлага худалдааны журмыг уншиж зөвшөөрлөө.",

    noAccount: "Бүртгэлгүй юу?",
    haveAccount: "Бүртгэлтэй юу?",

    /* 18+. Насны шаардлагыг чагтаар биш, төрсөн огноогоор шалгана — чагт нь
       "би 18 хүрсэн" гэсэн мэдэгдэл, огноо нь шалгаж болох баримт. */
    dateOfBirth: "Төрсөн огноо",
    dateOfBirthHint: "Оролцоход 18 нас хүрсэн байх шаардлагатай.",
    ageError: "Дуудлага худалдаанд оролцохын тулд 18 нас хүрсэн байх ёстой.",

    /* ── Phone verification and reset ─────────────────────────────────────
     * The number is echoed back so the bidder can see at a glance that they
     * typed it correctly, which is the usual reason a code never arrives.
     */
    codeSent: (phone: string) =>
      `${phone} дугаар руу 6 оронтой код илгээлээ. Код 10 минут хүчинтэй.`,
    code: "Баталгаажуулах код",
    verify: "Баталгаажуулах",
    resend: "Кодыг дахин илгээх",
    working: "Түр хүлээнэ үү…",

    forgotTitle: "Нууц үг сэргээх",
    forgotLede:
      "Бүртгэлтэй утасны дугаараа оруулна уу. Хэрэв тухайн дугаар бүртгэлтэй бол сэргээх код илгээнэ.",
    newPassword: "Шинэ нууц үг",
    sendCode: "Код илгээх",
  },

  lots: {
    eyebrow: "Каталог",
    title: "Лотууд",
    heroTitle: ["Онцгойг ол.", "Өөрийн болго."],
    heroLede:
      "Үнэ цэнтэй эд зүйлс, шинэ боломжууд. Өөрт таалагдсан лотоо олж, дараагийн дуудлага худалдаанд нэгдээрэй.",
    featured: "Каталогоос",
    collectionTitle: "Таны дараагийн олдвор",
    collectionLede: "Лот бүрд шинэ боломж бий.",
    searchLabel: "Лот хайх",
    searchPlaceholder: "Нэр, брэнд, лотын дугаар…",
    clearSearch: "Хайлтыг арилгах",
    searchEmpty: "Таны хайлтад тохирох лот олдсонгүй.",
    searchEmptyHint: "Өөр нэр, брэнд эсвэл лотын дугаараар хайгаарай.",
    lede: "Шууд явагдаж буй, удахгүй эхлэх болон дуусгавар болсон бүх лот. Лот бүр өөрийн танхимтай — шууд явагдаж буй лот руу орвол тэр дороо дарж эхэлнэ.",
    liveSection: "Шууд явагдаж байна",
    upcomingSection: "Удахгүй эхэлнэ",
    resultsSection: "Дууссан",
    /* ── Хоосон байдал хоёр өөр зүйл ──────────────────────────────────────
     * "Энэ шүүлтүүрт алга" гэдэг нь өөр шүүлтүүрт байгаа гэсэн үг — өөр рүү
     * очих зам заана. Харин каталог бүхэлдээ хоосон бол шүүлтүүр солих нь
     * тус болохгүй; тэр үед "буруу ангилал сонгосон" гэж хэлэх нь хүнийг
     * дэмий эргүүлж, дараа нь гаргана.
     */
    empty: "Энэ ангилалд лот алга.",
    emptyOther: "Бүх лотыг үзэх",
    emptyHouse: "Одоогоор жагсаасан лот алга.",
    emptyHouseHint:
      "Дараагийн дуудлага худалдаа бэлтгэгдэж байна. Журамтай танилцаж, эхлэхэд бэлэн байгаарай.",
    countLabel: (n: number) => `${n} лот`,

    filterAll: "Бүгд",
    filterLive: "Шууд",
    filterUpcoming: "Удахгүй",
    filterResults: "Дууссан",

    /* ── Нүүр хуудасны шинэ хэсгүүд ─────────────────────────────────────── */
    carouselLabel: "Онцлох лотууд",
    goToSlide: (n: number) => `${n}-р онцлох лот`,
    marqueeLabel: "Шууд явагдаж буй лотууд",
    bidsCount: (n: number) => `${n} удаа дарсан`,
    roundShort: (n: number) => `${n}-р тойрог`,
    startsIn: "Эхлэхэд",
    days: (n: number) => `${n} өдөр`,
    startingNow: "Эхэлж байна",
    watchAdd: "Хадгалах",
    watchRemove: "Хадгалснаас хасах",
    watchSignIn: "Хадгалахын тулд нэвтэрнэ үү",
    quickView: "Хурдан харах",
    quickClose: "Хаах",
    quickOpen: "Лотыг үзэх",
    quickEnter: "Танхимд орох",
    soldEyebrow: "Үр дүн",
    soldTitle: "Саяхны ялагчид",
    soldMeta: (round: number, bids: number) =>
      `${round}-р тойрогт · ${bids} удаа дарсан`,
    soldAll: "Бүх үр дүн",
    howEyebrow: "Хэрхэн явагддаг",
    howTitle: "Гурван алхам, нэг ялагч",
    howSteps: [
      {
        title: "Зургаан тойрог",
        body: "Лот бүр зургаан тойрогтой бөгөөд 2 цаг 45 минутын дотор заавал дуусна. Товч дарах бүрт хугацаа дахин тоологдоно.",
      },
      {
        title: "Хугацаа хумигдана",
        body: "Хэн ч дарахгүй хугацаа дуусвал дараагийн тойрог эхэлж, хариу өгөх хугацаа 5 минутаас 5 секунд хүртэл богиносно.",
      },
      {
        title: "Сүүлд дарсан нь ялна",
        body: "6-р тойрогт цаг дуусмагц лот хаагдаж, товчийг хамгийн сүүлд дарсан оролцогч лотыг авна.",
      },
    ],
    statsEyebrow: "Тоогоор",
    statLots: "Нийт лот",
    statBidsToday: "Сүүлийн 24 цагийн даралт",
    statBidders: "Оролцогч",

    prev: "Өмнөх",
    next: "Дараах",
    pageLabel: (n: number) => `${n}-р хуудас`,
    showing: (from: number, to: number, total: number) =>
      `${total}-аас ${from}–${to}`,
  },

  contact: {
    eyebrow: "Холбоо барих",
    headline: ["Бидэнтэй", "холбогдоорой."],
    lede: "Лот тавих, үнэлгээ хийлгэх, эсхүл оролцогчоор бүртгүүлэх талаар асуух зүйл байвал бидэнд бичээрэй. Ажлын өдөрт хариу өгнө.",

    detailsTitle: "Хаяг, холбоо",
    addressLabel: "Хаяг",
    address:
      "Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, Энх тайвны өргөн чөлөө 19",
    phoneLabel: "Утас",
    phone: "+976 7700 0019",
    emailLabel: "И-мэйл",
    email: "info@urlug.mn",
    hoursLabel: "Ажиллах цаг",
    hours: "Даваа–Баасан · 10:00–19:00",

    formTitle: "Мессеж илгээх",
    fieldName: "Овог нэр",
    fieldContact: "Утас эсвэл и-мэйл",
    fieldTopic: "Сэдэв",
    fieldMessage: "Мессеж",
    topics: [
      "Ерөнхий асуулт",
      "Лот тавих",
      "Үнэлгээ хийлгэх",
      "Оролцогчийн бүртгэл",
    ],
    send: "Илгээх",
    sent: "Мессеж хүлээн авлаа. Ажлын өдөрт хариу өгнө.",
  },

  about: {
    eyebrow: "Бидний тухай",
    headline: ["Цаг хугацаа", "шийднэ."],
    lede: "URLUG бол Монголын эртний эдлэл, урлагийн бүтээлийг дуудлага худалдаагаар шинэ эзэнд нь хүргэдэг танхим. Бид уртаас урт хүлээлт бус, богино бөгөөд шийдэмгий худалдааг сонгосон.",

    storyTitle: "Яагаад зургаан тойрог вэ",
    storyBody:
      "Сонгодог дуудлага худалдаа цагаар үргэлжилж, оролцогчид эцэст нь ядраад шийдвэрээ хойшлуулдаг. Бид эсрэгээр нь хийсэн: тойрог давах тусам дарах хугацаа хумигдаж, 5 минутаас 5 секунд болно. Сүүлийн тойрогт бодох цаг үлддэггүй — зөвхөн шийдэх цаг үлддэг.",

    principlesTitle: "Зарчим",
    principles: [
      {
        title: "Ил тод байдал",
        body: "Даралт бүр бодит цагт, бүх оролцогчид ижил хугацаанд харагдана.",
      },
      {
        title: "Шалгагдсан гарал үүсэл",
        body: "Танхимд орох лот бүр гарал үүсэл, хадгалалтын байдлын шалгуур давсан байна. Тодорхойгүй зүйлийг бид тодорхойгүй гэж бичдэг.",
      },
      {
        title: "Тэгш боломж",
        body: "Тойргийн дундаас нэгдсэн оролцогч тухайн тойргийн дугаараар үржүүлсэн доод хэмжээгээр эхэлдэг. Хожуу ирсэн нь давуу тал болдоггүй.",
      },
    ],

    numbersTitle: "Тоо баримт",
    contactTitle: "Холбоо барих",
    contactBody:
      "Лот тавих, оролцогчоор бүртгүүлэх, эсхүл үнэлгээ хийлгэх талаар бидэнтэй холбогдоно уу.",
    contactNote: "Улаанбаатар хот",
  },

  footer: {
    rights: "Бүх эрх хуулиар хамгаалагдсан",
    contact: "Холбоо барих",
    terms: "Үйлчилгээний нөхцөл",
    privacy: "Нууцлалын бодлого",
    credits: "Зургийн эх сурвалж",

    /* Багануудын гарчиг. Долоон холбоосыг бүлэглэлгүй нэг эгнээнд тавихад
       уншигч аль нь юу болохыг ялгаж чаддаггүй — гарчиг нь тэр ажлыг хийнэ. */
    groupCatalogue: "Каталог",
    groupHouse: "Танхим",
    groupLegal: "Эрх зүй",

    /*
     * ⚠ PLACEHOLDER — засварлах шаардлагатай.
     *
     * Хуулийн этгээдийн бодит мэдээллийг тавина. Дуудлага худалдаа зохион
     * байгуулагч нь хэн болохыг ил зааагүй бол ялагч хэнтэй гэрээ байгуулж
     * байгаагаа мэдэхгүй — энэ нь маргаан гарахад хамгийн түрүүнд асуугдах зүйл.
     */
    company: "УРЛУГ ХХК",
    registry: "Улсын бүртгэлийн дугаар: 0000000",
    address:
      "Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, Энх тайвны өргөн чөлөө 19",
    ageNotice: "18+ · Оролцоход насны шаардлага тавигдана",
  },

  /* ── Legal pages ────────────────────────────────────────────────────────
   * Эдгээр нь эрх зүйн бичиг баримтын СУУРЬ бөгөөд хуульчаар хянуулаагүй.
   * Нээхээс өмнө хянуулах ёстой — `things-to-do.md`-г үзнэ үү.
   */
  legal: {
    reviewWarning:
      "Энэ баримт бичиг хуульчийн хяналт хараахан ороогүй байна. Албан ёсоор ашиглахаас өмнө хянуулна.",
    lastUpdated: "Сүүлд шинэчилсэн",
    contactPrompt: "Асуулт байвал",
  },

  terms: {
    eyebrow: "Эрх зүй",
    title: "Үйлчилгээний нөхцөл",
    lede: "Энэхүү нөхцөл нь URLUG платформыг ашиглах, дуудлага худалдаанд оролцох, төлбөр тооцоо хийхтэй холбоотой талуудын эрх, үүргийг тодорхойлно.",
  },

  privacy: {
    eyebrow: "Эрх зүй",
    title: "Нууцлалын бодлого",
    lede: "Бид ямар мэдээлэл цуглуулж, юунд ашиглаж, хэр удаан хадгалдаг, мөн та ямар эрхтэй болохыг энд тайлбарлав.",
  },

  account: {
    profileTitle: "Миний бүртгэл",
    profileLede: "Таны үлдэгдэл, мэдээлэл, тохиргоо.",
    walletTitle: "Хэтэвч",
    walletLede: "Оноо худалдан авах, гүйлгээний түүхээ харах.",

    balance: "Үлдэгдэл",
    bidsPlaced: "Нийт дарсан",
    lotsEntered: "Оролцсон лот",
    lotsWon: "Хожсон лот",
    spent: "Зарцуулсан",

    name: "Нэр",
    paddle: "Паддлын дугаар",
    phone: "Утас",
    memberSince: "Бүртгүүлсэн",
    signOut: "Гарах",

    bidHistory: "Дарсан түүх",
    bidHistoryEmpty: "Та хараахан дараагүй байна.",
    wonLots: "Хожсон лотууд",
    wonLotsEmpty: "Хожсон лот алга.",
    /* Ялагчид 7 хоногийн дотор холбогдох үүрэгтэй — /terms-д заасан. */
    winnerAction:
      "Ажлын 7 хоногийн дотор бидэнтэй холбогдож лотоо хүлээн авах нөхцөлөө тохирно уу.",

    packages: "Онооны багц",
    buy: "Худалдан авах",
    transactions: "Гүйлгээний түүх",
    transactionsEmpty: "Гүйлгээ алга.",
    topupHistory: "Цэнэглэлтийн түүх",
    paidNotice: (points: number) => `${points} оноо дансанд нэмэгдлээ.`,

    verifyFirst: "Оноо худалдан авахын өмнө утасны дугаараа баталгаажуулна уу.",
    notSignedIn: "Нэвтэрч орно уу.",

    notifications: "Мэдэгдэл",
    notificationsEmpty: "Мэдэгдэл алга.",
    /* Дээд тал нь ийм тоо харуулна; түүнээс дээш бол "9+". */
    unreadCap: 9,
    notificationsAll: "Бүгдийг харах",
    notificationsNew: "шинэ",

    settings: "Тохиргоо",
    settingsLede: "Нэр, нууц үгээ өөрчлөх.",
    displayName: "Харагдах нэр",
    displayNameHint:
      "Дуудлага худалдааны танхимд таныг паддлын дугаараар харуулна — нэр тань бусад оролцогчид харагдахгүй.",
    nameSave: "Нэр хадгалах",
    passwordChange: "Нууц үг солих",
    passwordChangeHint:
      "Солиход бүх төхөөрөмжөөс гарна. Та энэ цонхондоо нэвтэрсэн хэвээр үлдэнэ.",
    currentPassword: "Одоогийн нууц үг",
    newPassword: "Шинэ нууц үг",
    newPasswordConfirm: "Шинэ нууц үгээ давтах",
    saving: "Хадгалж байна…",

    settlements: "Төлбөр хүлээгдэж буй",
    settlementsEmpty: "Төлөх зүйл алга.",
    dueBy: "Хугацаа",
    overdue: "Хугацаа хэтэрсэн",
    settlementStatus: {
      due: "Төлөгдөөгүй",
      paid: "Төлөгдсөн",
      waived: "Чөлөөлсөн",
      forfeited: "Хүчингүй",
    } as Record<string, string>,

    kind: {
      topup: "Цэнэглэлт",
      join_fee: "Нэгдэх төлбөр",
      press: "Товч дарсан",
      hammer_settlement: "Лотын төлбөр",
      refund: "Буцаалт",
      adjustment: "Тохируулга",
      bonus: "Урамшуулал",
    } as Record<string, string>,

    status: {
      pending: "Хүлээгдэж буй",
      paid: "Төлөгдсөн",
      failed: "Амжилтгүй",
      expired: "Хугацаа дууссан",
    } as Record<string, string>,
  },

  admin: {
    title: "Удирдлага",
    lede: "Лот, хэрэглэгч, гүйлгээ, статистик.",
    forbidden: "Танд энэ хуудсанд хандах эрх алга.",

    statLots: "Нийт лот",
    statLive: "Шууд явж буй",
    statUsers: "Хэрэглэгч",
    statBids: "Нийт даралт",
    statPointsOut: "Гаргасан оноо",
    /* Төлбөргүй тарааснаас нь хэд нь вэ — «гаргасан оноо»-ны дэргэд утгатай. */
    statPointsGifted: "Бэлэглэсэн оноо",
    statPointsHeld: "Хэрэглэгчид дэх оноо",
    statTopups: "Цэнэглэлт (₮)",

    lots: "Лотууд",
    users: "Хэрэглэгчид",

    /* ── Instant ялагч ───────────────────────────────────────────────────
     * Лот хаагдахад ялагч автоматаар тодорно: сүүлд дарсан хүн, эсвэл лот
     * явагдаж байхад админы урьдчилан сонгосон Instant ялагч. Хаагдсаны дараа
     * гараар шийдэх зүйл үлддэггүй.
     */
    instantWinner: "Instant ялагч",
    /* Даралт ороогүй лот — сонгох хэсэг яагаад алга байгааг хэлнэ. */
    reviewLater: "Хэн нэгэн дармагц Instant ялагчийг энд сонгох боломжтой.",
    designateHint:
      "Лот хаагдахгүй, ердийнхөөрөө үргэлжилнэ. Цаг дуусахад хэн сүүлд дарснаас үл хамааран сонгосон оролцогч ялагчаар зарлагдана. Сонгоогүй бол хамгийн сүүлд дарсан хүн ялна.",
    designateSubmit: "Instant ялагчаар сонгох",
    designateChange: "Instant ялагчийг солих",
    designateClear: "Instant ялагчийг цуцлах",
    designatedNow: (who: string) =>
      `Instant ялагч: ${who} — лот дуусахад зарлагдана.`,
    designated: (paddle: string) =>
      `${paddle} Instant ялагчаар сонгогдлоо. Лот дуусахад зарлагдана.`,
    designationCleared:
      "Instant ялагч цуцлагдлаа. Лот дуусахад хамгийн сүүлд дарсан хүн ялна.",
    designatedBadge: "Instant",
    /* Оролцогч бүрийн хүснэгт. */
    biddersHeading: "Оролцогчид",
    biddersColName: "Оролцогч",
    biddersColBids: "Дарсан тоо",
    biddersColSpent: "Зарцуулсан оноо",
    biddersColRound: "Сүүлд дарсан тойрог",
    biddersColBalance: "Үлдэгдэл оноо",
    lastPresserBadge: "Сүүлд дарсан",
    /* Хаагдсан ч ялагч нь тогтоогдоогүй лот — ердөө ховор, эсвэл хуучин
       журмаар хаагдсан. Ийм лот байвал л самбар дээр гарна. */
    reviewQueue: "Ялагч тодруулах",
    reviewQueueEmpty: "Шалгах хүлээгдэж буй лот алга.",
    reviewQueueHint:
      "Хаагдсан ч ялагч нь автоматаар тогтоогдоогүй лотууд. Дарсан хүмүүсээс ялагчийг сонгоно уу.",
    reviewStatus: "Шалгаж байна",
    reviewClosedAt: "Хаагдсан",
    reviewStanding: "Сүүлд дарсан",
    reviewCandidates: "Дарсан хүмүүс",
    reviewPickWinner: "Ялагчийг сонгох",
    reviewNoCandidates: "Даралт бүртгэгдээгүй байна.",
    reviewSuspendedMark: "түр хаагдсан",
    declareWinner: "Ялагчийг зарлах",
    declareUnsold: "Хэн ч аваагүй",
    declareUnsoldWarning:
      "Лот худалдагдаагүй болж, хэн ч авахгүй. Зарцуулсан оноо буцаагдахгүй — лот явагдсан. Буцаах боломжгүй.",
    confirmDeclareUnsold: "Тийм, хаа",
    winnerNotePlaceholder: "Тайлбар (аудитад үлдэнэ)",
    winnerOverrideWarning:
      "⚠ Та сүүлд дарсан хүнээс өөр хүнийг сонгож байна. Шалтгааныг тайлбартаа заавал бичнэ үү.",
    winnerDeclared: (name: string) => `${name} ялагчаар зарлагдлаа.`,
    declaredUnsold: "Лот худалдагдаагүй гэж бүртгэгдлээ.",
    closedNow: "Лот хаагдлаа.",

    /* Сүүлд дарсан хүн ялсан лот — эсвэл энэ журмаас өмнө цагаар зарагдсан. */
    awardedByClock: "Сүүлд дарсан хүн ялсан",
    awardedBy: (paddle: string) => `${paddle} Instant ялагч сонгосон`,
    lotPage: "Лотын удирдлага",
    backToDashboard: "Самбар руу",
    viewRoom: "Танхимыг үзэх",
    lotState: "Төлөв",
    lotStanding: "Нийт дарсан",
    lotNotFound: "Лот олдсонгүй.",
    ledgerDrift: "Балансын зөрүү",
    ledgerDriftNone: "Зөрүү алга — баланс гүйлгээтэйгээ таарч байна.",
    ledgerDriftWarning:
      "⚠ Дараах хэрэглэгчдийн кэшлэгдсэн үлдэгдэл гүйлгээний нийлбэртэй таарахгүй байна. Энэ нь мөнгө үүсэж эсвэл алга болсныг илтгэнэ.",
    recentAudit: "Сүүлийн үйлдлүүд",

    /* ── Ирсэн мессеж ────────────────────────────────────────────────────
     * /contact-аас ирсэн бичиг. Хариулаагүй нь эхэнд — хамгийн удаан хүлээсэн
     * хүн хамгийн түрүүнд харагдах ёстой.
     */
    contactInbox: "Ирсэн мессеж",
    contactEmpty: "Ирсэн мессеж алга.",
    contactUnhandled: (n: number) => `${n} хариулаагүй`,
    contactFrom: "Илгээгч",
    contactReach: "Холбоо барих",
    contactTopic: "Сэдэв",
    contactMarkHandled: "Хариулсан гэж тэмдэглэх",
    contactHandled: "Хариулсан",
    contactMarked: "Хариулсан гэж тэмдэглэлээ.",

    lotTitle: "Лотын нэр",

    exportTitle: "Төлбөрийн тайлан",
    exportButton: "Excel татах",
    exportHint:
      "Цэнэглэлт, лотын төлбөр, гүйлгээ — гурван хуудастай .xlsx файл. Мөр бүр утасны дугаар агуулах тул татсан бүртгэл аудитад тэмдэглэгдэнэ.",

    /* ── Controls ────────────────────────────────────────────────────────
     * Устгах чанартай үйлдэл бүр шалтгаан шаарддаг. Аудитын мөр нь "юу
     * болсныг" хэлнэ; "яагаад" гэдгийг тухайн үед нь бичүүлж байж л мэднэ.
     */
    newLot: "Шинэ лот",
    create: "Үүсгэх",
    lotId: "Лотын дугаар",
    lotCode: "Код",
    category: "Ангилал",
    images: "Гэрэл зургууд",
    imagesHint: "/media/lots/101/01.jpg | Урд тал | Зураг: Нэр (CC BY 4.0)",
    imagesNote:
      "«Зураг оруулах»-аар оруулсан зураг энд мөр болж нэмэгдэнэ. Мөр бүрт нэг зураг: зам | тайлбар | эх сурвалж. Эхнийх нь нүүр зураг. Эх сурвалжийг зөвхөн лицензтэй (CC BY гэх мэт) зурагт бичнэ — «Зургийн эх сурвалж» хуудсанд гарна.",
    upload: "Зураг оруулах",
    uploading: "Оруулж байна…",
    uploadFailed: "Зураг оруулж чадсангүй. Дахин оролдоно уу.",
    uploadUnreadable:
      "Энэ зургийг уншиж чадсангүй — JPEG, PNG эсвэл WebP оруулна уу.",
    imageCover: "Нүүр",
    imageMakeCover: "Нүүр болгох",
    imageRemove: "Зургийг хасах",
    editLot: "Лотын мэдээлэл засах",
    save: "Хадгалах",
    scheduleLocked:
      "Лот нээгдсэн тул нэг дарах үнэ, эхлэх цагийг өөрчлөх боломжгүй. Нэр, тайлбар, зургийг засаж болно.",
    /* Лот үүсгэх маягт. Зөвхөн нэр, эхлэх цаг, нэг дарах үнэ заавал. */
    pressCost: "Нэг дарах үнэ (оноо)",
    requiredNote: "* тэмдэгтэйг заавал бөглөнө. Бусад нь заавал биш.",
    lotIdAuto: "Хоосон бол автоматаар",
    lotCodeAuto: "Хоосон бол дугаар",
    preview: "Урьдчилан харах",
    previewHint: "Каталогид ингэж харагдана.",
    previewUntitled: "Лотын нэр",
    /* Сервер UTC бүсэд ажилладаг ч оруулсан цагийг Улаанбаатарын цаг гэж уншина. */
    houseTime: "Улаанбаатарын цагаар",
    low: "доод",
    high: "дээд",

    manage: "Удирдах",
    close: "Хаах",
    cancel: "Цуцлах",
    reschedule: "Хойшлуулах",
    confirmClose: "Тийм, хаа",
    confirmCancel: "Тийм, цуцал",
    applyStatus: "Төлөв өөрчлөх",
    applyRole: "Эрх өөрчлөх",
    roleNote:
      "bidder — энгийн оролцогч. admin — удирдлагын самбарт нэвтэрнэ. Эрх бууруулбал тухайн хэрэглэгчийн бүх сесс тэр дороо цуцлагдана.",
    applyAdjust: "Оноо тохируулах",
    reasonPlaceholder: "Шалтгаан (аудитад үлдэнэ)",
    memoPlaceholder: "Тайлбар (хэрэглэгч харна)",

    /* ── Үнэгүй оноо ─────────────────────────────────────────────────────
     * Бэлэг ба засвар хоёр өөр зүйл. Засварыг чимээгүй хийнэ; бэлгийг эзэнд нь
     * хэлж байж бэлэг болно. Тиймээс тусдаа маягт, тусдаа бүртгэл.
     */
    grantBonus: "Үнэгүй оноо бэлэглэх",
    applyBonus: "Бэлэглэх",
    bonusNote:
      "Хэрэглэгчид төлбөргүй оноо нэмнэ — угтах бэлэг, урамшуулал, уучлалт. Хэрэглэгчид мэдэгдэл очиж, хэтэвчний түүхэнд «Урамшуулал» гэж харагдана.",
    bonusAmountPlaceholder: (max: number) => `Оноо (1–${max})`,
    bonusMemoPlaceholder: "Учир нь (хэрэглэгч харна)",
    bonusGranted: (points: number, balance: number) =>
      `${points} оноо бэлэглэлээ. Шинэ үлдэгдэл: ${balance} оноо.`,

    /* ── Гараар бүртгэх төлбөр ───────────────────────────────────────────
     * Бэлнээр эсвэл данс руу шууд төлсөн мөнгө. Бэлэг биш, засвар ч биш —
     * хүн төлсөн тул «Цэнэглэлт»-д тоологдоно.
     */
    recordPayment: "Төлбөр бүртгэж оноо нэмэх",
    paymentNote: (pointMnt: number) =>
      `Бэлнээр эсвэл данс руу шилжүүлж төлсөн мөнгийг бүртгэнэ (1 оноо = ${pointMnt}₮). «Цэнэглэлт»-д тоологдож, Excel тайланд гарна. Хэрэглэгчид мэдэгдэл очно.`,
    paymentAmountPlaceholder: "Дүн (₮)",
    paymentPoints: (points: number) => `= ${points} оноо`,
    paymentMethodCash: "Бэлэн мөнгө",
    paymentMethodBank: "Дансны шилжүүлэг",
    paymentRefBank: "Гүйлгээний дугаар",
    paymentRefCash: "Баримтын дугаар (заавал биш)",
    paymentMemoPlaceholder: "Тэмдэглэл (заавал биш)",
    applyPayment: "Бүртгэх",
    paymentRecorded: (amount: string, points: number, balance: number) =>
      `${amount}₮ бүртгэгдэж ${points} оноо нэмэгдлээ. Шинэ үлдэгдэл: ${balance} оноо.`,
    paymentDuplicate: "Энэ төлбөр аль хэдийн бүртгэгдсэн — дахин нэмээгүй.",
    paymentRefTaken:
      "Энэ гүйлгээний дугаар өмнө нь бүртгэгдсэн байна. Нэг төлбөрийг хоёр удаа оруулах боломжгүй.",
    paymentBadAmount: "Дүн буруу байна.",

    /* ── Хэрэглэгчийн өмнөөс бүртгэл нээх ────────────────────────────────
     * Биечлэн эсвэл утсаар ирсэн хүнд. Утас нь баталгаажсан гэж бүртгэгдэнэ —
     * оператор тухайн хүнтэй шууд харьцаж байгаа нь SMS кодын орлох шалгалт.
     */
    newUser: "Шинэ хэрэглэгч",
    createUserNote:
      "Хэрэглэгчийн өмнөөс энгийн оролцогчийн бүртгэл нээнэ. Утасны дугаар баталгаажсан гэж бүртгэгдэх тул SMS код шаардахгүй. Нууц үгийг хэрэглэгчид өөрөө дамжуулна — тэр нэвтэрсний дараа «Профайл» хэсгээс сольж болно.",
    userConsent:
      "Хэрэглэгч дүрэм, үйлчилгээний нөхцөл, нууцлалын бодлогыг зөвшөөрсөн.",
    createUser: "Бүртгэл үүсгэх",
    userCreated: (paddle: string) => `Бүртгэл үүслээ — паддл ${paddle}.`,
    userPhoneTaken: "Энэ утасны дугаараар бүртгэл аль хэдийн байна.",

    closeWarning:
      "Лот тэр дороо хаагдаж, ялагч нь шууд тодорно: Instant ялагч сонгосон бол тэр, үгүй бол хамгийн сүүлд дарсан хүн. Буцаах боломжгүй.",
    cancelWarning:
      "Лот хүчингүй болж, хэн ч ялахгүй. Энэ лотод зарцуулсан бүх оноо дарсан хүн бүрт буцаагдана. Буцаах боломжгүй.",
    adjustNote:
      "Энэ гүйлгээ хэрэглэгчийн хэтэвчний түүхэнд харагдана. Чимээгүй засвар бол гаднаас нь хулгайгаас ялгагдахгүй.",
  },

  /* ── Зургийн эх сурвалж ──────────────────────────────────────────────────
   * CC BY / CC BY-SA лицензтэй зургийг зохиогч, лицензийг нь дурдсан нөхцөлд
   * ашиглана. Каталогийн картад багтахгүй тул энд жагсааж, footer-оос холбоно.
   */
  credits: {
    title: "Зургийн эх сурвалж",
    lede: "Танхимын өөрийн бус, лицензээр ашиглаж буй гэрэл зураг бүрийн зохиогч болон лиценз. Өөрсдийн авсан зураг энд гарахгүй.",
    empty:
      "Одоогоор лицензээр ашиглаж буй зураг алга — бүх зураг танхимын өөрийнх.",
  },

  /* ── Алдааны хуудас ──────────────────────────────────────────────────────
   * Серверийн алдааны дэлгэрэнгүйг харуулахгүй — зөвхөн код. Хүн бидэнд
   * хандахад тэр кодоор логоос яг тэр алдааг олно.
   */
  error: {
    eyebrow: "Алдаа",
    title: "Ямар нэг зүйл буруу боллоо",
    body: "Хуудсыг ачаалах үед алдаа гарлаа. Дахин оролдоно уу. Асуудал давтагдвал доорх кодыг бидэнд илгээгээрэй.",
    retry: "Дахин оролдох",
    code: "Алдааны код",
  },

  common: {
    /* Зөвхөн товч дарж шилжих үед харагдана. Танхимд толгой хэсгийн дор лотын
       зураг, цаг, үнэ байдаг тул гар/дэлгэц уншигчаар хаялтын самбар хүртэл
       очих зам урт. */
    skipToContent: "Үндсэн хэсэг рүү очих",
    loading: "Ачаалж байна",
    notFound: "Хуудас олдсонгүй",
    backHome: "Нүүр хуудас",
    point: "оноо",
    min: "мин",
    sec: "сек",
    /* Lowercase, for running into a sentence or an ordinal ("1-р тойрог").
       room.round is the capitalised standalone label. */
    roundWord: "тойрог",
  },
} as const;

/**
 * The shape every locale must fill.
 *
 * Derived from the Mongolian dictionary rather than declared by hand, so it
 * cannot fall behind: adding a key here makes every other locale fail to
 * compile until it has one too. That is the point — a missing translation
 * should be a build error, not a blank space in a bidder's face.
 */
export type Dictionary = typeof t;
