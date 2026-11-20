// the AP3216C driver against a fake chip: its defaults (as ours read them),
// a burst wrapping within its register pair (as ours does), the data
// formats, the set-up, identify against an HMC5883L at the same 0x1E
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ap3216c, Hmc5883l } from '../../src/index.js';
import { decode, FULL_SCALE_LUX } from '../../src/devices/ap3216c.js';

// ours at power-up, every register read one at a time on r8845
const DEFAULTS = { 0x19: 0x40, 0x1c: 0xff, 0x1d: 0xff, 0x20: 0x05, 0x21: 0x13, 0x22: 0x01, 0x2b: 0x80, 0x2d: 0x80 };

class FakeAp {
  constructor(data = {}) {
    this.regs = { ...DEFAULTS, ...data };
    this.log = [];
  }
  async write(address, [reg, v]) {
    this.log.push(['write', reg, v]);
    this.regs[reg] = v;
    if (reg === 0x00 && v === 0x04) { this.regs = { ...DEFAULTS, 0x00: 0 }; }
  }
  // a burst wraps within the pair: reg & ~1, then | 1, again
  async writeRead(address, [reg], n) {
    const base = reg & ~1;
    return Uint8Array.from({ length: n }, (_, i) => this.regs[i === 0 ? reg : base + ((reg - base + i) % 2)] ?? 0);
  }
}

describe('ap3216c (host)', () => {
  it('decode: IR 10 bits (0x0B high 8, 0x0A bits 1-0), ALS 16, PS 10 (0x0F bits 5-0, 0x0E bits 3-0); OBJ, IR_OF', () => {
    assert.deepEqual(decode([0x03, 0xff], [0x34, 0x12], [0x0f, 0x3f]), { ir: 1023, als: 0x1234, proximity: 1023, near: false, irOverflow: false });
    assert.deepEqual(decode([0x01, 0x02], [0, 0], [0x85, 0xc1]), { ir: 9, als: 0, proximity: 0x15, near: true, irOverflow: true });
    assert.equal(decode([0x80, 0], [0, 0], [0, 0]).irOverflow, true);
  });

  it('init: a software reset, the range at 0x10, then ALS and PS+IR (mode 3)', async () => {
    const f = new FakeAp();
    await new Ap3216c(f, 0x1e, { range: 2 }).init();
    assert.deepEqual(f.log, [['write', 0x00, 0x04], ['write', 0x10, 0x20], ['write', 0x00, 0x03]]);
    assert.throws(() => new Ap3216c(f, 0x1e, { range: 4 }), /no range 4: 0-3/);
  });

  it('measure: each pair read on its own (a burst wraps on ours); lux by the range\'s full scale', async () => {
    const f = new FakeAp({ 0x0a: 0x02, 0x0b: 0x01, 0x0c: 0xc1, 0x0d: 0x00, 0x0e: 0x04, 0x0f: 0x81 });
    const r = await new Ap3216c(f, 0x1e, { range: 3 }).measure();
    assert.deepEqual({ ...r, lux: undefined }, { lux: undefined, als: 193, ir: 6, proximity: 0x14, near: true, irOverflow: false });
    assert.ok(Math.abs(r.lux - (193 * FULL_SCALE_LUX[3]) / 65535) < 1e-9);
  });

  it('sleep: power down', async () => {
    const f = new FakeAp();
    await new Ap3216c(f).sleep();
    assert.deepEqual(f.log, [['write', 0x00, 0x00]]);
  });

  it('identify: its reserved bits 0; an HMC5883L ("H43" at 0x0A) is not one, nor it an HMC5883L', async () => {
    assert.equal(await Ap3216c.chip.identify(new FakeAp(), 0x1e), true);
    const hmc = { async writeRead(a, [reg]) { return Uint8Array.of({ 0x00: 0x10, 0x01: 0x20, 0x0a: 0x48, 0x0b: 0x34, 0x0c: 0x33 }[reg] ?? 0); } };
    assert.equal(await Ap3216c.chip.identify(hmc, 0x1e), false);
    assert.equal(await Hmc5883l.chip.identify(new FakeAp(), 0x1e), false);
    const nack = { async writeRead() { throw new Error('no ack'); } };
    assert.equal(await Ap3216c.chip.identify(nack, 0x1e), false);
  });
});
