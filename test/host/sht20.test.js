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
  async writeRead(address, bytes, n) {
    if (bytes[0] === 0xe3 || bytes[0] === 0xe5) { // hold master: trigger and read, one transaction
      this.log.push(['writeRead', bytes[0], n]);
      const [hi, lo] = bytes[0] === 0xe3 ? this.t : this.rh;
      return Uint8Array.of(hi, lo, crc8([hi, lo]));
    }
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

  it('setResolution: the user register read, only bits 7 and 0 changed (0x3A, reserved bits set, kept)', async () => {
    const f = new FakeSht([0x66, 0x7c], [0x63, 0x52]);
    const s = new Sht20(f);
    await s.setResolution('11/11');
    assert.deepEqual(f.log.at(-1), ['write', 0xe6, 0xbb]); // 0x3A | 0x81
    await s.setResolution('8/12');
    assert.deepEqual(f.log.at(-1), ['write', 0xe6, 0x3b]); // bit 7 0, bit 0 1
    await s.setResolution('10/13');
    assert.deepEqual(f.log.at(-1), ['write', 0xe6, 0xba]);
    await assert.rejects(s.setResolution('9/9'), /no resolution 9\/9: 12\/14, 8\/12, 10\/13, 11\/11/);
  });

  it('the waits and the period follow the resolution (Table 7, 10 % active)', async () => {
    const s = new Sht20(new FakeSht([0x66, 0x7c], [0x63, 0x52]));
    assert.equal(s.periodMs(), 1140);
    await s.setResolution('11/11');
    assert.equal(s.periodMs(), 260);
    const t0 = Date.now();
    await s.measure();
    const ms = Date.now() - t0;
    assert.ok(ms >= 26 && ms < 100, `${ms} ms`);
  });

  it('hold master: 0xE3 and 0xE5, each read in the same transaction, no wait of its own; the same values', async () => {
    const f = new FakeSht([0x66, 0x7c], [0x63, 0x52]);
    const held = await new Sht20(f, 0x40, { hold: true }).measure();
    assert.deepEqual(f.log, [['writeRead', 0xe3, 3], ['writeRead', 0xe5, 3]]);
    assert.deepEqual(held, await new Sht20(new FakeSht([0x66, 0x7c], [0x63, 0x52])).measure());
  });
});
