// the SGP30 driver against a fake sensor: its commands (Table 10), the
// words' CRCs, the baseline's order, the humidity's 8.8 fixed point and the
// datasheet's formula, its feature set as its ID
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Sgp30 } from '../../src/index.js';
import { crc8, absoluteHumidity } from '../../src/devices/sgp30.js';

const w = (v) => [v >> 8, v & 0xff, crc8([v >> 8, v & 0xff])];

// ours as read on r8845: serial, feature set 0x0022, self test 0xD400
class FakeSgp30 {
  constructor({ feature = 0x0022, iaq = [400, 0], raw = [11677, 15862], baseline = [0x8a3c, 0x8f21] } = {}) {
    Object.assign(this, { feature, iaq, raw, baseline });
    this.log = [];
    this.reply = null;
  }
  async write(address, bytes) {
    this.log.push(bytes);
    const c = (bytes[0] << 8) | bytes[1];
    this.reply = {
      0x3682: [0x0000, 0x0288, 0x867b].flatMap(w),
      0x202f: w(this.feature),
      0x2032: w(0xd400),
      0x2008: this.iaq.flatMap(w),
      0x2050: this.raw.flatMap(w),
      0x2015: this.baseline.flatMap(w),
    }[c] ?? null;
  }
  async read(address, n) { return Uint8Array.from(this.reply.slice(0, n)); }
}

describe('sgp30 (host)', () => {
  it('crc8: CRC(0xBEEF) = 0x92, the family\'s', () => {
    assert.equal(crc8([0xbe, 0xef]), 0x92);
  });

  it('absoluteHumidity: the datasheet\'s formula (25 C, 50 %: 11.48 g/m3; its example says 11.8)', () => {
    assert.ok(Math.abs(absoluteHumidity(25, 50) - 11.48) < 0.01, `${absoluteHumidity(25, 50)}`);
    assert.equal(absoluteHumidity(25, 0), 0);
  });

  it('serial, feature set, self test: ours', async () => {
    const s = new Sgp30(new FakeSgp30());
    assert.equal(await s.serial(), 0x0288867b);
    assert.equal(await s.featureSet(), 0x0022);
    assert.deepEqual(await s.selfTest(), { passed: true, result: 0xd400 });
  });

  it('init then measure: 0x2003, 0x2008; CO2eq first, then TVOC; raw H2 then ethanol', async () => {
    const f = new FakeSgp30({ iaq: [612, 87] });
    const s = new Sgp30(f);
    await s.init();
    assert.deepEqual(await s.measure(), { co2eq: 612, tvoc: 87 });
    assert.deepEqual(await s.raw(), { h2: 11677, ethanol: 15862 });
    assert.deepEqual(f.log.map((c) => c.slice(0, 2)), [[0x20, 0x03], [0x20, 0x08], [0x20, 0x50]]);
  });

  it('a bad CRC throws', async () => {
    const f = new FakeSgp30();
    f.read = async () => Uint8Array.of(0x01, 0x90, 0x00, 0, 0, 0x81);
    await assert.rejects(new Sgp30(f).measure(), /SGP30 measurement CRC/);
  });

  it('baseline: CO2eq then TVOC read; set back TVOC first (the datasheet\'s order), each with its CRC', async () => {
    const f = new FakeSgp30();
    const s = new Sgp30(f);
    const b = await s.baseline();
    assert.deepEqual(b, { co2eq: 0x8a3c, tvoc: 0x8f21 });
    await s.setBaseline(b);
    assert.deepEqual(f.log.at(-1), [0x20, 0x1e, ...w(0x8f21), ...w(0x8a3c)]);
  });

  it('setHumidity: 8.8 fixed point (15.5 g/m3 is 0x0F80, the datasheet\'s), 0 off, clamped', async () => {
    const f = new FakeSgp30();
    const s = new Sgp30(f);
    await s.setHumidity(15.5);
    assert.deepEqual(f.log.at(-1), [0x20, 0x61, ...w(0x0f80)]);
    await s.setHumidity(0);
    assert.deepEqual(f.log.at(-1), [0x20, 0x61, ...w(0)]);
    await s.setHumidity(300);
    assert.deepEqual(f.log.at(-1), [0x20, 0x61, ...w(0xffff)]);
  });

  it('identify: a feature set with a good CRC and product type 0; another product, a bad CRC or a NACK, no', async () => {
    assert.equal(await Sgp30.chip.identify(new FakeSgp30(), 0x58), true);
    assert.equal(await Sgp30.chip.identify(new FakeSgp30({ feature: 0x1022 }), 0x58), false);
    const bad = new FakeSgp30();
    bad.read = async () => Uint8Array.of(0x00, 0x22, 0x00);
    assert.equal(await Sgp30.chip.identify(bad, 0x58), false);
    const nack = { async write() { throw new Error('no ack'); } };
    assert.equal(await Sgp30.chip.identify(nack, 0x58), false);
  });
});
