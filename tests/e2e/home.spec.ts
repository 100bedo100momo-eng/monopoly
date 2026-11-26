import { test, expect } from "@playwright/test";

// اختبار يعمل بلا قاعدة بيانات (الصفحة الرئيسية ثابتة)
test("الصفحة الرئيسية تعرض اللعبة", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText(/ملوك العقارات|Property Kings/);
});

test("صفحة القواعد تعرض الأقسام", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.locator("h1")).toContainText(/قواعد|Rules/);
});
