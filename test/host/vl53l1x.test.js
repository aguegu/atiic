// the VL53L1X driver against a fake sensor: 16-bit register addresses, the
// ULD's init sequence, data ready and a reading
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vl53l1x } from '../../src/index.js';

class FakeTof {
  constructor() {
    this.regs = new Map([[0x010f, 0xea], [0x0110, 0xcc], [0x00e5, 0x03], [0x0030, 0x01], [0x0031, 0x02], [0x0089, 0x09], [0x0096, 0x07], [0x0097, 0xae], [0x008c, 0x0c], [0x008d, 0x80], [0x0090, 0x00], [0x0091, 0x40], [0x0098, 0x02], [0x0099, 0x00]]);
    this.writes = [];
  }
  async write(address, [hi, lo, ...data]) {
    const reg = (hi << 8) | lo;
    this.writes.push([reg, data.length > 2 ? data.length : data]);
    data.forEach((v, i) => this.regs.set(reg + i, v));
    if (reg === 0x0087 && data[0] === 0x40) this.regs.set(0x0031, 0x03); // ranging: data ready (bit 0 at polarity 1)
    if (reg === 0x0086) this.regs.set(0x0031, 0x02);
  }
  async writeRead(address, [hi, lo], n) {
    const reg = (hi << 8) | lo;
    if (reg === 0x0031) { const v = this.regs.get(0x0031); this.regs.set(0x0031, 0x03); return Uint8Array.of(v); } // ready again by the next poll
    return Uint8Array.from({ length: n }, (_, i) => this.regs.get(reg + i) ?? 0);
  }
}

describe('vl53l1x (host)', () => {
  it('init: the ULD\'s sequence, the 91-byte configuration at 0x2D, ranging at the end', async () => {
    const tof = new FakeTof();
    await new Vl53l1x(tof).init();
    assert.deepEqual(tof.writes, [
      [0x002d, 91], // the default configuration
      [0x0086, [1]], [0x0087, [0x40]], // start
      [0x0086, [1]], [0x0087, [0x00]], // the first ranging cleared, stopped
      [0x0008, [0x09]], [0x000b, [0x00]], // VHV
      [0x0086, [1]], [0x0087, [0x40]], // ranging
    ]);
  });

  it('measure: data ready, the range status mapped (9 -> 0 valid), mm high byte first, the rates and SPADs as the ULD scales them, the interrupt cleared', async () => {
    const tof = new FakeTof();
    const s = new Vl53l1x(tof);
    await s.init();
    tof.writes.length = 0;
    // signal 0x0200 (9.7: 4 Mcps), ambient 0x0040 (0.5 Mcps), SPADs 0x0c80 (8.8: 12.5)
    assert.deepEqual(await s.measure(), { distance: 1966, status: 0, signal: 4000, ambient: 500, spads: 12 });
    assert.deepEqual(tof.writes, [[0x0086, [1]]]);
  });

  it('an unknown device status maps to 255', async () => {
    const tof = new FakeTof();
    const s = new Vl53l1x(tof);
    await s.init();
    tof.regs.set(0x0089, 0x1f);
    assert.equal((await s.measure()).status, 255);
  });

  it('configure: the ULD\'s mode and budget registers, the period in oscillator clocks, ranging again', async () => {
    const tof = new FakeTof();
    const s = new Vl53l1x(tof);
    await s.init();
    tof.regs.set(0x00de, 0x04).set(0x00df, 0x26); // 0x426: bits 9:0 0x026, 38 clocks a ms
    tof.writes.length = 0;
    await s.configure({ mode: 'short', budget: 20, period: 50 });
    assert.deepEqual(tof.writes, [
      [0x0087, [0x00]], // stopped
      [0x004b, [0x14]], [0x0060, [0x07]], [0x0063, [0x05]], [0x0069, [0x38]],
      [0x0078, [0x07, 0x05]], [0x007a, [0x06, 0x06]], // short
      [0x005e, [0x00, 0x51]], [0x0061, [0x00, 0x6e]], // 20 ms
      [0x006c, 4], // 38 * 50 * 1.075 = 2042
      [0x0086, [1]], [0x0087, [0x40]], // ranging
    ]);
    assert.deepEqual([0x6c, 0x6d, 0x6e, 0x6f].map((r) => tof.regs.get(r)), [0, 0, 0x07, 0xfa]);
    assert.equal((await s.measure()).distance, 1966);
  });

  it('configure refuses what the ULD has no values for', async () => {
    const s = new Vl53l1x(new FakeTof());
    await assert.rejects(s.configure({ mode: 'medium' }), /no distance mode medium: short, long/);
    await assert.rejects(s.configure({ mode: 'long', budget: 15 }), /no 15 ms budget in long mode: 20, 33, 50, 100, 200, 500/);
    await assert.rejects(s.configure({ budget: 50, period: 20 }), /a 20 ms period under the 50 ms budget/);
  });

  it('spadAt: ST\'s table (SparkFun_VL53L1X.h), its corners and centre', () => {
    assert.equal(Vl53l1x.spadAt(0, 0), 128);
    assert.equal(Vl53l1x.spadAt(7, 8), 199);
    assert.equal(Vl53l1x.spadAt(8, 0), 127);
    assert.equal(Vl53l1x.spadAt(9, 7), 70);
    assert.equal(Vl53l1x.spadAt(15, 15), 0);
    assert.equal(Vl53l1x.spadAt(0, 15), 248);
    assert.throws(() => Vl53l1x.spadAt(16, 0), /no SPAD at row 16/);
  });

  it('roi: the size as the ULD packs it, the centre 199 by default and when wider than 10', async () => {
    const tof = new FakeTof();
    const s = new Vl53l1x(tof);
    await s.roi({ width: 4, height: 6 });
    await s.roi({ width: 8, height: 8, centre: 0xa0 });
    await s.roi({ centre: 0xa0 });
    assert.deepEqual(tof.writes, [
      [0x007f, [199]], [0x0080, [0x53]],
      [0x007f, [0xa0]], [0x0080, [0x77]],
      [0x007f, [199]], [0x0080, [0xff]],
    ]);
    await assert.rejects(s.roi({ width: 3 }), /ROI width 3: 4-16/);
    await assert.rejects(s.roi({ height: 17 }), /ROI height 17: 4-16/);
  });

  it('init refuses another sensor (model ID, module type)', async () => {
    const tof = new FakeTof();
    tof.regs.set(0x0110, 0xaa);
    await assert.rejects(new Vl53l1x(tof).init(), /not a VL53L1X/);
  });
});
