// the SSD1680 on a bench: r8845's 1.54" 152x152 black/white e-paper module
// on the CH341A's SPI, BUSY on D4 (BENCH_SSD1680). BUSY is the one thing it
// says back: these show it goes high for an update, and for how long; what
// the panel shows is for the eye, and it labels itself. Left showing: a
// 2-pixel border, a 24x24 square at the top-left, a checkerboard in the
// middle, a 4x4 dot at the bottom-right, the full update's ms below it, and
// under that the partial update's, added by a partial update
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Ssd1680 } from '../../src/index.js';
import { blankFrame, plot } from '../../src/devices/ssd1680.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { SSD1680 } from './bench.js';
import { label } from './font.js';

// a full update keeps BUSY high: 2.1 s seen on r8845; under it, no update ran
const UPDATE_MIN_MS = 1000;
const UPDATE_MAX_MS = 5000;
// a partial update (display mode 2): 588-594 ms seen on r8845
const PARTIAL_MIN_MS = 300;
const PARTIAL_MAX_MS = 1500;
const PARTIAL_STEPS = 4;
const LABEL_ROWS = 16;

describe('SSD1680 (board)', { skip: SSD1680 ? false : 'no BENCH_SSD1680: no SSD1680 on the bench' }, () => {
  let bus, epd, firstMs, partialMs;
  before(async () => {
    bus = await openCh341();
    epd = new Ssd1680(bus, SSD1680);
  });

  after(async () => {
    await epd?.sleep();
    await bus?.close();
  });

  it('inits: BUSY low after the resets', async () => {
    await epd.init();
    assert.equal((await bus.readPins())[epd.busy], false);
  });

  it(`a full update: BUSY high ${UPDATE_MIN_MS}-${UPDATE_MAX_MS} ms`, async () => {
    firstMs = await epd.show(blankFrame(epd.width, epd.height));
    assert.ok(firstMs > UPDATE_MIN_MS && firstMs < UPDATE_MAX_MS, `${firstMs} ms`);
  });

  it(`partial updates: a square moved ${PARTIAL_STEPS} times, BUSY high ${PARTIAL_MIN_MS}-${PARTIAL_MAX_MS} ms each`, async () => {
    const { width: w, height: h } = epd;
    for (let n = 0; n < PARTIAL_STEPS; n++) {
      const f = blankFrame(w, h);
      for (let y = 64; y < 88; y++) for (let x = 8 + n * 32; x < 32 + n * 32; x++) plot(f, w, x, y);
      partialMs = await epd.showPartial(f);
      assert.ok(partialMs > PARTIAL_MIN_MS && partialMs < PARTIAL_MAX_MS, `step ${n}: ${partialMs} ms`);
    }
  });

  it('leaves its card, labelled with a full and a partial update\'s ms', async () => {
    const { width: w, height: h } = epd;
    const f = blankFrame(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const border = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      const square = x >= 8 && x < 32 && y >= 8 && y < 32;
      const dot = x >= w - 12 && x < w - 8 && y >= h - 12 && y < h - 8;
      const checker = x >= w / 2 - 20 && x < w / 2 + 20 && y >= h / 2 - 28 && y < h / 2 + 12 && (((x >> 2) + (y >> 2)) & 1);
      if (border || square || dot || checker) plot(f, w, x, y);
    }
    const cols = w - 40;
    const write = (text, y) => label(text, cols, LABEL_ROWS, { upright: true })
      .forEach((c, i) => { if (c) plot(f, w, 20 + (i % cols), y + Math.floor(i / cols)); });
    write(String(firstMs), h / 2 + 18);
    const ms = await epd.show(f);
    assert.ok(ms > UPDATE_MIN_MS && ms < UPDATE_MAX_MS, `${ms} ms`);
    write(String(partialMs), h / 2 + 36); // added by a partial update
    const pms = await epd.showPartial(f);
    assert.ok(pms > PARTIAL_MIN_MS && pms < PARTIAL_MAX_MS, `${pms} ms`);
  });
});
