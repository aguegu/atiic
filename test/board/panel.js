// a DcsPanel display's board tests (st7735s.test.js, gc9107.test.js): on
// r8845, a module on the CH341A's SPI. Its MISO isn't wired, so nothing reads
// back: these show the commands go through and how fast; what the panel
// shows is for the eye. Left showing: black, a white border, red, green and
// blue squares (left to right held landscape)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openCh341 } from '../../src/adapters/ch341/node.js';

// a full screen's bytes at the CH341's measured ~110 KB/s, twice over
// (r8845: the ST7735S's 25,600 bytes in 227-235 ms)
const BYTES_PER_MS = 110;
const fillMs = (bytes) => Math.round((2 * bytes) / BYTES_PER_MS);
const BYTES_PER_PIXEL = { 12: 1.5, 16: 2, 18: 3 };
// a strip chart's step on the controller's scrolling: one row and the start
// line moved. 4.2 ms seen on r8845 (the ST7735S, 16 bits)
const SCROLL_STEP_MS = 10;
const RED = 0xff0000, GREEN = 0x00ff00, BLUE = 0x0000ff, WHITE = 0xffffff, BLACK = 0x000000;

export function panelTests(Panel, lines, setting) {
  const { name } = Panel.chip;
  describe(`${name} (board)`, { skip: lines ? false : `no ${setting}: no ${name} on the bench` }, () => {
    let bus, lcd;
    before(async () => {
      bus = await openCh341();
      lcd = new Panel(bus, lines);
    });

    after(async () => {
      await bus?.close();
    });

    it('inits', async () => {
      await lcd.init();
    });

    for (const bits of [16, 12, 18]) {
      it(`${bits} bits a pixel: fills the screen at ~110 KB/s`, async () => {
        const panel = bits === 16 ? lcd : new Panel(bus, { ...lines, bits });
        if (bits !== 16) await panel.init();
        const limit = fillMs(panel.width * panel.height * BYTES_PER_PIXEL[bits]);
        for (const c of [RED, GREEN, BLUE]) {
          const t0 = performance.now();
          await panel.fill(c);
          const ms = performance.now() - t0;
          assert.ok(ms < limit, `${ms.toFixed(0)} ms, over ${limit}`);
        }
      });
    }

    it(`scrolls: a strip chart's step in under ${SCROLL_STEP_MS} ms`, async () => {
      await lcd.init(); // back from the other formats
      await lcd.fill(BLACK);
      await lcd.scrollArea();
      const steps = 2 * lcd.height; // past the wrap twice
      const mid = lcd.width / 2;
      const t0 = performance.now();
      for (let n = 0; n < steps; n++) {
        const row = new Array(lcd.width).fill(BLACK);
        row[Math.round(mid + (mid - 4) * Math.sin(n / 15))] = RED;
        await lcd.draw(0, lcd.scrollRow(n), lcd.width, 1, row);
        await lcd.scroll(n + 1);
      }
      const ms = (performance.now() - t0) / steps;
      await lcd.scrollOff();
      assert.ok(ms < SCROLL_STEP_MS, `${ms.toFixed(2)} ms a step`);
    });

    it('leaves its test pattern (16 bits): a white border on black, red, green, blue', async () => {
      const { width: w, height: h } = lcd;
      await lcd.fill(BLACK);
      await lcd.fillRect(0, 0, w, 1, WHITE);
      await lcd.fillRect(0, h - 1, w, 1, WHITE);
      await lcd.fillRect(0, 0, 1, h, WHITE);
      await lcd.fillRect(w - 1, 0, 1, h, WHITE);
      for (const [y, c] of [[20, RED], [70, GREEN], [120, BLUE]]) await lcd.fillRect(w / 2 - 10, y, 20, 20, c);
    });
  });
}
