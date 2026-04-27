/**
 * Generates minimal PNG icon files for the extension.
 * Run once before loading the extension:
 *
 *   node extension/scripts/create-icons.js
 *
 * Requires Node.js only — no npm dependencies.
 * Output: extension/icons/icon16.png, icon48.png, icon128.png
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Colour: Umpire Coder blue (#4f7cff) ──────────────────────────────────────
const R = 0x4f, G = 0x7c, B = 0xff;

const SIZES = [16, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'icons');

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const buf = makePNG(size, size, R, G, B);
  const dest = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(dest, buf);
  console.log(`Created ${path.relative(process.cwd(), dest)} (${buf.length} bytes)`);
}

// ── PNG builder ───────────────────────────────────────────────────────────────

function makePNG(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // colour type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // Raw image: for each row, filter byte (0) + w × 3 RGB bytes
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    raw[off] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3]     = r;
      raw[off + 1 + x * 3 + 1] = g;
      raw[off + 1 + x * 3 + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const lenBuf  = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── CRC-32 (PNG requires it for every chunk) ──────────────────────────────────

function crc32(buf) {
  const table = buildCRCTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCRCTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
}
