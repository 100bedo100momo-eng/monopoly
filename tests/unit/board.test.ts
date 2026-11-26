import { describe, it, expect } from "vitest";
import { BOARD_TILES, GROUP_MEMBERS, tileAt, tileById } from "@/game/board";

describe("لوحة اللعبة", () => {
  it("تحتوي 40 خانة بمواقع فريدة 0..39", () => {
    expect(BOARD_TILES).toHaveLength(40);
    const positions = BOARD_TILES.map((t) => t.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 40 }, (_, i) => i));
    const ids = new Set(BOARD_TILES.map((t) => t.id));
    expect(ids.size).toBe(40);
  });

  it("الزوايا الأربع بالأنواع الصحيحة", () => {
    expect(tileAt(0).kind).toBe("start");
    expect(tileAt(10).kind).toBe("detention");
    expect(tileAt(20).kind).toBe("rest");
    expect(tileAt(30).kind).toBe("goto_detention");
  });

  it("22 عقارًا في 8 مجموعات و4 محطات وشركتين و6 خانات كروت", () => {
    const props = BOARD_TILES.filter((t) => t.kind === "property");
    expect(props).toHaveLength(22);
    const groups = Object.entries(GROUP_MEMBERS).filter(([g]) => g !== "hub" && g !== "utility");
    const sizes = groups.map(([, ids]) => ids.length).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 2, 3, 3, 3, 3, 3, 3]);
    expect(BOARD_TILES.filter((t) => t.kind === "hub")).toHaveLength(4);
    expect(BOARD_TILES.filter((t) => t.kind === "utility")).toHaveLength(2);
    expect(BOARD_TILES.filter((t) => t.kind === "surprise")).toHaveLength(3);
    expect(BOARD_TILES.filter((t) => t.kind === "chest")).toHaveLength(3);
    expect(BOARD_TILES.filter((t) => t.kind === "tax")).toHaveLength(2);
  });

  it("كل عقار له سعر ورهن نصف السعر وإيجارات تصاعدية (6 مستويات)", () => {
    for (const t of BOARD_TILES.filter((x) => x.kind === "property")) {
      expect(t.price).toBeGreaterThan(0);
      expect(t.mortgage_value).toBe(Math.floor((t.price ?? 0) / 2));
      expect(t.rents).toHaveLength(6);
      const rents = t.rents as number[];
      for (let i = 1; i < rents.length; i++) expect(rents[i]).toBeGreaterThan(rents[i - 1]);
      expect(t.build_cost).toBeGreaterThan(0);
    }
  });

  it("المحطات: 4 إيجارات تصاعدية وسعر موحد", () => {
    const hubs = BOARD_TILES.filter((t) => t.kind === "hub");
    for (const h of hubs) {
      expect(h.price).toBe(200);
      expect(h.rents).toEqual([25, 50, 100, 200]);
    }
  });

  it("الإحداثيات على محيط الشبكة 11×11", () => {
    for (const t of BOARD_TILES) {
      const onPerimeter = t.grid_row === 0 || t.grid_row === 10 || t.grid_col === 0 || t.grid_col === 10;
      expect(onPerimeter).toBe(true);
    }
  });

  it("tileById وtileAt يعملان", () => {
    expect(tileById("dubai")?.name_en).toBe("Dubai");
    expect(tileAt(39).id).toBe("dubai");
  });
});
