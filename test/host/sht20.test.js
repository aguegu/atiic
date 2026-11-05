// the SHT20 driver against a fake sensor: commands, waits, CRCs, formulas
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Sht20 } from '../../src/index.js';
import { crc8 } from '../../src/devices/sht20.js';

class FakeSht {
  constructor(t, rh) { this.t = t; this.rh = rh; this.log = []; this.next = null; }
  async write(address, bytes) { this.log.push(['write', ...bytes]); this.next = bytes[0]; }
  async read(address, n) {
    this.log.push(['read', n]);
    const [hi, lo] = this.next === 0xf3 ? this.t : this.rh;
    return Uint8Array.of(hi, lo, crc8([hi, lo]));
  }
  async writeRead(address, bytes) {
    if (bytes[0] === 0xfc) return Uint8Array.of(0x01, 0x51, 0xbb, 0x00, 0x80, 0x7a); // r8845's module
    return Uint8Array.of(0x3a);
  }
}

describe('sht20 (host)', () => {
  it('crc8: the datasheet\'s example, 0x63 0x52 -> 0x64', () => {
    assert.equal(crc8([0x63, 0x52]), 0x64);
  });

  it('measure: T by 0xF3, RH by 0xF5, 3 bytes each; the formulas, status bits cleared', async () => {
    const s = new FakeSht([0x66, 0x7c], [0x63, 0x52]); // T status 00, RH status 10
    const r = await new Sht20(s).measure();
    assert.deepEqual(s.log, [['write', 0xf3], ['read', 3], ['write', 0xf5], ['read', 3]]);
    assert.ok(Math.abs(r.temperature - (-46.85 + (175.72 * 0x667c) / 65536)) < 1e-9);
    assert.ok(Math.abs(r.humidity - (-6 + (125 * 0x6350) / 65536)) < 1e-9); // the datasheet's 42.5 %
    assert.ok(Math.abs(r.humidity - 42.5) < 0.05);
  });

  it('a bad CRC throws', async () => {
    const s = new FakeSht([0x66, 0x7c], [0x63, 0x52]);
    s.read = async () => Uint8Array.of(0x66, 0x7c, 0x00);
    await assert.rejects(new Sht20(s).temperature(), /CRC/);
  });

  it('a humidity for a temperature throws (the status bit)', async () => {
    const s = new FakeSht([0x63, 0x52], [0x63, 0x52]);
    await assert.rejects(new Sht20(s).temperature(), /humidity for a temperature/);
  });

  it('chip.identify: the electronic ID\'s CRCs', async () => {
    assert.equal(await Sht20.chip.identify(new FakeSht(), 0x40), true);
    const bad = new FakeSht();
    bad.writeRead = async () => Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
    assert.equal(await Sht20.chip.identify(bad, 0x40), false);
  });
});
