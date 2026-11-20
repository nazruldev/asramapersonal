import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "resources", "app-icon.png");

const androidMipmaps = {
  mdpi: { launcher: 48, foreground: 108 },
  hdpi: { launcher: 72, foreground: 162 },
  xhdpi: { launcher: 96, foreground: 216 },
  xxhdpi: { launcher: 144, foreground: 324 },
  xxxhdpi: { launcher: 192, foreground: 432 },
};

async function resizeSquare(input, size, outPath) {
  await sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

async function main() {
  const publicDir = path.join(root, "public");
  await fs.mkdir(publicDir, { recursive: true });

  const webSizes = [
    ["favicon-16x16.png", 16],
    ["favicon-32x32.png", 32],
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ];

  for (const [name, size] of webSizes) {
    await resizeSquare(source, size, path.join(publicDir, name));
  }

  for (const [density, sizes] of Object.entries(androidMipmaps)) {
    const dir = path.join(root, "android", "app", "src", "main", "res", `mipmap-${density}`);
    await fs.mkdir(dir, { recursive: true });
    const names = ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"];
    for (const file of names) {
      const size = file.includes("foreground") ? sizes.foreground : sizes.launcher;
      await resizeSquare(source, size, path.join(dir, file));
    }
  }

  console.log("Icons generated from resources/app-icon.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
