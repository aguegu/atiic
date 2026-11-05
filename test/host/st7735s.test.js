// the ST7735S driver against a fake bus: every line change and SPI byte in order
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { St7735s } from '../../src/index.js';
import { encodePixels } from '../../src/devices/st7735s.js';

class FakeBus {
  constructor() { this.log = []; }
  async pins(lines) { this.log.push(['pins', { ...lines }]); }
  async spi(bytes) { this.log.push(['spi', Array.from(bytes)]); return new Uint8Array(bytes.length); }
}

// the log's commands: { c, data } for each CS-low .. CS-high
function commands(log) {
  const out = [];
  let cur = null, dc = null;
  for (const [kind, v] of log) {
    if (kind === 'pins') {
      if (v.D2 === false) cur = { c: null, data: [] };
      if ('D1' in v) dc = v.D1;
      if (v.D2 === true && cur) { out.push(cur); cur = null; }
    } else if (cur) {
      if (dc === false) cur.c = v[0];
      else cur.data.push(...v);
    }
  }
  return out;
}

describe('st7735s (host)', () => {
  it('init: a hardware reset on RES, then the commands, DC low for each command', async () => {
    const bus = new FakeBus();
    const lcd = new St7735s(bus);
    const t0 = Date.now();
    await lcd.init();
    assert.ok(Date.now() - t0 >= 20 + 150 + 150 + 150 + 50, 'its waits');
    assert.deepEqual(bus.log.slice(0, 3).map((e) => e[1]), [{ D2: true, D1: true, D0: true }, { D0: false }, { D0: true }]);
    assert.deepEqual(commands(bus.log), [
      { c: 0x01, data: [] }, // SWRESET
      { c: 0x11, data: [] }, // SLPOUT
      { c: 0x3a, data: [0x05] }, // COLMOD: 16 bits
      { c: 0x36, data: [0x08] }, // MADCTL: BGR
      { c: 0x20, data: [] }, // INVOFF
      { c: 0x13, data: [] }, // NORON
      { c: 0x29, data: [] }, // DISPON
    ]);
  });

  it('a rectangle: the window at the panel\'s offset (24, 0), then the pixels high byte first', async () => {
    const bus = new FakeBus();
    const lcd = new St7735s(bus);
    await lcd.fillRect(2, 3, 2, 1, 0xff0000);
    assert.deepEqual(commands(bus.log), [
      { c: 0x2a, data: [0, 26, 0, 27] }, // CASET: x 2-3 at column 24
      { c: 0x2b, data: [0, 3, 0, 3] }, // RASET: y 3
      { c: 0x2c, data: [0xf8, 0x00, 0xf8, 0x00] }, // RAMWR: red, red
    ]);
  });

  it('the pixel formats: COLMOD at init', async () => {
    for (const [bits, colmod] of [[12, 0x03], [16, 0x05], [18, 0x06]]) {
      const bus = new FakeBus();
      await new St7735s(bus, { bits }).init();
      assert.deepEqual(commands(bus.log)[2], { c: 0x3a, data: [colmod] }, `${bits} bits`);
    }
    assert.throws(() => new St7735s(new FakeBus(), { bits: 24 }), /12, 16 or 18/);
  });

  // the 4-line serial layouts, datasheet 9.8.20-22
  it('16 bits: RGB 5-6-5, high byte first', () => {
    assert.deepEqual([...encodePixels([0xff0000, 0x00ff00, 0x0000ff, 0x123456])],
      [0xf8, 0x00, 0x07, 0xe0, 0x00, 0x1f, 0x11, 0xaa]);
  });

  it('18 bits: a byte a colour, its top six bits', () => {
    assert.deepEqual([...encodePixels([0xff0000, 0x123456], 18)], [0xfc, 0x00, 0x00, 0x10, 0x34, 0x54]);
  });

  it('12 bits: two pixels in three bytes, R1G1 B1R2 G2B2', () => {
    assert.deepEqual([...encodePixels([0x123456, 0xabcdef], 12)], [0x13, 0x5a, 0xce]);
  });

  it('12 bits: an odd count\'s last pixel padded with a zero nibble', () => {
    assert.deepEqual([...encodePixels([0x123456, 0xabcdef, 0xff8800], 12)], [0x13, 0x5a, 0xce, 0xf8, 0x00]);
  });

  it('a 12-bit rectangle sends its bytes in the format', async () => {
    const bus = new FakeBus();
    await new St7735s(bus, { bits: 12 }).fillRect(0, 0, 3, 1, 0xffffff);
    assert.deepEqual(commands(bus.log)[2], { c: 0x2c, data: [0xff, 0xff, 0xff, 0xff, 0xf0] });
  });
});
