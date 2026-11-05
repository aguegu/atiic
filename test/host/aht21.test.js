// the AHT21B driver against a fake sensor: the status, a measurement, CRC
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Aht21 } from '../../src/index.js';
import { crc8 } from '../../src/devices/aht21.js';

class FakeAht {
  constructor(frame, status = 0x18) { this.frame = frame; this.st = status; this.log = []; this.busy = 0; }
  async write(address, bytes) { this.log.push(['write', ...bytes]); }
  async read(address, n) {
    this.log.push(['read', n]);
    if (this.busy-- > 0) return Uint8Array.of(0x98, 0, 0, 0, 0, 0, 0);
    return Uint8Array.from(this.frame);
  }
  async writeRead() { this.log.push(['status']); return Uint8Array.of(this.st); }
}

const R8845 = [0x1c, 0xad, 0x03, 0x76, 0x40, 0xea, 0x64]; // read on r8845: 28.17 C, 67.6 %

describe('aht21 (host)', () => {
  it('crc8: r8845\'s frames (from 0xFF, 0x31)', () => {
    assert.equal(crc8(R8845.slice(0, 6)), 0x64);
  });

  it('measure: 0xAC 0x33 0x00, 7 bytes, the datasheet\'s formulas', async () => {
    const a = new FakeAht(R8845);
    const r = await new Aht21(a).measure();
    assert.deepEqual(a.log, [['write', 0xac, 0x33, 0x00], ['read', 7]]);
    assert.ok(Math.abs(r.temperature - 28.17) < 0.01, `${r.temperature}`);
    assert.ok(Math.abs(r.humidity - 67.6) < 0.05, `${r.humidity}`);
  });

  it('measure waits out the busy bit', async () => {
    const a = new FakeAht(R8845);
    a.busy = 2;
    await new Aht21(a).measure();
    assert.equal(a.log.filter((e) => e[0] === 'read').length, 3);
  });

  it('a bad CRC throws', async () => {
    await assert.rejects(new Aht21(new FakeAht([...R8845.slice(0, 6), 0x00])).measure(), /CRC/);
  });

  it('init: refused without 0x18 in the status (Aosong\'s routine needed)', async () => {
    await new Aht21(new FakeAht(R8845, 0x18)).init();
    await assert.rejects(new Aht21(new FakeAht(R8845, 0x08)).init(), /initialisation/);
  });
});
