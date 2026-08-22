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
    lede: "Тойрог давах тусам үнэ хаях хугацаа 5 минутаас 5 секунд болж хумирна. Хамгийн тэвчээртэй нь бус, хамгийн шийдэмгий нь цохино.",
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
    bidsSoFar: (n: number) => `${n} хаялт`,

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
    resultsLede: "Цохигдсон лотууд",
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
    hammered: "ЦОХИВ",

    /* 05 — the hall. */
    hallTitle: "Цаг хугацаа шийднэ.",
    hallLede: "Хамгийн тэвчээртэй нь бус, хамгийн шийдэмгий нь цохино.",
    enter: "Танхимд орох",
  },

  lot: {
    lot: "Лот",
    estimate: "Үнэлгээ",
    opening: "Нээлтийн үнэ",
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
    statusSold: "Цохигдсон",
    statusUnsold: "Худалдагдаагүй",
    hammer: "Цохисон үнэ",
    hammerRound: "Цохисон тойрог",
    result: "Үр дүн",
    bidCount: "Хаялтын тоо",
    aboveEstimate: "Үнэлгээнээс дээш",
    belowEstimate: "Үнэлгээнээс доош",

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
    joinPenaltyLabel: "Нэгдэх төлбөр",
    joinPenalty: (points: number) =>
      `Энэ лот аль хэдийн явагдаж эхэлсэн. Дундаас нь нэгдсэн тул таны данснаас ${points} оноо суутгагдана.`,
    round: "Тойрог",
    ofRounds: "6 тойргоос",
    currentPrice: "Одоогийн үнэ",
    openingPrice: "Нээлтийн үнэ",
    noBidsYet: "Хаялт хийгдээгүй",
    leader: "Тэргүүлэгч",
    youLead: "Та тэргүүлж байна",
    outbid: "Таны үнэ давагдсан",
    bidClock: "Хаялтын хугацаа",
    roundClock: "Тойрог дуусахад",
    bidClockHint: "Хаялт болгонд дахин тоологдоно",
    feed: "Хаялтын урсгал",
    feedEmpty: "Анхны хаялтыг хүлээж байна",
    you: "Та",
    minNext: "Дараагийн доод үнэ",
    minIncrement: "Хаялтын доод хэмжээ",
    lateEntry: "Дундаас нэгдэх",
    lateEntryHint: (round: number, step: number) =>
      `Та энэ лотод хараахан хаялт хийгээгүй. ${round}-р тойрогт нэгдэх доод хэмжээ ${step} оноо.`,
    placeBid: "Үнэ хаях",
    bidding: "Хаяж байна…",
    custom: "Өөр дүн",
    customApply: "Хаях",
    tooLow: (min: number) => `Доод тал нь ${min} оноо байх ёстой`,
    sold: "ЦОХИВ",
    soldNote: "Хаялтын хугацаа дууслаа",
    soldFor: "Цохисон үнэ",
    unsold: "Худалдагдсангүй",
    winner: "Хүлээн авагч",
    rulesLink: "Журам",
    connection: "Холболт",
    connected: "Шууд дамжуулалт",
    roundAdvanced: (n: number) => `${n}-р тойрог эхэллээ`,
    roundClockShrunk: (label: string) => `Хаялтын хугацаа ${label} болов`,

    /* ── Server rejections ────────────────────────────────────────────────
     * One line per reason the back end can turn a bid down. They are written
     * to tell the bidder what to DO, not to name an error class — "sign in",
     * "top up", not "unauthorised", "insufficient funds".
     */
    signInToBid: "Хаялт хийхийн тулд нэвтэрнэ үү",
    rejectTooLow: "Үнэ хэтэрхий бага байна. Дахин оролдоно уу.",
    rejectClosed: "Энэ лотын хугацаа дууссан байна.",
    rejectSignIn: "Хаялт хийхийн тулд нэвтэрнэ үү.",
    rejectVerify: "Утасны дугаараа баталгаажуулсны дараа хаялт хийх боломжтой.",
    rejectFunds: "Онооны үлдэгдэл хүрэлцэхгүй байна.",
    rejectSuspended: "Таны бүртгэл түр хаагдсан байна.",
    rejectRateLimited: "Хэт олон хаялт хийлээ. Хэсэг хүлээнэ үү.",
    rejectError: "Хаялт бүртгэгдсэнгүй. Дахин оролдоно уу.",
  },

  rules: {
    title: "Журам",
    eyebrow: "Дуудлага худалдааны дэг",
    lede: "Худалдаа зургаан тойрогтой, нийт 2 цаг 45 минут үргэлжилнэ. Тойрог бүрд үнэ хаях хугацаа багасна.",
    table: {
      round: "Тойрог",
      bidClock: "Хаялтын хугацаа",
      duration: "Үргэлжлэх",
      increment: "Доод хэмжээ",
      lateEntry: "Дундаас нэгдэх",
    },
    pointsTitle: "Оноо ба үнэ",
    pointsBody:
      "Бүх үнэ онооны системээр тооцогдоно. 1 оноо нь 1 000₮-тэй тэнцэнэ. Хаялт бүр бүхэл оноогоор хийгдэнэ.",
    clocksTitle: "Хоёр цаг зэрэг явна",
    clocksBidTitle: "Хаялтын хугацаа",
    clocksBidBody:
      "Хаялт болгонд тухайн тойргийн хугацаа дахин тоологдоно. Хугацаа дуусвал лот тэр дор цохигдоно.",
    clocksRoundTitle: "Тойргийн хугацаа",
    clocksRoundBody:
      "Тойрог өөрийн хугацаагаараа явж, дуусахад дараагийн тойрог эхэлж, хаялтын хугацаа хумирна.",
    lateTitle: "Дундаас нэгдэх",
    lateBody:
      "Хараахан хаялт хийгээгүй хүн 2-р тойргоос хойш нэгдэхдээ тойргийн дугаарыг 10-аар үржүүлсэнтэй тэнцэх доод хэмжээгээр орно. Жишээ нь 3-р тойрогт 30 оноо, 6-р тойрогт 60 оноо.",
    incrementTitle: "Үнэ өсгөх доод хэмжээ",
    incrementBody:
      "1-р тойрогт 1 оноо, 2-р тойргоос хойш 2 оноо. Дундаас нэгдэгчид дээрх дүрэм давуу хүчинтэй.",
  },

  auth: {
    loginTitle: "Нэвтрэх",
    loginLede:
      "Дуудлага худалдаанд оролцохын тулд бүртгэлдээ нэвтэрнэ үү.",
    registerTitle: "Бүртгүүлэх",
    registerLede:
      "Оролцогчийн бүртгэл үүсгэснээр танд паддлын дугаар олгогдоно.",

    name: "Овог нэр",
    phone: "Утасны дугаар",
    password: "Нууц үг",
    passwordConfirm: "Нууц үгээ давтах",
    passwordHint: "Хамгийн багадаа 8 тэмдэгт.",

    showPassword: "Нууц үг харуулах",
    hidePassword: "Нууц үг нуух",
    forgot: "Нууц үгээ мартсан уу?",
    remember: "Намайг сана",

    terms: "Үйлчилгээний нөхцөл, нууцлалын бодлого, дуудлага худалдааны журмыг уншиж зөвшөөрлөө.",

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
    lede: "Шууд явагдаж буй, удахгүй эхлэх болон дуусгавар болсон бүх лот. Лот бүр өөрийн танхимтай — шууд явагдаж буй лот руу орвол хаялт тэр дороо эхэлнэ.",
    liveSection: "Шууд явагдаж байна",
    upcomingSection: "Удахгүй эхэлнэ",
    resultsSection: "Дууссан",
    empty: "Энэ ангилалд лот алга.",
    countLabel: (n: number) => `${n} лот`,

    filterAll: "Бүгд",
    filterLive: "Шууд",
    filterUpcoming: "Удахгүй",
    filterResults: "Дууссан",

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
    address: "Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, Энх тайвны өргөн чөлөө 19",
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
      "Сонгодог дуудлага худалдаа цагаар үргэлжилж, оролцогчид эцэст нь ядраад шийдвэрээ хойшлуулдаг. Бид эсрэгээр нь хийсэн: тойрог давах тусам хаялтын хугацаа хумигдаж, 5 минутаас 5 секунд болно. Сүүлийн тойрогт бодох цаг үлддэггүй — зөвхөн шийдэх цаг үлддэг.",

    principlesTitle: "Зарчим",
    principles: [
      {
        title: "Ил тод байдал",
        body: "Хаялт бүр бодит цагт, бүх оролцогчид ижил хугацаанд харагдана. Нуугдмал доод үнэ, дотоод давуу эрх байхгүй.",
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
    address: "Улаанбаатар, Сүхбаатар дүүрэг, 1-р хороо, Энх тайвны өргөн чөлөө 19",
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
    profileLede: "Таны үлдэгдэл, хаялтын түүх, хожсон лотууд.",
    walletTitle: "Хэтэвч",
    walletLede: "Оноо худалдан авах, гүйлгээний түүхээ харах.",

    balance: "Үлдэгдэл",
    bidsPlaced: "Нийт хаялт",
    lotsEntered: "Оролцсон лот",
    lotsWon: "Хожсон лот",
    spent: "Зарцуулсан",

    paddle: "Паддлын дугаар",
    phone: "Утас",
    memberSince: "Бүртгүүлсэн",
    signOut: "Гарах",

    bidHistory: "Хаялтын түүх",
    bidHistoryEmpty: "Та хараахан хаялт хийгээгүй байна.",
    wonLots: "Хожсон лотууд",
    wonLotsEmpty: "Хожсон лот алга.",
    /* Ялагчид 7 хоногийн дотор холбогдох үүрэгтэй — /terms-д заасан. */
    winnerAction: "Ажлын 7 хоногийн дотор бидэнтэй холбогдож төлбөрөө тохирно уу.",

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
    markRead: "Бүгдийг уншсан болгох",

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
    statBids: "Нийт хаялт",
    statPointsOut: "Гаргасан оноо",
    statPointsHeld: "Хэрэглэгчид дэх оноо",
    statTopups: "Цэнэглэлт (₮)",

    lots: "Лотууд",
    users: "Хэрэглэгчид",
    ledgerDrift: "Балансын зөрүү",
    ledgerDriftNone: "Зөрүү алга — баланс гүйлгээтэйгээ таарч байна.",
    ledgerDriftWarning:
      "⚠ Дараах хэрэглэгчдийн кэшлэгдсэн үлдэгдэл гүйлгээний нийлбэртэй таарахгүй байна. Энэ нь мөнгө үүсэж эсвэл алга болсныг илтгэнэ.",
    recentAudit: "Сүүлийн үйлдлүүд",

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
    imagesHint: "/media/lots/101/01.svg | Урд тал",
    imagesNote:
      "Мөр бүрт нэг зураг: зам | тайлбар. Мөрийн дараалал нь галерейн дараалал, эхнийх нь нүүр зураг. Тайлбарыг дэлгэц уншигч болон зураг ачаалагдаагүй үед ашиглана.",
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
      "bidder — энгийн оролцогч. staff, admin — удирдлагын самбарт нэвтэрнэ. Эрх бууруулбал тухайн хэрэглэгчийн бүх сесс тэр дороо цуцлагдана.",
    applyAdjust: "Оноо тохируулах",
    reasonPlaceholder: "Шалтгаан (аудитад үлдэнэ)",
    memoPlaceholder: "Тайлбар (хэрэглэгч харна)",

    closeWarning:
      "Лот тэр дороо дуусч, тухайн үед тэргүүлж байгаа хүн ялагч болно. Буцаах боломжгүй.",
    cancelWarning:
      "Лот хүчингүй болж, хэн ч ялахгүй. Нэгдэх төлбөр төлсөн бүх хүнд буцаагдана. Буцаах боломжгүй.",
    adjustNote:
      "Энэ гүйлгээ хэрэглэгчийн хэтэвчний түүхэнд харагдана. Чимээгүй засвар бол гаднаас нь хулгайгаас ялгагдахгүй.",
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
