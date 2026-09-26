/* 生成 PNG 图标（无需任何第三方依赖，自己写 PNG 编码） */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 绘图 ---------- */
function draw(size) {
  const S = size, SS = 4;                          // 4x 超采样抗锯齿
  const W = S * SS;
  const acc = new Float32Array(S * S * 4);
  const px = (x, y) => {
    // 圆角矩形内的点
    const r = W * 0.2266;
    const cx = Math.min(Math.max(x, r), W - r);
    const cy = Math.min(Math.max(y, r), W - r);
    const inside = x >= 0 && y >= 0 && x < W && y < W &&
      (Math.hypot(x - cx, y - cy) <= r || (x >= r && x <= W - r) || (y >= r && y <= W - r));
    return inside;
  };
  // 渐变底色
  const c1 = [0x6c, 0x5c, 0xe7], c2 = [0x8b, 0x7c, 0xf6], c3 = [0xa7, 0x8b, 0xfa];
  const grad = (t) => {
    const a = t < 0.55 ? [c1, c2, t / 0.55] : [c2, c3, (t - 0.55) / 0.45];
    return [0, 1, 2].map((i) => a[0][i] + (a[1][i] - a[0][i]) * a[2]);
  };
  // 高光圆
  const hl = { x: W * 0.79, y: W * 0.19, r: W * 0.168 };
  const hl2 = { x: W * 0.19, y: W * 0.84, r: W * 0.137 };
  // 对勾
  const P1 = [W * 0.293, W * 0.504], P2 = [W * 0.430, W * 0.648], P3 = [W * 0.715, W * 0.351];
  const LW = W * 0.0899;
  const distSeg = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
  };

  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let oy = 0; oy < SS; oy++) {
        for (let ox = 0; ox < SS; ox++) {
          const x = sx * SS + ox + 0.5, y = sy * SS + oy + 0.5;
          if (!px(x, y)) continue;
          let col = grad((x / W) * 0.5 + (y / W) * 0.5);
          // 高光
          if (Math.hypot(x - hl.x, y - hl.y) <= hl.r) col = col.map((v) => v + (255 - v) * 0.13);
          if (Math.hypot(x - hl2.x, y - hl2.y) <= hl2.r) col = col.map((v) => v + (255 - v) * 0.10);
          // 对勾（白色描边，圆头近似）
          const d = Math.min(distSeg([x, y], P1, P2), distSeg([x, y], P3, P2));
          if (d <= LW / 2) col = [255, 255, 255];
          else if (d <= LW / 2 + 1.2) {
            const t = 1 - (d - LW / 2) / 1.2;
            col = col.map((v) => v + (255 - v) * t);
          }
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (sy * S + sx) * 4;
      if (a === 0) continue;
      acc[i] = r / (a / 255); acc[i + 1] = g / (a / 255); acc[i + 2] = b / (a / 255);
      acc[i + 3] = a / n;
    }
  }
  const out = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S * 4; i++) out[i] = Math.max(0, Math.min(255, Math.round(acc[i])));
  return encodePng(S, S, out);
}

mkdirSync(resolve(ROOT, 'icons'), { recursive: true });
for (const size of [180, 192, 512]) {
  const file = resolve(ROOT, 'icons', `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log('生成', file.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
}
