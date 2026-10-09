// Малює іконку застосунку (дві картки, на передній — смуги прапора Німеччини)
// і кодує її в PNG без сторонніх бібліотек.
import { deflateSync } from 'node:zlib';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function local(u, v, cx, cy, deg) {
  const a = deg * Math.PI / 180, dx = u - cx, dy = v - cy;
  return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
}
function inRoundRect([x, y], hw, hh, r) {
  const qx = Math.abs(x) - (hw - r), qy = Math.abs(y) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

const BG1 = [99, 102, 241], BG2 = [49, 46, 129];
const WHITE = [255, 255, 255], BLACK = [26, 26, 26], RED = [221, 0, 0], GOLD = [255, 206, 0], GREY = [203, 207, 222];

function shade(u, v) {
  let c = mix(BG1, BG2, (u + v) / 2);
  const back = local(u, v, 0.42, 0.53, -13);
  if (inRoundRect(back, 0.25, 0.31, 0.05)) c = mix(c, WHITE, 0.32);
  const shadow = local(u - 0.012, v - 0.022, 0.555, 0.5, 7);
  if (inRoundRect(shadow, 0.265, 0.325, 0.055)) c = mix(c, [20, 18, 60], 0.28);
  const p = local(u, v, 0.555, 0.5, 7);
  if (inRoundRect(p, 0.26, 0.32, 0.05)) {
    const fx = (p[0] + 0.26) / 0.52, fy = (p[1] + 0.32) / 0.64;
    if (fy < 0.13) c = BLACK;
    else if (fy < 0.26) c = RED;
    else if (fy < 0.39) c = GOLD;
    else c = WHITE;
    const bar = (y0, y1, x1) => fy > y0 && fy < y1 && fx > 0.14 && fx < x1;
    if (bar(0.54, 0.62, 0.84) || bar(0.72, 0.80, 0.62)) c = GREY;
  }
  return c;
}

export function renderIconPng(size, ss = 3) {
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = ss * ss, i = (y * size + x) * 3;
      rgb[i] = Math.round(r / n); rgb[i + 1] = Math.round(g / n); rgb[i + 2] = Math.round(b / n);
    }
  }
  return encodePng(size, size, rgb);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
