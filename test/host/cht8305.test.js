// the CHT8305C driver against a fake sensor: registers, the wait, the
// formulas (2^16 - 1), the high limits (the datasheet's examples), the
// configuration; and the other 0x40 checks saying no to it, and its to them
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Cht8305, Hdc1080, Sht20, Htu21d, Ina231 } from '../../src/index.js';

// Dart-8346's CHT8305C, as read
const REGS = { 0x02: 0x1000, 0x03: 0xcd36, 0xfe: 0x5959, 0xff: 0x8305 };
const READ_ONLY = [0x00, 0x01, 0xfe, 0xff];

class FakeCht {
  constructor({ t = 0x6034, rh = 0x9c80, regs = REGS } = {}) { Object.assign(this, { t, rh }); this.regs = { ...regs }; this.pointer = 0; this.log = []; }
  async write(address, bytes) {
    this.pointer = bytes[0];
    if (bytes.length > 1 && (READ_ONLY.includes(bytes[0]) || this.regs[bytes[0]] === undefined)) throw new Error(`0x${address.toString(16)} refused byte 1`);
    if (bytes.length === 3) this.regs[bytes[0]] = bytes[0] === 0x02 ? (((bytes[1] << 8) | bytes[2]) & ~0x8000) : ((bytes[1] << 8) | bytes[2]);
    this.log.push(['write', ...bytes]);
  }
  async read(address, n) {
    if (this.pointer === 0x00 && n === 4) { this.log.push(['read', 4]); return Uint8Array.of(this.t >> 8, this.t & 0xff, this.rh >> 8, this.rh & 0xff); }
    const v = this.regs[this.pointer] ?? 0;
    return Uint8Array.of(v >> 8, v & 0xff);
  }
  async writeRead(address, bytes, n) { await this.write(address, bytes); return this.read(address, n); }
}

describe('cht8305 (host)', () => {
  it('identify: Sensylink\'s 0x5959 and an 0x8XXX ID; an HDC1080\'s registers no', async () => {
    assert.equal(await Cht8305.chip.identify(new FakeCht(), 0x40), true);
    const hdc = new FakeCht({ regs: { ...REGS, 0xfe: 0x5449, 0xff: 0x1050 } });
    assert.equal(await Cht8305.chip.identify(hdc, 0x40), false);
  });

  it('the other 0x40 checks say no to it: SHT20, HTU21D, HDC1080, INA231', async () => {
    for (const D of [Sht20, Htu21d, Hdc1080, Ina231]) assert.equal(await D.chip.identify(new FakeCht(), 0x40), false, D.chip.name);
  });

  it('measure: the pointer to 0x00, 20 ms waited, 4 bytes; the formulas over 2^16 - 1', async () => {
    const f = new FakeCht({ t: 0x6034, rh: 0x9c80 });
    const t0 = Date.now();
    const r = await new Cht8305(f).measure();
    assert.ok(Date.now() - t0 >= 19, 'waited 20 ms');
    assert.deepEqual(f.log, [['write', 0x00], ['read', 4]]);
    assert.ok(Math.abs(r.temperature - ((165 * 0x6034) / 65535 - 40)) < 1e-9);
    assert.ok(Math.abs(r.humidity - (100 * 0x9c80) / 65535) < 1e-9);
    assert.ok(Math.abs(r.temperature - 22.01) < 0.01 && Math.abs(r.humidity - 61.13) < 0.01, 'ours: 22.01 C, 61.13 %');
  });

  it('alertLimits: the default 0xCD36 is 79.7 % and 59.9 C (1.1.4\'s example)', async () => {
    const l = await new Cht8305(new FakeCht()).alertLimits();
    assert.ok(Math.abs(l.humidity - 79.7) < 0.05, `${l.humidity}`);
    assert.ok(Math.abs(l.temperature - 59.9) < 0.05, `${l.temperature}`);
  });

  it('setAlert: 90 % and 80 C is 0xE774 (Table 6); the mode into ALTM; one kept when not given', async () => {
    const f = new FakeCht();
    const c = new Cht8305(f);
    await c.setAlert({ humidity: 90, temperature: 80, mode: 'both' });
    assert.equal(f.regs[0x03], 0xe774);
    assert.equal(await c.config(), 0x1000 | 0xc0);
    await c.setAlert({ temperature: 60 });
    assert.equal(f.regs[0x03] >> 9, 0xe774 >> 9, 'humidity kept');
    await assert.rejects(c.setAlert({ mode: 'never' }), /no alert mode never: either, temperature, humidity, both/);
  });

  it('alertStatus: APS, HALT, TALT', async () => {
    const f = new FakeCht();
    f.regs[0x02] = 0x1000 | 0x20 | 0x08;
    assert.deepEqual(await new Cht8305(f).alertStatus(), { pending: true, humidity: false, temperature: true });
  });

  it('setResolution and setHeater: the configuration (bit 12 kept, ALTM kept); a wrong resolution throws', async () => {
    const f = new FakeCht();
    const c = new Cht8305(f);
    await c.setAlert({ mode: 'humidity' });
    await c.setResolution({ temperature: 11, humidity: 8 });
    assert.equal(await c.config(), 0x1000 | 0x0400 | 0x0200 | 0x80);
    await c.setHeater(true);
    assert.equal(await c.config(), 0x1000 | 0x2000 | 0x0400 | 0x0200 | 0x80);
    await assert.rejects(c.setResolution({ humidity: 12 }), /no humidity resolution 12: 14, 11, 8/);
  });

  it('init: SRST, bit 15 read back clear; lowBattery: Vccs; periodMs: one a second', async () => {
    const f = new FakeCht();
    const c = new Cht8305(f);
    await c.init();
    assert.deepEqual(f.log[0], ['write', 0x02, 0x80, 0x00]);
    assert.equal(await c.lowBattery(), false);
    f.regs[0x02] |= 0x0800;
    assert.equal(await c.lowBattery(), true);
    assert.equal(c.periodMs(), 1000);
  });
});
