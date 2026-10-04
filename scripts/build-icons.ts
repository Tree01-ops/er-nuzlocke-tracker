// Draws the app icon (a Poké Ball on dex paper) and writes the PNGs the PWA manifest and iOS need.
// No image libraries: pixels are computed directly (4x supersampled) and PNG-encoded with zlib.
//
//   npm run icons

import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

type RGBA = [number, number, number, number];
const PAPER: RGBA = [240, 240, 232, 255];
const RED: RGBA = [224, 56, 56, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const INK: RGBA = [48, 48, 48, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

/** Colour at a point, in units where the ball has radius 1 centred at the origin. */
function ball(x: number, y: number, background: RGBA): RGBA {
  const r = Math.hypot(x, y);
  if (r > 1) return background;
  if (r > 0.9) return INK; // outline
  if (r < 0.2) return r > 0.13 ? INK : WHITE; // button
  if (r < 0.3) return INK; // button ring
  if (Math.abs(y) < 0.075) return INK; // band
  return y < 0 ? RED : WHITE;
}

/** `scale`: ball radius as a fraction of half the icon (maskable icons need a safe-zone margin). */
function draw(size: number, scale: number, background: RGBA): Buffer {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (((x + (sx + 0.5) / SS) / size) * 2 - 1) / scale;
          const v = (((y + (sy + 0.5) / SS) / size) * 2 - 1) / scale;
          const c = ball(u, v, background);
          for (let k = 0; k < 3; k++) acc[k] += c[k] * c[3];
          acc[3] += c[3];
        }
      }
      const i = (y * size + x) * 4;
      const a = acc[3] / (SS * SS);
      for (let k = 0; k < 3; k++) px[i + k] = acc[3] ? Math.round(acc[k] / acc[3]) : 0;
      px[i + 3] = Math.round(a);
    }
  }
  return png(size, px);
}

function png(size: number, rgba: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", draw(192, 0.92, CLEAR));
writeFileSync("public/icons/icon-512.png", draw(512, 0.92, CLEAR));
writeFileSync("public/icons/maskable-512.png", draw(512, 0.62, PAPER)); // inside the 80% safe zone
writeFileSync("public/icons/apple-touch-icon.png", draw(180, 0.78, PAPER)); // iOS doesn't do transparency
writeFileSync("public/icons/favicon-32.png", draw(32, 0.95, CLEAR));
console.log("Wrote public/icons/");
