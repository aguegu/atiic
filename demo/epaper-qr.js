// A QR code on the SSD1680 e-paper (r8845's 1.54" 152x152, the CH341A, BUSY
// on D4): the text from the command line (https://i2c.ninja by default),
// the smallest QR version that holds it at error correction M, each module
// as many pixels as fit with a quiet zone of at least 2 modules, centred.
// Shown by a full update, then the panel asleep: e-paper keeps it with the
// power gone, so it stays readable unplugged.
//
//   node --env-file-if-exists=.env.local demo/epaper-qr.js [text]
//
// qrcode-generator (MIT, a dev dependency) encodes; atiic draws.
import qrcode from 'qrcode-generator';
import { Ssd1680 } from '../src/index.js';
import { blankFrame, plot } from '../src/devices/ssd1680.js';
import { openCh341 } from '../src/adapters/ch341/node.js';

const TEXT = process.argv[2] ?? 'https://i2c.ninja';
const ECC = 'M';
const QUIET_MODULES = 2; // the spec asks 4; the panel's white margin helps

const lines = process.env.BENCH_SSD1680
  ? Object.fromEntries(process.env.BENCH_SSD1680.split(',').map((kv) => kv.trim().split('=')))
  : {};
const bus = await openCh341();
const epd = new Ssd1680(bus, lines);
const { width: w, height: h } = epd;

const qr = qrcode(0, ECC); // 0: the smallest version that holds it
qr.addData(TEXT, 'Byte');
qr.make();
const n = qr.getModuleCount();
const scale = Math.floor(Math.min(w, h) / (n + 2 * QUIET_MODULES));
if (scale < 1) throw new Error(`${n} modules don't fit ${w}x${h}`);
const x0 = Math.floor((w - n * scale) / 2), y0 = Math.floor((h - n * scale) / 2);

const frame = blankFrame(w, h);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (!qr.isDark(r, c)) continue;
  for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) plot(frame, w, x0 + c * scale + dx, y0 + r * scale + dy);
}

await epd.init();
const ms = await epd.show(frame);
await epd.sleep();
await bus.close();
console.log(`"${TEXT}": QR version ${(n - 17) / 4}-${ECC}, ${n} modules, ${scale} px each (${n * scale} px, ${((n * scale * 27.7) / w).toFixed(1)} mm est.), shown in ${ms} ms; asleep: unplug it and it stays`);
