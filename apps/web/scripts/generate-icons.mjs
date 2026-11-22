import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const fromRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const targets = [
  { path: "src/app/icon1.png", size: 32 },
  { path: "src/app/apple-icon.png", size: 180 },
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
];

const svg = await readFile(fromRoot("src/app/icon.svg"));
await mkdir(fromRoot("public/icons"), { recursive: true });

for (const { path, size } of targets) {
  await sharp(svg, { density: Math.ceil((72 * size) / 96) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(fromRoot(path));
  console.log(`Wrote ${path} (${size}x${size})`);
}
