import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "public/**", "playwright-report/**", "test-results/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      // أنماط مقصودة: قراءة localStorage عند الإقلاع وجلب اللقطة الأولى — مزامنة مع أنظمة خارجية
      "react-hooks/set-state-in-effect": "warn",
      // خط Cairo عبر CDN في App Router (لا توجد pages/_document)
      "@next/next/no-page-custom-font": "off",
    },
  },
];

export default config;
