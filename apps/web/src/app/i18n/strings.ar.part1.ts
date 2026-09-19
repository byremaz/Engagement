/**
 * Arabic strings — PART 1 of 3 (common, games, states, signals, join).
 * Split into parts purely to keep each file small and reviewable; the parts are
 * merged in `strings.ar.ts`, which is the file `LocaleService` imports.
 *
 * Tone: clear, friendly Arabic suitable for a Saudi workplace.
 * Numerals stay Western Arabic digits (0-9) in BOTH languages (plan §1), so
 * scores and join codes are never ambiguous.
 */
export const AR_PART1 = {
  // ------------------------------------------------------------------ common
  'app.title': 'تحدّي أساس',
  'app.builtUsing': 'صُنع باستخدام أساس',
  'common.loading': 'جارٍ التحميل…',
  'common.close': 'إغلاق',
  'common.cancel': 'إلغاء',
  'common.confirm': 'تأكيد',
  'common.back': 'رجوع',
  'common.retry': 'حاول مرة أخرى',
  'common.help': 'مساعدة',
  'common.of': 'من',
  'common.notPlayed': 'لم تُلعب',
  'common.dash': '—',
  'common.you': 'أنت',
  'common.points': 'نقطة',
  'common.pts': 'نقطة',
  'common.rank': 'الترتيب',
  'common.total': 'المجموع',
  'common.language': 'اللغة',
  'common.english': 'English',
  'common.arabic': 'العربية',
  'common.on': 'مُفعّل',
  'common.off': 'مُعطّل',
  'common.yes': 'نعم',
  'common.no': 'لا',
  'common.more': 'المزيد',
  'common.details': 'التفاصيل',
  'common.copy': 'نسخ',
  'common.copied': 'تم النسخ',

  // ------------------------------------------------------------------- games
  'game.RLGL': 'امش… وقف!',
  'game.GEO': 'وين الدولة؟',
  'game.ORDER': 'رتّبها!',
  'game.RLGL.short': 'امش… وقف!',
  'game.GEO.short': 'وين الدولة؟',
  'game.ORDER.short': 'رتّبها!',

  // ------------------------------------------------------------------ states
  'state.Draft': 'مسودة',
  'state.Lobby': 'غرفة الانتظار',
  'state.Instructions': 'التعليمات',
  'state.Practice': 'تجربة',
  'state.Ready': 'الاستعداد',
  'state.Countdown': 'العد التنازلي',
  'state.RoundActive': 'الجولة جارية',
  'state.InputLocked': 'أُغلق الإدخال',
  'state.Reveal': 'كشف النتائج',
  'state.GameResults': 'نتائج اللعبة',
  'state.TournamentResults': 'النتائج النهائية',
  'state.Closed': 'انتهت الجلسة',
  'state.paused': 'متوقّفة مؤقتًا',

  // ----------------------------------------------------------------- signals
  'signal.green': 'أخضر',
  'signal.red': 'أحمر',
  'signal.green.go': 'أخضر — امش',
  'signal.red.stop': 'أحمر — وقف',
  'signal.paused': 'متوقّفة مؤقتًا',
  'signal.paused.title': 'أوقف المقدّم الجولة مؤقتًا',
  'signal.paused.body': 'أوقف المقدّم الحدث مؤقتًا. الوقت والإدخال متجمّدان — لا يمكن إخراجك الآن.',
  'signal.paused.hostBody': 'الحدث متوقّف مؤقتًا. المؤقّتات والإدخال متجمّدة للجميع.',
  'signal.paused.wasBefore': 'قبل الإيقاف: {signal}',
  'signal.paused.resumeHint': 'انتظر المقدّم ليستأنف الجولة.',

  // -------------------------------------------------------------------- join
  'join.heading': 'انضم إلى التحدّي',
  'join.codeLabel': 'رمز الدخول',
  'join.codePlaceholder': 'ABC123',
  'join.nameLabel': 'اسمك',
  'join.namePlaceholder': 'مثال: سارة',
  'join.submit': 'انضم',
  'join.joining': 'جارٍ الانضمام…',
  'join.recoverLink': 'انضممت سابقًا من جهاز آخر',
  'join.recoveryLabel': 'رمز الاسترجاع',
  'join.recoverSubmit': 'استعد مكاني',
  'join.error.name': 'الرجاء إدخال اسمك.',
  'join.error.code': 'الرجاء إدخال رمز الدخول.',
  'join.error.closed': 'الانضمام مغلق لهذه الجلسة.',
  'join.error.generic': 'تعذّر الانضمام. تأكّد من الرمز وحاول مرة أخرى.',
  'join.error.notFound': 'لم نجد جلسة بهذا الرمز.',
  'join.error.full': 'هذه الجلسة مكتملة.',
  'join.error.badRecovery': 'رمز الاسترجاع غير صحيح لهذه الجلسة.',
  'join.avatarNote': 'اخترنا لك صورة رمزية — تقدر تبدأ اللعب فورًا.',
  'join.welcomeBack': 'أهلًا بعودتك، {name}',
  'join.alreadyJoined': 'أنت منضم مسبقًا إلى الجلسة {code} من هذا الجوال.',
  'join.continueAs': 'أكمل باسم {avatar} {name}',
  'join.joinAsSomeoneElse': 'انضم باسم شخص آخر',
  'join.joinedCount': 'انضم {count}',
  'join.open': 'الانضمام مفتوح',
  'join.closed': 'الانضمام مغلق',
  'join.recoveryPlaceholder': 'رمز من 8 أحرف',
  'join.privacyNote':
    'لا نطلب رقم جوال ولا بريدًا إلكترونيًا ولا رقمًا وظيفيًا. يُكتشف نوع جهازك تلقائيًا لمساعدة المقدّم، ولا يظهر أبدًا على الشاشة العامة.',
} as const;
