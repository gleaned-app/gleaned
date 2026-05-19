import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const svg = readFileSync(join(root, "public/icon.svg"));

// Maskable version — background fills the full canvas (no safe-zone padding)
const svgMaskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#F3EDE3"/>
  <text x="256" y="330" font-family="Georgia,serif" font-size="300" font-style="italic" text-anchor="middle" fill="#9B5F2E">g</text>
</svg>`);

const icons = [
  { src: svg,          size: 192,  out: "icon-192.png" },
  { src: svg,          size: 512,  out: "icon-512.png" },
  { src: svgMaskable,  size: 512,  out: "icon-maskable-512.png" },
  { src: svg,          size: 180,  out: "icon-apple.png" },
];

for (const { src, size, out } of icons) {
  await sharp(src, { density: 144 })
    .resize(size, size)
    .png()
    .toFile(join(root, "public", out));
  console.log(`  ✓ ${out}`);
}
console.log("Done.");
