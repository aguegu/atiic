// the AS7341 driver against a fake chip: its set-up, the two SMUX halves
// (Adafruit's tables, written with SMUX_CMD write, SMUXEN waited out), the
// six ADCs read from ASTATUS (LSB first), ASAT, its ID
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { As7341 } from '../../src/index.js';
import { SMUX_F1F4, SMUX_F5F8, channelsOf } from '../../src/devices/as7341.js';

class FakeAs {
  constructor({ halves = [[1, 2, 3, 4, 100, 7], [5, 6, 7, 8, 101, 9]], asat = [0, 0] } = {}) {
    Object.assign(this, { halves, asat });
    this.regs = new Uint8Array(256);
    this.regs[0x92] = 0x24;
    this.log = [];
    this.smux = null;
    this.measured = 0;
  }
  async write(address, [reg, ...data]) {
    this.log.push([reg, ...data]);
    if (reg === 0x00) { this.smux = data; return; }
    this.regs.set(data, reg);
    if (reg === 0x80 && data[0] & 0x10) this.regs[0x80] &= ~0x10; // the SMUX command done at once
    if (reg === 0x80 && data[0] & 0x02) this.regs[0xa3] = 0x40; // AVALID
  }
  async writeRead(address, [reg], n) {
    if (reg === 0x94) {
      const h = this.smux === SMUX_F1F4 || this.smux?.every((v, i) => v === SMUX_F1F4[i]) ? 0 : 1;
      const out = [this.asat[h] ? 0x80 : 0, ...this.halves[h].flatMap((v) => [v & 0xff, v >> 8])];
      this.regs[0xa3] = 0;
      return Uint8Array.from(out.slice(0, n));
    }
    return this.regs.slice(reg, reg + n);
  }
}

describe('as7341 (host)', () => {
  it('channelsOf: six ADCs after ASTATUS, LSB first', () => {
    assert.deepEqual(channelsOf([0x00, 0x34, 0x12, 0xff, 0xff, 1, 0, 0, 0, 2, 0, 3, 0]), [0x1234, 0xffff, 1, 0, 2, 3]);
  });

  it('init: PON, ATIME, ASTEP LSB first, AGAIN\'s code; the integration (ATIME+1)(ASTEP+1) 2.78 us', async () => {
    const f = new FakeAs();
    const a = new As7341(f, 0x39, { gain: 16, atime: 29, astep: 599 });
    await a.init();
    assert.deepEqual(f.log, [[0x80, 0x01], [0x81, 29], [0xca, 599 & 0xff, 599 >> 8], [0xaa, 5]]);
    assert.ok(Math.abs(a.integrationMs - 50.04) < 0.01);
    assert.throws(() => new As7341(f, 0x39, { gain: 3 }), /no gain 3/);
  });

  it('measure: SMUX F1-F4 then F5-F8 (SMUX_CMD write, the 20 bytes, SMUXEN), each measured; the ten channels', async () => {
    const f = new FakeAs();
    const r = await new As7341(f).measure();
    assert.deepEqual(r, { f1: 1, f2: 2, f3: 3, f4: 4, f5: 5, f6: 6, f7: 7, f8: 8, clear: 101, nir: 9, saturated: false });
    const smuxWrites = f.log.filter(([reg]) => reg === 0x00).map(([, ...d]) => d);
    assert.deepEqual(smuxWrites, [SMUX_F1F4, SMUX_F5F8]);
    assert.equal(f.log.filter(([reg, v]) => reg === 0xaf && v === 0x10).length, 2);
    assert.deepEqual(f.log.at(-1), [0x80, 0x01]); // SP_EN off after
  });

  it('measure: ASAT in either half is saturated', async () => {
    assert.equal((await new As7341(new FakeAs({ asat: [0, 1] })).measure()).saturated, true);
  });

  it('SMUX tables: 20 bytes each, Clear on ADC4 and NIR on ADC5 in both', () => {
    for (const t of [SMUX_F1F4, SMUX_F5F8]) {
      assert.equal(t.length, 20);
      assert.equal(t[0x08], 0x50);
      assert.equal(t[0x11], 0x50);
      assert.equal(t[0x13], 0x06);
    }
  });

  it('identify: ID bits 7-2 001001 (0x24, any low bits); sleep powers it down', async () => {
    const f = new FakeAs();
    assert.equal(await As7341.chip.identify(f, 0x39), true);
    f.regs[0x92] = 0x27;
    assert.equal(await As7341.chip.identify(f, 0x39), true);
    f.regs[0x92] = 0x25 & 0xf0;
    assert.equal(await As7341.chip.identify(f, 0x39), false);
    await new As7341(f).sleep();
    assert.deepEqual(f.log.at(-1), [0x80, 0x00]);
  });
});
