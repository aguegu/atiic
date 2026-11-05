// the ST7735S on a bench: r8845's 0.96" 80x160 IPS module on the CH341A's
// SPI (BENCH_ST7735 gives its lines). Its MISO isn't wired, so nothing reads
// back: these show the commands go through and how fast; what the panel
// shows is for the eye. Left showing: black, a white border, red, green and
// blue squares (left to right held landscape)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { St7735s } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { ST7735 } from './bench.js';

const FULL_FILL_MS = 500; // a full screen at 16 bits, 25,600 bytes: 235 ms seen on r8845
// the other pixel formats' full screens, 19,200 and 38,400 bytes: 174 and
// 341 ms seen on r8845
const FORMAT_FILL_MS = { 12: 400, 18: 700 };
// a strip chart's step on the controller's scrolling: one 80-pixel row and
// the start line moved. 4.2 ms seen on r8845 (16 bits)
const SCROLL_STEP_MS = 10;
const SCROLL_STEPS = 320; // two screens: past the wrap twice
const RED = 0xff0000, GREEN = 0x00ff00, BLUE = 0x0000ff, WHITE = 0xffffff, BLACK = 0x000000;

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

  for (const bits of [12, 18]) {
    it(`${bits} bits a pixel: inits, fills the screen in under ${FORMAT_FILL_MS[bits]} ms`, async () => {
      const other = new St7735s(bus, { ...ST7735, bits });
      await other.init();
      const t0 = performance.now();
      await other.fill(BLUE);
      const ms = performance.now() - t0;
      assert.ok(ms < FORMAT_FILL_MS[bits], `${ms.toFixed(0)} ms`);
    });
  }

  it(`scrolls: a strip chart's step in under ${SCROLL_STEP_MS} ms`, async () => {
    await lcd.init(); // back from the other formats
    await lcd.fill(BLACK);
    await lcd.scrollArea();
    const t0 = performance.now();
    for (let n = 0; n < SCROLL_STEPS; n++) {
      const row = new Array(lcd.width).fill(BLACK);
      row[Math.round(40 + 36 * Math.sin(n / 15))] = RED;
      await lcd.draw(0, lcd.scrollRow(n), lcd.width, 1, row);
      await lcd.scroll(n + 1);
    }
    const ms = (performance.now() - t0) / SCROLL_STEPS;
    await lcd.scrollOff();
    assert.ok(ms < SCROLL_STEP_MS, `${ms.toFixed(2)} ms a step`);
  });

  it('leaves its test pattern (16 bits): a white border on black, red, green, blue', async () => {
    await lcd.init(); // back from the other formats
    const { width: w, height: h } = lcd;
    await lcd.fill(BLACK);
    await lcd.fillRect(0, 0, w, 1, WHITE);
    await lcd.fillRect(0, h - 1, w, 1, WHITE);
    await lcd.fillRect(0, 0, 1, h, WHITE);
    await lcd.fillRect(w - 1, 0, 1, h, WHITE);
    for (const [y, c] of [[20, RED], [70, GREEN], [120, BLUE]]) await lcd.fillRect(w / 2 - 10, y, 20, 20, c);
  });
});
