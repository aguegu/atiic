// a DcsPanel display's board tests (st7735s.test.js, gc9107.test.js): on
// r8845, a module on the CH341A's SPI. Its MISO isn't wired, so nothing reads
// back: these show the commands go through and how fast; what the panel
// shows is for the eye, and the screen labels itself. Left showing, held
// landscape: a white border; inside, thirds labelled 12, 16, 18, each its
// pixel format's ramps (red, green, blue, grey bands bottom to top, black to
// full left to right): steps in 12, finer in 16, smooth in 18. A round
// module (r8845's GC9A01): rings at the edge (white, red, green, blue, 3
// pixels each) for the border, the thirds upright side by side in the
// circle's square, ramps black at the top to full at the bottom
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { label } from './font.js';

// a full screen's bytes at the CH341's measured ~110 KB/s, twice over
// (r8845: the ST7735S's 25,600 bytes in 227-235 ms)
const BYTES_PER_MS = 110;
const fillMs = (bytes) => Math.round((2 * bytes) / BYTES_PER_MS);
const BYTES_PER_PIXEL = { 12: 1.5, 16: 2, 18: 3 };
// a strip chart's step on the controller's scrolling: one row and the start
// line moved, the commands' round trips (~4 ms seen on r8845: the ST7735S's
// 160-byte row in 4.2 ms) and the row's bytes
const SCROLL_COMMANDS_MS = 6;
const LABEL_COLS = 16; // a 2x label's strip
const RED = 0xff0000, GREEN = 0x00ff00, BLUE = 0x0000ff, WHITE = 0xffffff, BLACK = 0x000000;

export function panelTests(Panel, lines, setting, { round = false } = {}) {
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

    it('scrolls: a strip chart, a row a step', async () => {
      const stepMs = SCROLL_COMMANDS_MS + fillMs(lcd.width * 2);
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
      assert.ok(ms < stepMs, `${ms.toFixed(2)} ms a step, over ${stepMs}`);
    });

    it(`${round ? 'rings at the edge' : 'a white border'} on black, red, green, blue squares`, async () => {
      const { width: w, height: h } = lcd;
      if (round) {
        const px = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const k = Math.floor(((w - 1) / 2 - Math.hypot(x - (w - 1) / 2, y - (h - 1) / 2)) / 3);
          px.push(k < 0 ? BLACK : [WHITE, RED, GREEN, BLUE][k] ?? BLACK);
        }
        await lcd.draw(0, 0, w, h, px);
        for (const [x, c] of [[w / 4, RED], [w / 2, GREEN], [(3 * w) / 4, BLUE]]) await lcd.fillRect(x - 10, h / 2 - 10, 20, 20, c);
        return;
      }
      await lcd.fill(BLACK);
      await lcd.fillRect(0, 0, w, 1, WHITE);
      await lcd.fillRect(0, h - 1, w, 1, WHITE);
      await lcd.fillRect(0, 0, 1, h, WHITE);
      await lcd.fillRect(w - 1, 0, 1, h, WHITE);
      for (const [y, c] of [[20, RED], [70, GREEN], [120, BLUE]]) await lcd.fillRect(w / 2 - 10, y, 20, 20, c);
    });

    it('leaves its card: thirds in 12, 16, 18 bits, labelled', async () => {
      const { width: w, height: h } = lcd;
      const ramp = (along, across) => { // black to full along, four bands across
        const px = [], band = Math.floor(across / 4);
        for (let a = 0; a < along; a++) for (let b = 0; b < across; b++) {
          const v = Math.round((a * 255) / (along - 1));
          px.push([v << 16, v << 8, v, (v << 16) | (v << 8) | v][Math.min(3, Math.floor(b / band))]);
        }
        return px;
      };
      if (round) { // upright in the circle's square, inside the rings
        const side = Math.floor(w / Math.SQRT2) & ~1, x0 = (w - side) / 2, y0 = (h - side) / 2;
        const third = Math.floor(side / 3), rows = side - LABEL_COLS;
        const ramps = ramp(rows, third);
        for (const [i, bits] of [12, 16, 18].entries()) {
          const x = x0 + i * third;
          await lcd.format(16);
          await lcd.draw(x, y0, third, LABEL_COLS, label(String(bits), third, LABEL_COLS, { upright: true }));
          await lcd.format(bits);
          await lcd.draw(x, y0 + LABEL_COLS, third, rows, ramps);
        }
        await lcd.format(16);
        return;
      }
      const part = Math.floor((h - 2) / 3), cols = w - 2 - LABEL_COLS;
      const ramps = ramp(part, cols);
      for (const [i, bits] of [12, 16, 18].entries()) {
        const y = 1 + i * part;
        await lcd.format(bits);
        await lcd.draw(1, y, cols, part, ramps);
        await lcd.format(16);
        await lcd.draw(1 + cols, y, LABEL_COLS, part, label(String(bits), LABEL_COLS, part));
      }
    });
  });
}
