// the SPL06 driver against a fake sensor: Table 10's coefficients (12-, 20-
// and 16-bit 2's complement), 5.6's compensation, Table 5's modes with the
// shift above 8 times, a mode change waiting out the old measurement
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Spl06 } from '../../src/index.js';
import { coefficients, compensate } from '../../src/devices/spl06.js';

// r8845's module's coefficient bytes, built back from what it read: c0 199,
// c1 -261, c00 79216, c10 -55111, c01 -2716, c11 1139, c20 -11094, c21 165, c30 -1617
const R8845 = { c0: 199, c1: -261, c00: 79216, c10: -55111, c01: -2716, c11: 1139, c20: -11094, c21: 165, c30: -1617 };
function bytesOf(c) {
  const u = (v, bits) => (v < 0 ? v + (1 << bits) : v);
  const c0 = u(c.c0, 12), c1 = u(c.c1, 12), c00 = u(c.c00, 20), c10 = u(c.c10, 20);
  const w = (v) => [(u(v, 16) >> 8) & 0xff, u(v, 16) & 0xff];
  return [c0 >> 4, ((c0 & 0xf) << 4) | (c1 >> 8), c1 & 0xff, c00 >> 12, (c00 >> 4) & 0xff, ((c00 & 0xf) << 4) | (c10 >> 16), (c10 >> 8) & 0xff, c10 & 0xff,
    ...w(c.c01), ...w(c.c11), ...w(c.c20), ...w(c.c21), ...w(c.c30)];
}

class FakeSpl {
  constructor() {
    this.regs = new Uint8Array(0x30);
    this.regs[0x0d] = 0x10;
    this.regs.set(bytesOf(R8845), 0x10);
    this.writes = [];
    this.reads = [];
  }
  async write(address, [reg, v]) {
    this.writes.push([reg, v]);
    this.regs[reg] = v;
    if (reg === 0x0c && v === 0x09) this.regs[0x08] = 0xc0; // reset: sensor and coefficients ready
    if (reg === 0x08 && v === 0x07) this.regs[0x08] = 0xc0 | 0x10 | 0x07; // measuring: a pressure ready
  }
  async writeRead(address, [reg], n) {
    this.reads.push(reg);
    return this.regs.slice(reg, reg + n);
  }
}

describe('spl06 (host)', () => {
  it('coefficients: Table 10\'s layout and signs, back from the bytes', () => {
    assert.deepEqual(coefficients(bytesOf(R8845)), R8845);
  });

  it('compensate: 5.6\'s formulas', () => {
    const r = compensate(R8845, 0, 0, 253952, 524288);
    assert.equal(r.pressure, R8845.c00);
    assert.equal(r.temperature, R8845.c0 / 2);
    const p = 1000, t = 2000, kP = 253952, kT = 524288, ps = p / kP, ts = t / kT;
    const c = R8845;
    const want = c.c00 + ps * (c.c10 + ps * (c.c20 + ps * c.c30)) + ts * c.c01 + ts * ps * (c.c11 + ps * c.c21);
    assert.ok(Math.abs(compensate(c, p, t, kP, kT).pressure - want) < 1e-9);
  });

  it('init: its ID, a soft reset, ready awaited, the coefficients, indoor (0x14, 0x80, P shift), background', async () => {
    const f = new FakeSpl();
    const s = new Spl06(f);
    await s.init();
    assert.deepEqual(s.coef, R8845);
    assert.deepEqual(f.writes, [[0x0c, 0x09], [0x08, 0x00], [0x06, 0x14], [0x07, 0x80], [0x09, 0x04], [0x08, 0x07]]);
    assert.equal(s.periodMs, 500);
  });

  it('modes: weather no shift, sports (0x26, 0xA0) the P shift; an unknown one refused', async () => {
    const f = new FakeSpl();
    const s = new Spl06(f);
    await s.init({ mode: 'weather' });
    assert.deepEqual(f.writes.slice(2), [[0x06, 0x01], [0x07, 0x80], [0x09, 0x00], [0x08, 0x07]]);
    f.writes.length = 0;
    await s.configure({ mode: 'sports' });
    assert.deepEqual(f.writes, [[0x08, 0x00], [0x06, 0x26], [0x07, 0xa0], [0x09, 0x04], [0x08, 0x07]]);
    await assert.rejects(s.configure({ mode: 'space' }), /no mode space: weather, indoor, sports/);
  });

  it('a mode change: the old measurement waited out, the results read once before the new setting', async () => {
    const f = new FakeSpl();
    const s = new Spl06(f);
    await s.init({ mode: 'sports' });
    f.reads.length = 0;
    const t0 = Date.now();
    await s.configure({ mode: 'weather' });
    assert.ok(Date.now() - t0 >= 53, 'sports\' 64 times takes 53.2 ms');
    assert.deepEqual(f.reads, [0x00]);
  });

  it('measure: pressure ready awaited, 24-bit 2\'s complement results compensated', async () => {
    const f = new FakeSpl();
    const s = new Spl06(f);
    await s.init();
    f.regs.set([0xff, 0xff, 0x00, 0x00, 0x10, 0x00], 0x00); // Praw -256, Traw 4096
    const r = await s.measure();
    const want = compensate(R8845, -256, 4096, 253952, 524288);
    assert.ok(Math.abs(r.pressure - want.pressure) < 1e-9 && Math.abs(r.temperature - want.temperature) < 1e-9);
  });

  it('identify: 0x10 at 0Dh', async () => {
    const f = new FakeSpl();
    assert.equal(await Spl06.chip.identify(f, 0x77), true);
    f.regs[0x0d] = 0x58;
    assert.equal(await Spl06.chip.identify(f, 0x77), false);
  });
});
