// الكروت الأصلية — 30 بطاقة (15 مفاجآت + 15 صندوق المدينة).
// نفس القيم مُزرَعة في migration 0008_seed_cards.sql — أي تعديل هنا يستلزم تحديث الـ seed.
export type CardDeck = "surprise" | "city_chest";

export type CardEffectType =
  | "gain"
  | "loss"
  | "collect_from_each"
  | "pay_each"
  | "move_to"
  | "move_back"
  | "move_to_nearest_hub"
  | "pay_per_building"
  | "go_to_detention"
  | "grant_exit_card";

export interface GameCard {
  id: string;
  deck: CardDeck;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  effect_type: CardEffectType;
  effect_value: number;
  target_tile: string | null;
  icon: string;
}

export const CARDS: GameCard[] = [
  // ============ مفاجآت (15) ============
  { id: "sp-01", deck: "surprise", title_ar: "انطلاقة جديدة", title_en: "Fresh Start", description_ar: "انتقل إلى نقطة البداية واحصل على مكافأة الدوران.", description_en: "Advance to Start and collect the passing bonus.", effect_type: "move_to", effect_value: 0, target_tile: "start", icon: "🏁" },
  { id: "sp-02", deck: "surprise", title_ar: "مطاردة المفتش", title_en: "Inspector Chase", description_ar: "اذهب إلى التوقيف فورًا. لا تمرّ على البداية.", description_en: "Go directly to Detention. Do not pass Start.", effect_type: "go_to_detention", effect_value: 0, target_tile: null, icon: "🚨" },
  { id: "sp-03", deck: "surprise", title_ar: "بطاقة عطف", title_en: "Card of Mercy", description_ar: "احتفظ بهذه البطاقة للخروج من التوقيف مجانًا.", description_en: "Keep this card to exit Detention for free.", effect_type: "grant_exit_card", effect_value: 1, target_tile: null, icon: "🎟️" },
  { id: "sp-04", deck: "surprise", title_ar: "استثمار موفق", title_en: "Winning Investment", description_ar: "عوائد مشروعك الصغير: استلم 150 درهمًا.", description_en: "Your side project paid off: collect 150 dirhams.", effect_type: "gain", effect_value: 150, target_tile: null, icon: "📈" },
  { id: "sp-05", deck: "surprise", title_ar: "غرامة وقوف", title_en: "Parking Fine", description_ar: "وقفت سيارتك في مكان غير نظامي: ادفع 100 درهم.", description_en: "Illegal parking fine: pay 100 dirhams.", effect_type: "loss", effect_value: 100, target_tile: null, icon: "🚗" },
  { id: "sp-06", deck: "surprise", title_ar: "رحلة العمل", title_en: "Business Trip", description_ar: "تقدّم إلى أقرب محطة نقل وادفع الأجرة المقررة إن كانت مملوكة.", description_en: "Advance to the nearest transport hub and pay rent if owned.", effect_type: "move_to_nearest_hub", effect_value: 0, target_tile: null, icon: "🚉" },
  { id: "sp-07", deck: "surprise", title_ar: "عاصفة رملية", title_en: "Sandstorm", description_ar: "اعصار رجلك ثلاث خانات إلى الخلف.", description_en: "Move back 3 tiles.", effect_type: "move_back", effect_value: 3, target_tile: null, icon: "🌪️" },
  { id: "sp-08", deck: "surprise", title_ar: "دعوة حفل", title_en: "Party Invitation", description_ar: "تقدّم إلى حي بورسعيد — المدينة الساحرة.", description_en: "Advance to Port Said.", effect_type: "move_to", effect_value: 0, target_tile: "port-said", icon: "🎉" },
  { id: "sp-09", deck: "surprise", title_ar: "فاتورة صيانة", title_en: "Maintenance Bill", description_ar: "صيانة طارئة لمقر شركتك: ادفع 150 درهمًا.", description_en: "Emergency office maintenance: pay 150 dirhams.", effect_type: "loss", effect_value: 150, target_tile: null, icon: "🧾" },
  { id: "sp-10", deck: "surprise", title_ar: "جائزة العمارة", title_en: "Architecture Prize", description_ar: "فاز تصميمك بجائزة المدينة: استلم 100 درهم.", description_en: "Your design won the city prize: collect 100 dirhams.", effect_type: "gain", effect_value: 100, target_tile: null, icon: "🏆" },
  { id: "sp-11", deck: "surprise", title_ar: "شريك سخي", title_en: "Generous Partner", description_ar: "كل لاعب يديك 50 درهمًا احتفاءً بشراكتكم.", description_en: "Each player pays you 50 dirhams.", effect_type: "collect_from_each", effect_value: 50, target_tile: null, icon: "🤝" },
  { id: "sp-12", deck: "surprise", title_ar: "استرداد تأمين", title_en: "Refund", description_ar: "استلمت تأمين الإيجار القديم: 200 درهم.", description_en: "Old rent deposit refunded: collect 200 dirhams.", effect_type: "gain", effect_value: 200, target_tile: null, icon: "💰" },
  { id: "sp-13", deck: "surprise", title_ar: "طريق مختصر", title_en: "Shortcut", description_ar: "استلم بطاقة خروج مجانية من التوقيف.", description_en: "Collect a free exit card from Detention.", effect_type: "grant_exit_card", effect_value: 1, target_tile: null, icon: "🎫" },
  { id: "sp-14", deck: "surprise", title_ar: "نداء الميناء", title_en: "Harbor Call", description_ar: "تقدّم إلى أقرب محطة نقل فورًا.", description_en: "Advance to the nearest transport hub.", effect_type: "move_to_nearest_hub", effect_value: 0, target_tile: null, icon: "⚓" },
  { id: "sp-15", deck: "surprise", title_ar: "فرصة ذهبية", title_en: "Golden Chance", description_ar: "انتقل إلى دبي — عاصمة الأعمال.", description_en: "Advance to Dubai.", effect_type: "move_to", effect_value: 0, target_tile: "dubai", icon: "🗺️" },

  // ============ صندوق المدينة (15) ============
  { id: "cc-01", deck: "city_chest", title_ar: "خطأ بنكي", title_en: "Bank Error", description_ar: "خطأ مصرفي لصالحك: استلم 100 درهم.", description_en: "Bank error in your favor: collect 100 dirhams.", effect_type: "gain", effect_value: 100, target_tile: null, icon: "🏦" },
  { id: "cc-02", deck: "city_chest", title_ar: "تبرع خيري", title_en: "Charity Donation", description_ar: "تبرّع لمؤسسة المدينة: ادفع 50 درهمًا.", description_en: "Donate to the city fund: pay 50 dirhams.", effect_type: "loss", effect_value: 50, target_tile: null, icon: "❤️" },
  { id: "cc-03", deck: "city_chest", title_ar: "عوائد إقامة", title_en: "Lodging Returns", description_ar: "أرباح تأجير شقتك: استلم 75 درهمًا.", description_en: "Apartment rental income: collect 75 dirhams.", effect_type: "gain", effect_value: 75, target_tile: null, icon: "🏠" },
  { id: "cc-04", deck: "city_chest", title_ar: "صيانة إجبارية", title_en: "Forced Maintenance", description_ar: "ادفع 40 درهمًا عن كل مبنى و80 عن كل معلم مميز.", description_en: "Pay 40 dirhams per building and 80 per landmark.", effect_type: "pay_per_building", effect_value: 40, target_tile: null, icon: "🏗️" },
  { id: "cc-05", deck: "city_chest", title_ar: "رسوم استيراد", title_en: "Import Fees", description_ar: "مواد بناء مستوردة: ادفع 150 درهمًا رسومًا.", description_en: "Imported building materials: pay 150 dirhams in fees.", effect_type: "loss", effect_value: 150, target_tile: null, icon: "🚢" },
  { id: "cc-06", deck: "city_chest", title_ar: "ميراث أرضي", title_en: "Land Inheritance", description_ar: "ورثت قطعة أرض قيمة: استلم 200 درهم.", description_en: "You inherited a valuable plot: collect 200 dirhams.", effect_type: "gain", effect_value: 200, target_tile: null, icon: "🌾" },
  { id: "cc-07", deck: "city_chest", title_ar: "كفالة شراكة", title_en: "Partnership Bond", description_ar: "كل لاعب يديك 25 درهمًا تسويةً للحسابات.", description_en: "Each player pays you 25 dirhams.", effect_type: "collect_from_each", effect_value: 25, target_tile: null, icon: "🤲" },
  { id: "cc-08", deck: "city_chest", title_ar: "حملة تجميل", title_en: "Beautification Drive", description_ar: "ساهم في تجميل المدينة: ادفع 25 درهمًا لكل لاعب.", description_en: "Contribute to the city: pay each player 25 dirhams.", effect_type: "pay_each", effect_value: 25, target_tile: null, icon: "🌸" },
  { id: "cc-09", deck: "city_chest", title_ar: "عودة للوطن", title_en: "Homeward", description_ar: "انتقل إلى نقطة البداية واحصل على المكافأة.", description_en: "Advance to Start and collect the bonus.", effect_type: "move_to", effect_value: 0, target_tile: "start", icon: "🧭" },
  { id: "cc-10", deck: "city_chest", title_ar: "تصريح مرور", title_en: "Transit Pass", description_ar: "استلم بطاقة خروج مجانية من التوقيف.", description_en: "Collect a free exit card from Detention.", effect_type: "grant_exit_card", effect_value: 1, target_tile: null, icon: "🎫" },
  { id: "cc-11", deck: "city_chest", title_ar: "مخالفة بناء", title_en: "Building Violation", description_ar: "مخالفة بلدية عن توسعة غير مرخصة: ادفع 100 درهم.", description_en: "Municipal fine for an unpermitted extension: pay 100 dirhams.", effect_type: "loss", effect_value: 100, target_tile: null, icon: "📋" },
  { id: "cc-12", deck: "city_chest", title_ar: "سندات البلدية", title_en: "Municipal Bonds", description_ar: "نضجت سنداتك: استلم 50 درهمًا.", description_en: "Your bonds matured: collect 50 dirhams.", effect_type: "gain", effect_value: 50, target_tile: null, icon: "📜" },
  { id: "cc-13", deck: "city_chest", title_ar: "موعد رسمي", title_en: "Official Meeting", description_ar: "تقدّم إلى الرياض لحضور مؤتمر الاستثمار.", description_en: "Advance to Riyadh for the investment conference.", effect_type: "move_to", effect_value: 0, target_tile: "riyadh", icon: "🏛️" },
  { id: "cc-14", deck: "city_chest", title_ar: "جولة تفقدية", title_en: "Inspection Tour", description_ar: "انتقل إلى عمّان لافتتاح مشروع سكني.", description_en: "Advance to Amman for a housing project opening.", effect_type: "move_to", effect_value: 0, target_tile: "amman", icon: "🏘️" },
  { id: "cc-15", deck: "city_chest", title_ar: "فوائد المدخرات", title_en: "Savings Interest", description_ar: "فوائد حسابك: استلم 20 درهمًا.", description_en: "Interest on your savings: collect 20 dirhams.", effect_type: "gain", effect_value: 20, target_tile: null, icon: "🪙" },
];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export function cardById(id: string): GameCard | undefined {
  return BY_ID.get(id);
}
export const VALID_EFFECT_TYPES: CardEffectType[] = [
  "gain", "loss", "collect_from_each", "pay_each", "move_to",
  "move_back", "move_to_nearest_hub", "pay_per_building",
  "go_to_detention", "grant_exit_card",
];
