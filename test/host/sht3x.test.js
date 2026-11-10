// the SHT3x driver against a fake sensor: its 16-bit commands, CRCs (Table
// 20's example), the formulas, the waits, hold master
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Sht3x } from '../../src/index.js';
import { crc8 } from '../../src/devices/sht3x.js';

// r8845's: 5f 07 68 78 49 38, 19.96 C, 47.0 %
const R8845 = [0x5f, 0x07, 0x68, 0x78, 0x49, 0x38];

class FakeSht3x {
  constructor(frame = R8845) { this.frame = Uint8Array.from(frame); this.log = []; }
  async write(address, bytes) { this.log.push(['write', ...bytes]); }
  async read(address, n) { this.log.push(['read', n]); return this.frame.slice(0, n); }
  async writeRead(address, bytes) { this.log.push(['writeRead', ...bytes]); return Uint8Array.of(0x80, 0x10, crc8([0x80, 0x10])); }
}

describe('sht3x (host)', () => {
  it('crc8: Table 20\'s example, 0xBEEF -> 0x92; r8845\'s frame', () => {
    assert.equal(crc8([0xbe, 0xef]), 0x92);
    assert.equal(crc8(R8845.slice(0, 2)), R8845[2]);
    assert.equal(crc8(R8845.slice(3, 5)), R8845[5]);
  });

  it('measure: 0x2400 (high, no stretching), 15.5 ms, 6 bytes, temperature first; the formulas', async () => {
    const f = new FakeSht3x();
    const t0 = Date.now();
    const m = await new Sht3x(f).measure();
    assert.ok(Date.now() - t0 >= 15);
    assert.deepEqual(f.log, [['write', 0x24, 0x00], ['read', 6]]);
    assert.ok(Math.abs(m.temperature - (-45 + (175 * 0x5f07) / 65535)) < 1e-9 && Math.abs(m.temperature - 19.96) < 0.01);
    assert.ok(Math.abs(m.humidity - (100 * 0x7849) / 65535) < 1e-9 && Math.abs(m.humidity - 46.99) < 0.01);
  });

  it('repeatability and hold pick Table 9\'s commands; hold reads straight away', async () => {
    const f = new FakeSht3x();
    await new Sht3x(f, 0x44, { repeatability: 'low' }).measure();
    await new Sht3x(f, 0x44, { repeatability: 'medium', hold: true }).measure();
    assert.deepEqual(f.log.filter((e) => e[0] === 'write'), [['write', 0x24, 0x16], ['write', 0x2c, 0x0d]]);
    assert.throws(() => new Sht3x(f, 0x44, { repeatability: 'ultra' }), /no repeatability ultra: high, medium, low/);
  });

  it('a bad CRC throws; identify by the status word\'s CRC; init resets and clears', async () => {
    const bad = [...R8845];
    bad[5] ^= 1;
    await assert.rejects(new Sht3x(new FakeSht3x(bad)).measure(), /humidity CRC/);
    const f = new FakeSht3x();
    assert.equal(await Sht3x.chip.identify(f, 0x44), true);
    await new Sht3x(f).init();
    assert.deepEqual(f.log.filter((e) => e[0] === 'write'), [['write', 0x30, 0xa2], ['write', 0x30, 0x41]]);
  });
});
