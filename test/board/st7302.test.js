// the ST7302 on a bench: r8845's 2.13" 122x250 reflective mono TFT on the
// CH341A's SPI (BENCH_ST7302), held upright. Nothing comes back from it (no
// MISO, no BUSY): these show the frames go through and how fast; what the
// panel shows is for the eye, and it labels itself. Left showing: a frame 3
// pixels in, a 3-pixel diagonal from each of its corners to the panel's, a
// square at the top-left, 122 near the top and 250 near the bottom, a
// checkerboard, a dot at the bottom-right
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { St7302 } from '../../src/index.js';
import { blankFrame, plot } from '../../src/devices/frame.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { ST7302 } from './bench.js';
import { label } from './font.js';

// a whole frame: 4,125 bytes, 38-39 ms over the CH341 on r8845, and the
// packing in JavaScript
const FRAME_MS = 150;
const FRAMES = 20;

describe('ST7302 (board)', { skip: ST7302 ? false : 'no BENCH_ST7302: no ST7302 on the bench' }, () => {
  let bus, lcd;
  before(async () => {
    bus = await openCh341();
    lcd = new St7302(bus, ST7302);
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await lcd.init();
  });

  it(`${FRAMES} frames, a square moving down, each in under ${FRAME_MS} ms`, async () => {
    const { width: w, height: h } = lcd;
    let worst = 0;
    for (let n = 0; n < FRAMES; n++) {
      const f = blankFrame(w, h);
      const y0 = Math.round((n * (h - 24)) / (FRAMES - 1));
      for (let y = y0; y < y0 + 24; y++) for (let x = w / 2 - 12; x < w / 2 + 12; x++) plot(f, w, x, y);
      const t0 = performance.now();
      await lcd.show(f);
      worst = Math.max(worst, performance.now() - t0);
    }
    assert.ok(worst < FRAME_MS, `${worst.toFixed(0)} ms`);
  });

  it('leaves its card: a frame 3 in, the corner diagonals, labels 122 and 250', async () => {
    const { width: w, height: h } = lcd;
    const f = blankFrame(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const frame = (x === 3 || x === w - 4) && y >= 3 && y <= h - 4 || (y === 3 || y === h - 4) && x >= 3 && x <= w - 4;
      const corner = (a, b) => a === b && a < 3;
      const diagonal = corner(x, y) || corner(w - 1 - x, y) || corner(x, h - 1 - y) || corner(w - 1 - x, h - 1 - y);
      const square = x >= 8 && x < 28 && y >= 8 && y < 28;
      const dot = x >= w - 12 && x < w - 8 && y >= h - 12 && y < h - 8;
      const checker = x >= w / 2 - 20 && x < w / 2 + 20 && y >= 105 && y < 145 && (((x >> 2) + (y >> 2)) & 1);
      if (frame || diagonal || square || dot || checker) plot(f, w, x, y);
    }
    const cols = w - 20;
    for (const [text, y0] of [[String(w), 40], [String(h), h - 50]]) {
      label(text, cols, 16, { upright: true }).forEach((c, i) => { if (c) plot(f, w, 10 + (i % cols), y0 + Math.floor(i / cols)); });
    }
    await lcd.show(f);
  });
});
