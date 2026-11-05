// the ST7735S on a bench: r8845's 0.96" 80x160 IPS module on the CH341A's
// SPI (BENCH_ST7735 gives its lines). Its MISO isn't wired, so nothing reads
// back: these show the commands go through and how fast; what the panel
// shows is for the eye. Left showing: black, a white border, red, green and
// blue squares (left to right held landscape)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { St7735s } from '../../src/index.js';
import { rgb565 } from '../../src/devices/st7735s.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { ST7735 } from './bench.js';

const FULL_FILL_MS = 500; // a full screen, 25,600 bytes: 235 ms seen on r8845
const RED = rgb565(255, 0, 0), GREEN = rgb565(0, 255, 0), BLUE = rgb565(0, 0, 255);
const WHITE = 0xffff, BLACK = 0x0000;

describe('st7735s (board)', { skip: ST7735 ? false : 'no BENCH_ST7735: no display on the bench' }, () => {
  let bus, lcd;
  before(async () => {
    bus = await openCh341();
    lcd = new St7735s(bus, ST7735);
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await lcd.init();
  });

  it(`fills the screen in under ${FULL_FILL_MS} ms`, async () => {
    for (const c of [RED, GREEN, BLUE]) {
      const t0 = performance.now();
      await lcd.fill(c);
      const ms = performance.now() - t0;
      assert.ok(ms < FULL_FILL_MS, `${ms.toFixed(0)} ms`);
    }
  });

  it('leaves its test pattern: a white border on black, red, green, blue', async () => {
    const { width: w, height: h } = lcd;
    await lcd.fill(BLACK);
    await lcd.fillRect(0, 0, w, 1, WHITE);
    await lcd.fillRect(0, h - 1, w, 1, WHITE);
    await lcd.fillRect(0, 0, 1, h, WHITE);
    await lcd.fillRect(w - 1, 0, 1, h, WHITE);
    for (const [y, c] of [[20, RED], [70, GREEN], [120, BLUE]]) await lcd.fillRect(w / 2 - 10, y, 20, 20, c);
  });
});
