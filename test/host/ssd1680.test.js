// the SSD1680 driver against a fake bus: lines, SPI bytes, and BUSY as the
// test sets it
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ssd1680 } from '../../src/index.js';
import { blankFrame, plot } from '../../src/devices/ssd1680.js';

class FakeBus {
  constructor(busyReads = []) { this.log = []; this.busyReads = busyReads; }
  async pins(lines) { this.log.push(['pins', { ...lines }]); }
  async spi(bytes) { this.log.push(['spi', Array.from(bytes)]); return new Uint8Array(bytes.length); }
  async readPins() { this.log.push(['read']); return { D4: this.busyReads.shift() ?? false }; }
}

// { c, data } for each CS-low .. CS-high (CS D2, DC D1)
function commands(log) {
  const out = [];
  let cur = null, dc = null;
  for (const [kind, v] of log) {
    if (kind === 'pins') {
      if (v.D2 === false) cur = { c: null, data: [] };
      if ('D1' in v) dc = v.D1;
      if (v.D2 === true && cur) { out.push(cur); cur = null; }
    } else if (kind === 'spi' && cur) {
      if (dc === false) cur.c = v[0];
      else cur.data.push(...v);
    }
  }
  return out;
}

describe('ssd1680 (host)', () => {
  it('init: reset, BUSY waited, SWRESET, the datasheet\'s set-up for 152x152', async () => {
    const bus = new FakeBus([true, false]); // busy once after the reset
    await new Ssd1680(bus).init();
    assert.deepEqual(bus.log.slice(0, 3).map((e) => e[1]), [{ D2: true, D1: true, D0: true }, { D0: false }, { D0: true }]);
    assert.equal(bus.log.filter((e) => e[0] === 'read').length, 3, 'BUSY read till low after the reset, once after SWRESET');
    assert.deepEqual(commands(bus.log), [
      { c: 0x12, data: [] }, // SWRESET
      { c: 0x01, data: [151, 0, 0] }, // 152 gates
      { c: 0x11, data: [0x03] }, // X then Y increasing
      { c: 0x44, data: [0, 18] }, // RAM X: 19 bytes
      { c: 0x45, data: [0, 0, 151, 0] }, // RAM Y: 152 rows
      { c: 0x3c, data: [0x05] }, // border
      { c: 0x18, data: [0x80] }, // internal temperature sensor
    ]);
  });

  it('show: the frame into both RAMs, a full update (F7h), BUSY waited', async () => {
    const bus = new FakeBus([true, true, false]);
    const frame = blankFrame(152, 152);
    plot(frame, 152, 0, 0);
    await new Ssd1680(bus).show(frame);
    const cs = commands(bus.log);
    assert.deepEqual(cs.map((c) => c.c), [0x4e, 0x4f, 0x24, 0x4e, 0x4f, 0x26, 0x22, 0x20]);
    assert.equal(cs[2].data.length, 2888);
    assert.equal(cs[2].data[0], 0x7f); // the top-left pixel black, the MSB
    assert.deepEqual(cs[5].data, cs[2].data); // the previous image for mode 2
    assert.deepEqual(cs[6].data, [0xf7]);
    assert.equal(bus.log.filter((e) => e[0] === 'read').length, 3);
  });

  it('showPartial: the new frame into 24h, mode 2 (FFh), BUSY waited, then the frame into 26h', async () => {
    const bus = new FakeBus();
    const epd = new Ssd1680(bus);
    await epd.show(blankFrame(152, 152));
    bus.log.length = 0;
    bus.busyReads = [true, false];
    const frame = blankFrame(152, 152);
    plot(frame, 152, 8, 0);
    await epd.showPartial(frame);
    const cs = commands(bus.log);
    assert.deepEqual(cs.map((c) => c.c), [0x4e, 0x4f, 0x24, 0x22, 0x20, 0x4e, 0x4f, 0x26]);
    assert.deepEqual(cs[3].data, [0xff]);
    assert.equal(cs[2].data[1], 0x7f);
    assert.deepEqual(cs[7].data, cs[2].data);
    const reads = bus.log.findIndex((e) => e[0] === 'read'), ramPrevious = bus.log.findLastIndex((e) => e[0] === 'spi' && e[1][0] === 0x26);
    assert.ok(reads < ramPrevious, '26h written after the update');
  });

  it('showPartial with nothing shown since init: a full update', async () => {
    const bus = new FakeBus();
    await new Ssd1680(bus).showPartial(blankFrame(152, 152));
    assert.deepEqual(commands(bus.log).find((c) => c.c === 0x22).data, [0xf7]);
  });

  it('frames: a bit a pixel, 1 white, the leftmost pixel the MSB', () => {
    const f = blankFrame(10, 2); // 2 bytes a row
    assert.equal(f.length, 4);
    plot(f, 10, 9, 1);
    assert.deepEqual([...f], [0xff, 0xff, 0xff, 0xbf]);
    plot(f, 10, 9, 1, false);
    assert.deepEqual([...f], [0xff, 0xff, 0xff, 0xff]);
  });

  it('sleep: deep sleep 1, the RAM kept', async () => {
    const bus = new FakeBus();
    await new Ssd1680(bus).sleep();
    assert.deepEqual(commands(bus.log), [{ c: 0x10, data: [0x01] }]);
  });
});
