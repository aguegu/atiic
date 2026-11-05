// the VL53L1X driver against a fake sensor: 16-bit register addresses, the
// ULD's init sequence, data ready and a reading
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vl53l1x } from '../../src/index.js';

class FakeTof {
  constructor() {
    this.regs = new Map([[0x010f, 0xea], [0x0110, 0xcc], [0x00e5, 0x03], [0x0030, 0x01], [0x0031, 0x02], [0x0089, 0x09], [0x0096, 0x07], [0x0097, 0xae]]);
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

  it('measure: data ready, the range status mapped (9 -> 0 valid), mm high byte first, the interrupt cleared', async () => {
    const tof = new FakeTof();
    const s = new Vl53l1x(tof);
    await s.init();
    tof.writes.length = 0;
    assert.deepEqual(await s.measure(), { distance: 1966, status: 0 });
    assert.deepEqual(tof.writes, [[0x0086, [1]]]);
  });

  it('an unknown device status maps to 255', async () => {
    const tof = new FakeTof();
    const s = new Vl53l1x(tof);
    await s.init();
    tof.regs.set(0x0089, 0x1f);
    assert.equal((await s.measure()).status, 255);
  });

  it('init refuses another sensor (model ID, module type)', async () => {
    const tof = new FakeTof();
    tof.regs.set(0x0110, 0xaa);
    await assert.rejects(new Vl53l1x(tof).init(), /not a VL53L1X/);
  });
});
