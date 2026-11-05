// the ST7302 driver against a fake bus: its set-up, and frames packed as its
// RAM takes them
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { St7302 } from '../../src/index.js';
import { packFrame } from '../../src/devices/st7302.js';
import { blankFrame, plot } from '../../src/devices/frame.js';

class FakeBus {
  constructor() { this.log = []; }
  async pins(lines) { this.log.push(['pins', { ...lines }]); }
  async spi(bytes) { this.log.push(['spi', Array.from(bytes)]); return new Uint8Array(bytes.length); }
}

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

describe('st7302 (host)', () => {
  it('init: zhcong\'s set-up, sleep out after the power commands, ending in low power mode', async () => {
    const bus = new FakeBus();
    await new St7302(bus).init();
    const cs = commands(bus.log).map((c) => c.c);
    assert.deepEqual(cs.slice(0, 2), [0x38, 0xeb]);
    assert.equal(cs.indexOf(0x11), 9, 'SLPOUT after the 9 power commands');
    assert.deepEqual(cs.slice(-6), [0x29, 0xb9, 0xb9, 0x72, 0xb2, 0x39]); // display on, clear RAM on, off, destress off, rate, LPM
    assert.deepEqual(commands(bus.log).at(-2).data, [0x01, 0x04]); // LPM at 4 Hz
  });

  it('a 122x250 frame packs to 11 bands x 125 pairs x 3 bytes, all white = all 0', () => {
    const packed = packFrame(blankFrame(122, 250), 122, 250);
    assert.equal(packed.length, 11 * 125 * 3);
    assert.ok(packed.every((b) => b === 0));
  });

  it('packing: upright (0, 0) is landscape (0, 121): band 10, pair 0, its first byte, line 1, the even pixel', () => {
    const f = blankFrame(122, 250);
    plot(f, 122, 0, 0);
    const packed = packFrame(f, 122, 250);
    const i = (10 * 125 + 0) * 3 + 0;
    assert.equal(packed[i], 0x20);
    assert.equal(packed.filter((b) => b).length, 1);
  });

  it('packing: upright (121, 1) is landscape (1, 0): band 0, pair 0, line 0, the odd pixel', () => {
    const f = blankFrame(122, 250);
    plot(f, 122, 121, 1);
    assert.equal(packFrame(f, 122, 250)[0], 0x40);
  });

  it('show: the window (bands 0x19-0x23, pairs 0-124), then the packed frame', async () => {
    const bus = new FakeBus();
    await new St7302(bus).show(blankFrame(122, 250));
    assert.deepEqual(commands(bus.log).map((c) => [c.c, c.data.length]), [[0x2a, 2], [0x2b, 2], [0x2c, 4125]]);
    assert.deepEqual(commands(bus.log)[0].data, [0x19, 0x23]);
    assert.deepEqual(commands(bus.log)[1].data, [0, 124]);
  });

  it('frameRate: the mode follows the rate, the other mode\'s rate kept', async () => {
    const bus = new FakeBus();
    const lcd = new St7302(bus);
    await lcd.init();
    bus.log.length = 0;
    await lcd.frameRate(16);
    await lcd.frameRate(1);
    assert.deepEqual(commands(bus.log), [
      { c: 0xb2, data: [0x00, 0x04] }, { c: 0x38, data: [] }, // HPM 16 Hz, LPM still 4 Hz
      { c: 0xb2, data: [0x00, 0x02] }, { c: 0x39, data: [] }, // LPM 1 Hz, HPM still 16 Hz
    ]);
    await assert.rejects(lcd.frameRate(10), /16 or 32/);
  });
});
