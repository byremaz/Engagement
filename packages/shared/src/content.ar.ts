/**
 * Arabic labels for the content bank, keyed by the language-independent content IDs
 * defined in `content.ts` (race `id`, country `code`, ordering `id` / option `id`).
 *
 * Nothing here is score-bearing: `correctOrder`, option IDs, country codes and
 * question IDs remain the only identity used by scoring, so a translation can
 * never change a correct answer [secure-coding].
 */
import type { GameType } from './types';

/** Race titles / scenes by `RaceContent.id`. */
export const RACE_LABELS_AR: Record<string, { title: string; scene: string }> = {
  'RACE-P': { title: 'جولة تدريبية', scene: 'ممر مكتبي كرتوني' },
  'RACE-1': { title: 'جولة التسخين', scene: 'ممر مكتبي كرتوني' },
  'RACE-2': { title: 'خلّك مركّز', scene: 'ساحة الاستراحة' },
  'RACE-3': { title: 'الانطلاقة الأخيرة', scene: 'ممر خط النهاية' },
};

/** Country names by ISO 3166-1 alpha-3 code. */
export const COUNTRY_NAMES_AR: Record<string, string> = {
  SAU: 'السعودية',
  EGY: 'مصر',
  BRA: 'البرازيل',
  AUS: 'أستراليا',
  JPN: 'اليابان',
  ITA: 'إيطاليا',
  CAN: 'كندا',
  NOR: 'النرويج',
  MDG: 'مدغشقر',
  ARG: 'الأرجنتين',
  DEU: 'ألمانيا',
};

export interface OrderLabelsAr {
  prompt: string;
  direction: string;
  explanation: string;
  /** Labels in the same order as `OrderContent.options` (already the correct order). */
  labels: [string, string, string, string];
}

const ASC_AR = 'الأصغر في الأعلى ← الأكبر في الأسفل';
const SHORT_LONG_AR = 'الأقصر في الأعلى ← الأطول في الأسفل';
const EARLIEST_AR = 'الأسبق في الأعلى ← الأحدث في الأسفل';

/** Ordering-question labels by `OrderContent.id`. */
export const ORDER_LABELS_AR: Record<string, OrderLabelsAr> = {
  'SORT-P': {
    prompt: 'رتّب وحدات الوقت من الأقصر إلى الأطول.',
    direction: SHORT_LONG_AR,
    explanation: 'الثانية أقصر، ثم الدقيقة، ثم الساعة، ثم اليوم.',
    labels: ['ثانية', 'دقيقة', 'ساعة', 'يوم'],
  },
  'SORT-01': {
    prompt: 'رتّب هذه الحيوانات البالغة حسب عدد الأرجل، الأقل أولاً.',
    direction: 'الأقل أرجلاً في الأعلى ← الأكثر في الأسفل',
    explanation: '٢ ثم ٤ ثم ٦ ثم ٨ أرجل.',
    labels: ['دجاجة', 'قطة', 'نملة', 'عنكبوت'],
  },
  'SORT-02': {
    prompt: 'رتّب هذه الأشهر الهجرية حسب التقويم.',
    direction: EARLIEST_AR,
    explanation: 'الأشهر ٧ و٨ و٩ و١٠.',
    labels: ['رجب', 'شعبان', 'رمضان', 'شوال'],
  },
  'SORT-03': {
    prompt: 'رتّب وحدات التخزين من الأصغر إلى الأكبر.',
    direction: ASC_AR,
    explanation: 'حجم وحدة التخزين يتزايد.',
    labels: ['كيلوبايت', 'ميجابايت', 'جيجابايت', 'تيرابايت'],
  },
  'SORT-04': {
    prompt: 'رتّب هذه القيم من الأصغر إلى الأكبر.',
    direction: ASC_AR,
    explanation: '0.25 < ‏1/3 < 0.5 < 0.75.',
    labels: ['0.25', 'ثلث', 'نصف', '0.75'],
  },
  'SORT-05': {
    prompt: 'رتّب هذه الأشهر حسب التقويم.',
    direction: EARLIEST_AR,
    explanation: 'الأشهر ٣ و٦ و٩ و١٢.',
    labels: ['مارس', 'يونيو', 'سبتمبر', 'ديسمبر'],
  },
  'SORT-06': {
    prompt: 'رتّب هذه المسافات من الأقصر إلى الأطول.',
    direction: SHORT_LONG_AR,
    explanation: '100 ثم 500 ثم 750 ثم 1000 متر.',
    labels: ['100 متر', 'نصف كيلومتر', '750 متر', 'كيلومتر واحد'],
  },
  'SORT-07': {
    prompt: 'رتّب هذه الحروف حسب الترتيب الأبجدي الإنجليزي (A–Z).',
    direction: 'الترتيب الأبجدي الإنجليزي A–Z: الأول في الأعلى',
    explanation: 'B قبل G، ثم S، ثم W في الأبجدية الإنجليزية.',
    labels: ['B', 'G', 'S', 'W'],
  },
  'SORT-08': {
    prompt: 'رتّب هذه الكواكب من الأقرب إلى الأبعد عن الشمس.',
    direction: 'الأقرب للشمس في الأعلى ← الأبعد في الأسفل',
    explanation: 'الكواكب الثالث والرابع والخامس والثامن من الشمس.',
    labels: ['الأرض', 'المريخ', 'المشتري', 'نبتون'],
  },
  'SORT-09': {
    prompt: 'رتّب هذه الأوزان من الأخف إلى الأثقل.',
    direction: 'الأخف في الأعلى ← الأثقل في الأسفل',
    explanation: '250 ثم 500 ثم 750 ثم 1000 جرام.',
    labels: ['250 جرام', 'نصف كيلوجرام', '750 جرام', 'كيلوجرام واحد'],
  },
  'SORT-10': {
    prompt: 'رتّب هذه المدد من الأقصر إلى الأطول.',
    direction: SHORT_LONG_AR,
    explanation: '45 ثم 60 ثم 90 ثم 120 ثانية.',
    labels: ['45 ثانية', 'دقيقة واحدة', '90 ثانية', 'دقيقتان'],
  },
  'SPARE-01': {
    prompt: 'رتّب هذه الأيام بدءاً من السبت.',
    direction: 'السبت أولاً في الأعلى ← الأحدث في الأسفل',
    explanation: 'السبت، الأحد، الثلاثاء، الخميس حسب ترتيب الأسبوع.',
    labels: ['السبت', 'الأحد', 'الثلاثاء', 'الخميس'],
  },
  'SPARE-02': {
    prompt: 'رتّب هذه القيم من الأصغر إلى الأكبر.',
    direction: ASC_AR,
    explanation: '0.1 < 0.3 < 0.6 < 0.9.',
    labels: ['0.1', '0.3', '0.6', '0.9'],
  },
  'TIE-01': {
    prompt: 'رتّب هذه القيم من الأصغر إلى الأكبر.',
    direction: ASC_AR,
    explanation: '0.2 < 0.25 < 0.333 < 0.4.',
    labels: ['0.2', 'ربع', 'ثلث', '0.4'],
  },
  'TIE-02': {
    prompt: 'رتّب هذه المدد من الأقصر إلى الأطول.',
    direction: SHORT_LONG_AR,
    explanation: '30 ثم 45 ثم 75 ثم 90 ثانية.',
    labels: ['نصف دقيقة', '45 ثانية', 'دقيقة وربع', '90 ثانية'],
  },
};

export interface HowToPlayAr {
  title: string;
  headline: string;
  steps: [string, string, string];
  scoringNote: string;
}

export const HOW_TO_PLAY_AR: Record<GameType, HowToPlayAr> = {
  RLGL: {
    title: 'امش… وقف!',
    headline: 'اضغط باستمرار عند الأخضر. ارفع إصبعك عند الأحمر. من يتحرّك عند الأحمر يخرج!',
    steps: [
      'اضغط باستمرار على الزر عند الأخضر للمشي.',
      'ارفع إصبعك عند الأحمر؛ الحركة تعني الخروج.',
      'اوصل خط النهاية لتسجيل النقاط. من خرج يعود في الجولة القادمة.',
    ],
    scoringNote: 'الخروج = 0 نقطة في هذه الجولة. نقاطك السابقة محفوظة.',
  },
  GEO: {
    title: 'وين الدولة؟',
    headline: 'دوّر الكرة الأرضية وثبّت موقع الدولة. داخل حدودها = نقاط كاملة، وكل ما قرّبت زادت نقاطك.',
    steps: [
      'دوّر الكرة الأرضية للوصول إلى الدولة.',
      'اضغط لتحديد موقعك، ثم ثبّت موقعي.',
      'داخل الدولة = نقاط كاملة، والأقرب يحصل على نقاط أكثر.',
    ],
    scoringNote: 'داخل الدولة = 100. كل 500 كم بعيداً تخصم 10 نقاط.',
  },
  ORDER: {
    title: 'رتّبها!',
    headline: 'رتّب البطاقات الأربع بالترتيب المطلوب من الأعلى إلى الأسفل، وثبّت ترتيبك قبل انتهاء الوقت.',
    steps: [
      'اقرأ الترتيب المطلوب.',
      'حرّك البطاقات الأربع من الأعلى إلى الأسفل.',
      'ثبّت ترتيبي. كل موضع صحيح = 25 نقطة.',
    ],
    scoringNote: 'كل بطاقة في موضعها الصحيح تمنحك 25 نقطة.',
  },
};

/** Localized country name with a safe fallback to the English content name. */
export function countryNameAr(code: string, fallback: string): string {
  return COUNTRY_NAMES_AR[code] ?? fallback;
}
