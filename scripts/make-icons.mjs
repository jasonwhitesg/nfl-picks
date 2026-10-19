// Builds every app icon size from assets/app-icon.webp.
// Run again after changing the image:  node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "assets/app-icon.webp";
const OUT = "public/icons";

await mkdir(OUT, { recursive: true });

const square = (size, file) =>
  sharp(SOURCE).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(`${OUT}/${file}`);

// Android "maskable" icons get cropped to a circle or squircle, so the art
// is shrunk to the middle 80%. The border is a heavily blurred copy of the
// art so there's no visible box edge around it.
const padded = async (size, file) => {
  const inner = Math.round(size * 0.8);
  // Soft-edged mask: the art fades out over its outer ~8% instead of ending in a hard line
  const feather = Math.round(inner * 0.08);
  const mask = Buffer.from(
    `<svg width="${inner}" height="${inner}"><defs><filter id="f"><feGaussianBlur stdDeviation="${feather / 2}"/></filter></defs>` +
      `<rect x="${feather}" y="${feather}" width="${inner - feather * 2}" height="${inner - feather * 2}" rx="${feather}" fill="#fff" filter="url(#f)"/></svg>`
  );
  const art = await sharp(SOURCE)
    .resize(inner, inner)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const backdrop = await sharp(SOURCE).resize(size, size).blur(size / 12).modulate({ brightness: 0.7 }).png().toBuffer();
  const offset = Math.round((size - inner) / 2);
  return sharp(backdrop)
    .composite([{ input: art, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
};

await Promise.all([
  square(512, "icon-512.png"),
  square(192, "icon-192.png"),
  square(180, "apple-touch-icon.png"), // iPhone home screen
  square(32, "favicon-32.png"), // browser tab
  square(256, "logo.png"), // shown inside the app
  padded(512, "icon-maskable-512.png"),
]);

console.log(`Icons written to ${OUT}/`);
