// بيانات لوحة اللعبة — مصدر الحقيقة الوحيد للواجهة.
// ملاحظة: نفس القيم مُزرَعة في migration 0007_seed_board.sql — أي تعديل هنا يستلزم تحديث الـ seed.
export type TileKind =
  | "start"
  | "property"
  | "hub"
  | "utility"
  | "tax"
  | "surprise"
  | "chest"
  | "rest"
  | "detention"
  | "goto_detention";

export interface BoardTile {
  id: string;
  kind: TileKind;
  name_ar: string;
  name_en: string;
  /** المجموعة اللونية (للعقارات: أسماء المجموعات؛ للمحطات hub؛ للشركات utility) */
  color_group: string | null;
  price: number | null;
  mortgage_value: number | null;
  build_cost: number | null;
  /** [أساسي, مبنى1..مبنى4, معلم مميز] — للمحطات: [1 محطة, 2, 3, 4]؛ للشركات null */
  rents: number[] | null;
  tax_amount: number | null;
  /** ترتيب الخانة على اللوحة 0..39 (0 = البداية) */
  position: number;
  /** إحداثيات الشبكة 11×11 (الصف 0 في الأعلى) */
  grid_row: number;
  grid_col: number;
}

function perimeter(position: number): { grid_row: number; grid_col: number } {
  const p = ((position % 40) + 40) % 40;
  if (p === 0) return { grid_row: 10, grid_col: 10 };
  if (p < 10) return { grid_row: 10, grid_col: 10 - p };
  if (p === 10) return { grid_row: 10, grid_col: 0 };
  if (p < 20) return { grid_row: 20 - p, grid_col: 0 };
  if (p === 20) return { grid_row: 0, grid_col: 0 };
  if (p < 30) return { grid_row: 0, grid_col: p - 20 };
  if (p === 30) return { grid_row: 0, grid_col: 10 };
  return { grid_row: p - 30, grid_col: 10 };
}

interface RawTile {
  id: string;
  kind: TileKind;
  ar: string;
  en: string;
  group?: string;
  price?: number;
  build?: number;
  rents?: number[];
  tax?: number;
}

const RAW: RawTile[] = [
  { id: "start", kind: "start", ar: "نقطة البداية", en: "Start" },
  { id: "fayoum", kind: "property", ar: "الفيوم", en: "Faiyum", group: "sand", price: 60, build: 50, rents: [2, 10, 30, 90, 160, 250] },
  { id: "chest-1", kind: "chest", ar: "صندوق المدينة", en: "City Chest" },
  { id: "jericho", kind: "property", ar: "أريحا", en: "Jericho", group: "sand", price: 60, build: 50, rents: [4, 20, 60, 180, 320, 450] },
  { id: "tax-income", kind: "tax", ar: "ضريبة الدخل", en: "Income Tax", tax: 200 },
  { id: "hub-oasis", kind: "hub", ar: "محطة الواحة", en: "Oasis Terminal", group: "hub", price: 200, rents: [25, 50, 100, 200] },
  { id: "tartus", kind: "property", ar: "طرطوس", en: "Tartus", group: "sky", price: 100, build: 50, rents: [6, 30, 90, 270, 400, 550] },
  { id: "surprise-1", kind: "surprise", ar: "مفاجآت", en: "Surprise" },
  { id: "latakia", kind: "property", ar: "اللاذقية", en: "Latakia", group: "sky", price: 100, build: 50, rents: [6, 30, 90, 270, 400, 550] },
  { id: "deir-ez-zor", kind: "property", ar: "دير الزور", en: "Deir ez-Zor", group: "sky", price: 120, build: 50, rents: [8, 40, 100, 300, 450, 600] },
  { id: "detention", kind: "detention", ar: "التوقيف", en: "Detention" },
  { id: "port-said", kind: "property", ar: "بورسعيد", en: "Port Said", group: "rose", price: 140, build: 100, rents: [10, 50, 150, 450, 625, 750] },
  { id: "utility-nile", kind: "utility", ar: "كهرباء النيل", en: "Nile Power", group: "utility", price: 150, rents: [4, 10] },
  { id: "port-sudan", kind: "property", ar: "بورسودان", en: "Port Sudan", group: "rose", price: 140, build: 100, rents: [10, 50, 150, 450, 625, 750] },
  { id: "alexandria", kind: "property", ar: "الإسكندرية", en: "Alexandria", group: "rose", price: 160, build: 100, rents: [12, 60, 180, 500, 700, 900] },
  { id: "hub-pearl", kind: "hub", ar: "ميناء اللؤلؤ", en: "Pearl Harbor Port", group: "hub", price: 200, rents: [25, 50, 100, 200] },
  { id: "irbid", kind: "property", ar: "إربد", en: "Irbid", group: "orange", price: 180, build: 100, rents: [14, 70, 200, 550, 750, 950] },
  { id: "chest-2", kind: "chest", ar: "صندوق المدينة", en: "City Chest" },
  { id: "zarqa", kind: "property", ar: "الزرقاء", en: "Zarqa", group: "orange", price: 180, build: 100, rents: [14, 70, 200, 550, 750, 950] },
  { id: "amman", kind: "property", ar: "عمّان", en: "Amman", group: "orange", price: 200, build: 100, rents: [16, 80, 220, 600, 800, 1000] },
  { id: "rest", kind: "rest", ar: "استراحة الملوك", en: "Kings' Rest" },
  { id: "homs", kind: "property", ar: "حمص", en: "Homs", group: "red", price: 220, build: 150, rents: [18, 90, 250, 700, 875, 1050] },
  { id: "surprise-2", kind: "surprise", ar: "مفاجآت", en: "Surprise" },
  { id: "saida", kind: "property", ar: "صيدا", en: "Sidon", group: "red", price: 220, build: 150, rents: [18, 90, 250, 700, 875, 1050] },
  { id: "beirut", kind: "property", ar: "بيروت", en: "Beirut", group: "red", price: 240, build: 150, rents: [20, 100, 300, 750, 925, 1100] },
  { id: "hub-sky", kind: "hub", ar: "مطار السماء", en: "Sky Airport", group: "hub", price: 200, rents: [25, 50, 100, 200] },
  { id: "mosul", kind: "property", ar: "الموصل", en: "Mosul", group: "gold", price: 260, build: 150, rents: [22, 110, 330, 800, 975, 1150] },
  { id: "basra", kind: "property", ar: "البصرة", en: "Basra", group: "gold", price: 260, build: 150, rents: [22, 110, 330, 800, 975, 1150] },
  { id: "surprise-3", kind: "surprise", ar: "مفاجآت", en: "Surprise" },
  { id: "baghdad", kind: "property", ar: "بغداد", en: "Baghdad", group: "gold", price: 280, build: 150, rents: [24, 120, 360, 850, 1025, 1200] },
  { id: "goto_detention", kind: "goto_detention", ar: "اذهب إلى التوقيف", en: "Go to Detention" },
  { id: "dammam", kind: "property", ar: "الدمام", en: "Dammam", group: "emerald", price: 300, build: 200, rents: [26, 130, 390, 900, 1100, 1275] },
  { id: "jeddah", kind: "property", ar: "جدة", en: "Jeddah", group: "emerald", price: 300, build: 200, rents: [26, 130, 390, 900, 1100, 1275] },
  { id: "chest-3", kind: "chest", ar: "صندوق المدينة", en: "City Chest" },
  { id: "riyadh", kind: "property", ar: "الرياض", en: "Riyadh", group: "emerald", price: 320, build: 200, rents: [28, 150, 450, 1000, 1200, 1400] },
  { id: "hub-silver", kind: "hub", ar: "محطة الفضة", en: "Silver Terminal", group: "hub", price: 200, rents: [25, 50, 100, 200] },
  { id: "utility-spring", kind: "utility", ar: "مياه الينابيع", en: "Spring Water", group: "utility", price: 150, rents: [4, 10] },
  { id: "doha", kind: "property", ar: "الدوحة", en: "Doha", group: "navy", price: 350, build: 200, rents: [35, 175, 500, 1100, 1300, 1500] },
  { id: "tax-luxury", kind: "tax", ar: "ضريبة الكماليات", en: "Luxury Tax", tax: 100 },
  { id: "dubai", kind: "property", ar: "دبي", en: "Dubai", group: "navy", price: 400, build: 200, rents: [50, 200, 600, 1400, 1700, 2000] },
];

export const BOARD_TILES: BoardTile[] = RAW.map((t, position) => ({
  id: t.id,
  kind: t.kind,
  name_ar: t.ar,
  name_en: t.en,
  color_group: t.group ?? null,
  price: t.price ?? null,
  mortgage_value: t.price ? Math.floor(t.price / 2) : null,
  build_cost: t.build ?? null,
  rents: t.rents ?? null,
  tax_amount: t.tax ?? null,
  position,
  ...perimeter(position),
}));

const BY_ID = new Map(BOARD_TILES.map((t) => [t.id, t]));
const BY_POSITION = new Map(BOARD_TILES.map((t) => [t.position, t]));

export function tileById(id: string): BoardTile | undefined {
  return BY_ID.get(id);
}
export function tileAt(position: number): BoardTile {
  return BY_POSITION.get(((position % 40) + 40) % 40) as BoardTile;
}
export const DETENTION_TILE = tileById("detention") as BoardTile;

/** ألوان المجموعات اللونية (أصلية — تمييز باللون + أيقونة/نص دائمًا في الواجهة) */
export const GROUP_COLORS: Record<string, string> = {
  sand: "#B98A5A",
  sky: "#6EC1E4",
  rose: "#E07AB0",
  orange: "#F09A3E",
  red: "#E5484D",
  gold: "#F5C542",
  emerald: "#2FA46B",
  navy: "#3A5BC7",
  hub: "#8B5CF6",
  utility: "#14B8A6",
};

export const GROUP_LABELS: Record<string, { ar: string; en: string }> = {
  sand: { ar: "الرمليّة", en: "Sand" },
  sky: { ar: "السماويّة", en: "Sky" },
  rose: { ar: "الوردية", en: "Rose" },
  orange: { ar: "البرتقالية", en: "Orange" },
  red: { ar: "الحمراء", en: "Red" },
  gold: { ar: "الذهبية", en: "Gold" },
  emerald: { ar: "الزمردية", en: "Emerald" },
  navy: { ar: "الكحلية", en: "Navy" },
  hub: { ar: "المحطات", en: "Hubs" },
  utility: { ar: "الخدمات", en: "Utilities" },
};

export const OWNABLE_KINDS: TileKind[] = ["property", "hub", "utility"];
export const GROUP_MEMBERS: Record<string, string[]> = BOARD_TILES.reduce<Record<string, string[]>>(
  (acc, t) => {
    if ((t.kind === "property" || t.kind === "hub" || t.kind === "utility") && t.color_group) {
      (acc[t.color_group] ??= []).push(t.id);
    }
    return acc;
  },
  {},
);
