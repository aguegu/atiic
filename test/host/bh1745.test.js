// the BH1745NUC driver against a fake sensor: its IDs, the reset and
// configuration, VALID awaited, the counts low byte first
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Bh1745 } from '../../src/index.js';

class FakeBh {
  constructor() {
    this.regs = new Uint8Array(256);
    this.regs[0x40] = 0x0b;
    this.regs[0x92] = 0xe0;
    this.regs.set([0x34, 0x12, 0x78, 0x56, 0xbc, 0x9a, 0x10, 0x00], 0x50); // red 0x1234, green 0x5678, blue 0x9abc, clear 0x0010
    this.writes = [];
    this.notValid = 0; // reads of 42h before VALID
  }
  async write(address, [reg, ...data]) {
    this.writes.push([reg, ...data]);
    data.forEach((v, i) => { this.regs[reg + i] = v; });
  }
  async writeRead(address, [reg], n) {
    if (reg === 0x42) return Uint8Array.of(this.regs[0x42] | (this.notValid-- > 0 ? 0 : 0x80));
    return this.regs.slice(reg, reg + n);
  }
}

describe('bh1745 (host)', () => {
  it('identify: the part ID 0x0B in 40h and ROHM\'s 0xE0 in 92h', async () => {
    const f = new FakeBh();
    assert.equal(await Bh1745.chip.identify(f, 0x38), true);
    f.regs[0x92] = 0xff;
    assert.equal(await Bh1745.chip.identify(f, 0x38), false);
    f.regs[0x40] = 0xff; // nothing there
    assert.equal(await Bh1745.chip.identify(f, 0x38), false);
  });

  it('init: a software reset, then the time and gain with RGBC_EN, 44h = 02h', async () => {
    const f = new FakeBh();
    await new Bh1745(f).init({ timeMs: 640, gain: 16 });
    assert.deepEqual(f.writes, [[0x40, 0x80], [0x41, 0x02, 0x12], [0x44, 0x02]]);
  });

  it('measure: VALID awaited, the four counts low byte first', async () => {
    const f = new FakeBh();
    const s = new Bh1745(f);
    await s.init();
    f.notValid = 2;
    assert.deepEqual(await s.measure(), { red: 0x1234, green: 0x5678, blue: 0x9abc, clear: 0x10, gain: 1, timeMs: 160 });
  });

  it('a time or gain the chip doesn\'t have is refused; sleep turns RGBC_EN off', async () => {
    const f = new FakeBh();
    const s = new Bh1745(f);
    await s.init({ gain: 2 });
    await assert.rejects(s.configure({ timeMs: 100 }), /no 100 ms: 160, 320, 640, 1280, 2560, 5120/);
    await assert.rejects(s.configure({ gain: 4 }), /no gain 4: 1, 2, 16/);
    await s.sleep();
    assert.deepEqual(f.writes.at(-1), [0x42, 0x01]);
  });
});
