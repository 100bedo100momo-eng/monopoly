import { describe, it, expect } from "vitest";
import { CARDS, VALID_EFFECT_TYPES } from "@/game/cards";
import { tileById } from "@/game/board";

describe("الكروت الأصلية", () => {
  it("30 بطاقة: 15 مفاجآت + 15 صندوق المدينة", () => {
    expect(CARDS).toHaveLength(30);
    expect(CARDS.filter((c) => c.deck === "surprise")).toHaveLength(15);
    expect(CARDS.filter((c) => c.deck === "city_chest")).toHaveLength(15);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(30);
  });

  it("كل الحقول مكتملة وأنواع التأثير صالحة", () => {
    for (const c of CARDS) {
      expect(c.title_ar.length).toBeGreaterThan(2);
      expect(c.title_en.length).toBeGreaterThan(2);
      expect(c.description_ar.length).toBeGreaterThan(2);
      expect(c.description_en.length).toBeGreaterThan(2);
      expect(c.icon.length).toBeGreaterThan(0);
      expect(VALID_EFFECT_TYPES).toContain(c.effect_type);
      expect(c.effect_value).toBeGreaterThanOrEqual(0);
    }
  });

  it("أهداف move_to تشير إلى خانات موجودة", () => {
    for (const c of CARDS) {
      if (c.effect_type === "move_to") {
        expect(c.target_tile).not.toBeNull();
        expect(tileById(c.target_tile as string)).toBeDefined();
      } else {
        expect(c.target_tile).toBeNull();
      }
    }
  });

  it("تغطية كل أنواع التأثيرات المطلوبة", () => {
    const used = new Set(CARDS.map((c) => c.effect_type));
    for (const effect of VALID_EFFECT_TYPES) expect(used.has(effect)).toBe(true);
  });
});
