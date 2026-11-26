// توليد أيقونات PWA من الشعار SVG الأصلي — يعمل مرة واحدة عبر: npm run icons
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const svg = fs.readFileSync(path.join(root, "public/logo.svg"), "utf8");

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-192.png", size: 192, pad: 0.1 },
  { file: "icon-maskable-512.png", size: 512, pad: 0.1 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  const scale = t.pad ? 1 - t.pad * 2 : 1;
  const inner = Math.round(t.size * scale);
  const offset = Math.round((t.size - inner) / 2);
  await sharp(Buffer.from(svg))
    .resize(inner, inner)
    .extend({
      top: offset,
      bottom: offset,
      left: offset,
      right: offset,
      background: { r: 11, g: 31, b: 58, alpha: 1 },
    })
    .png()
    .toFile(path.join(root, "public/icons", t.file));
  console.log("generated", t.file);
}
