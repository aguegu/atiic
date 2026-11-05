// A QR code on an e-paper on the CH341A, BUSY on D4: the SSD1681 (r8845's
// 1.54" 200x200) when .env.local has BENCH_SSD1681, else the SSD1680 (its
// 1.54" 152x152, BENCH_SSD1680 or the defaults): the text from the command line (https://i2c.ninja by default),
// the smallest QR version that holds it at error correction M, each module
// as many pixels as fit (no quiet zone unless given), centred.
// Shown by a full update, then the panel asleep: e-paper keeps it with the
// power gone, so it stays readable unplugged.
//
//   node --env-file-if-exists=.env.local demo/epaper-qr.js [text] [quiet modules]
//
// qrcode-generator (MIT, a dev dependency) encodes; atiic draws.
import qrcode from 'qrcode-generator';
import { Ssd1680, Ssd1681 } from '../src/index.js';
import { blankFrame, plot } from '../src/devices/ssd1680.js';
import { openCh341 } from '../src/adapters/ch341/node.js';

const TEXT = process.argv[2] ?? 'https://i2c.ninja';
const ECC = 'M';
// the white quiet zone around it, in modules. The spec asks 4; on r8845's
// module none scans fine (a phone, 2026-11-05: https://i2c.ninja, 6-pixel
// modules, 150 of the 152 pixels), the panel's white surround serving, so
// none by default: the biggest code. 2 gave 5-pixel modules, 125 pixels
const QUIET_MODULES = Number(process.argv[3] ?? 0);

const setting = process.env.BENCH_SSD1681 ?? process.env.BENCH_SSD1680;
const lines = setting ? Object.fromEntries(setting.split(',').map((kv) => kv.trim().split('='))) : {};
const Epd = process.env.BENCH_SSD1681 ? Ssd1681 : Ssd1680;
const bus = await openCh341();
const epd = new Epd(bus, lines);
const { width: w, height: h } = epd;

const qr = qrcode(0, ECC); // 0: the smallest version that holds it
qr.addData(TEXT, 'Byte');
qr.make();
const n = qr.getModuleCount();
const scale = Math.floor(Math.min(w, h) / (n + 2 * QUIET_MODULES));
if (scale < 1) throw new Error(`${n} modules don't fit ${w}x${h}`);
const x0 = Math.floor((w - n * scale) / 2), y0 = Math.floor((h - n * scale) / 2);

// the bytes a version holds at ECC (the library's own answer: the most "a"s
// that make() takes)
function capacity(version) {
  const fits = (k) => {
    try {
      const q = qrcode(version, ECC);
      q.addData('a'.repeat(k), 'Byte');
      q.make();
      return true;
    } catch {
      return false;
    }
  };
  let lo = 0, hi = 3000;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (fits(m)) lo = m;
    else hi = m - 1;
  }
  return lo;
}

// the text just past a version that would draw bigger: say how much to cut
// (twice a few bytes over dropped a code to 1 pixel a module)
const version = (n - 17) / 4, bytes = Buffer.byteLength(TEXT, 'utf8');
const smaller = Math.floor(Math.min(w, h) / (n - 4 + 2 * QUIET_MODULES));
if (version > 1 && smaller > scale) {
  const fits = capacity(version - 1);
  console.warn(`warning: ${bytes} bytes need version ${version}, ${scale} px a module; version ${version - 1} holds ${fits} at ${ECC}: cut ${bytes - fits} bytes for ${smaller} px a module`);
}

const frame = blankFrame(w, h);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (!qr.isDark(r, c)) continue;
  for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) plot(frame, w, x0 + c * scale + dx, y0 + r * scale + dy);
}

await epd.init();
const ms = await epd.show(frame);
await epd.sleep();
await bus.close();
console.log(`${Epd.name} ${w}x${h}, "${TEXT}": QR version ${(n - 17) / 4}-${ECC}, ${n} modules, ${scale} px each (${n * scale} px, ${((n * scale * 27.7) / w).toFixed(1)} mm est.), shown in ${ms} ms; asleep: unplug it and it stays`);
