// the VL6180X driver against a fake chip: 16-bit register addresses, AN4545's
// settings only when fresh out of reset, the new-sample interrupt config, a
// range with its error code, the ALS's lux formula
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Vl6180x } from '../../src/index.js';
import { MANDATORY, RECOMMENDED } from '../../src/devices/vl6180x.js';

class FakeVl {
  constructor({ fresh = 1, mm = 40, rangeError = 0, als = 1000, readyAfter = 0 } = {}) {
    this.regs = new Map([[0x000, 0xb4], [0x016, fresh], [0x062, mm], [0x04d, (rangeError << 4) | 1], [0x050, als >> 8], [0x051, als & 0xff]]);
    this.readyAfter = readyAfter;
    this.log = [];
    this.started = null;
  }
  async write(address, [hi, lo, ...data]) {
    const reg = (hi << 8) | lo;
    this.log.push([reg, ...data]);
    data.forEach((v, i) => this.regs.set(reg + i, v));
    if (reg === 0x018) this.started = 'range';
    if (reg === 0x038) this.started = 'als';
    if (reg === 0x015) this.started = null;
  }
  async writeRead(address, [hi, lo], n) {
    const reg = (hi << 8) | lo;
    if (reg === 0x04f) {
      if (this.readyAfter-- > 0 || !this.started || this.regs.get(0x014) !== 0x24) return Uint8Array.of(0);
      return Uint8Array.of(this.started === 'range' ? 4 : 4 << 3);
    }
    return Uint8Array.from({ length: n }, (_, i) => this.regs.get(reg + i) ?? 0);
  }
}

describe('vl6180x (host)', () => {
  it('init fresh out of reset: AN4545\'s 30 mandatory and 4 recommended writes, the flag cleared; then the interrupt config, ALS gain, integration (16 bits, MSB first)', async () => {
    const f = new FakeVl();
    assert.equal(await new Vl6180x(f).init(), true);
    assert.equal(MANDATORY.length, 30);
    assert.deepEqual(f.log.slice(0, 34), [...MANDATORY, ...RECOMMENDED].map(([r, v]) => [r, v]));
    assert.deepEqual(f.log.slice(34), [[0x016, 0x00], [0x014, 0x24], [0x03f, 0x46], [0x040, 0x00, 0x63]]);
  });

  it('init not fresh: no settings loaded; the rest still set', async () => {
    const f = new FakeVl({ fresh: 0 });
    assert.equal(await new Vl6180x(f, 0x29, { alsGain: 40, alsMs: 50 }).init(), false);
    assert.deepEqual(f.log, [[0x014, 0x24], [0x03f, 0x47], [0x040, 0x00, 0x31]]);
  });

  it('range: SYSRANGE__START, the new sample waited for, mm from 0x062, its error code, the interrupts cleared', async () => {
    const f = new FakeVl({ mm: 98, readyAfter: 2 });
    const v = new Vl6180x(f);
    await v.init();
    f.log = [];
    assert.deepEqual(await v.range(), { mm: 98, error: null, near: true });
    assert.deepEqual(f.log, [[0x018, 0x01], [0x015, 0x07]]);
    const g = new FakeVl({ mm: 255, rangeError: 8 });
    const w = new Vl6180x(g);
    await w.init();
    assert.deepEqual(await w.range(), { mm: 255, error: 'no target', near: false });
    const h = new FakeVl({ mm: 255, rangeError: 7 });
    const x = new Vl6180x(h);
    await x.init();
    assert.deepEqual(await x.range(), { mm: 255, error: 'max convergence', near: false });
  });

  it('range: no new sample (its interrupt config never set) throws', async () => {
    const f = new FakeVl();
    await assert.rejects(new Vl6180x(f).range(), /no range after/);
  });

  it('als: lux = 0.32 x count / gain x 100 ms / integration (2.10.4), the count MSB first', async () => {
    const f = new FakeVl({ als: 1000 });
    const v = new Vl6180x(f, 0x29, { alsGain: 10, alsMs: 50 });
    await v.init();
    const r = await v.als();
    assert.equal(r.count, 1000);
    assert.ok(Math.abs(r.lux - (0.32 * 1000 * 100) / (10 * 50)) < 1e-9);
  });

  it('identify: MODEL_ID 0xB4 at the 16-bit 0x000; options checked', async () => {
    assert.equal(await Vl6180x.chip.identify(new FakeVl(), 0x29), true);
    const other = new FakeVl();
    other.regs.set(0x000, 0xea);
    assert.equal(await Vl6180x.chip.identify(other, 0x29), false);
    assert.throws(() => new Vl6180x(other, 0x29, { alsGain: 3 }), /no ALS gain 3/);
    assert.throws(() => new Vl6180x(other, 0x29, { alsMs: 0 }), /1-512 ms/);
  });
});
