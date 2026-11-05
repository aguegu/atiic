// the MAX30102 driver against a fake chip: its registers, FIFO pointers and
// samples
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Max30102 } from '../../src/index.js';

class FakeChip {
  constructor() {
    this.regs = new Uint8Array(256);
    this.regs[0xff] = 0x15;
    this.writes = [];
    this.fifo = [];
  }
  async write(address, [reg, ...data]) {
    this.writes.push([reg, ...data]);
    data.forEach((v, i) => { this.regs[reg + i] = v; });
    if (reg === 0x09) this.regs[0x09] &= ~0x40; // RESET clears itself
    if (reg === 0x21) { this.regs[0x21] = 0; this.tempReads = 2; } // ready after two polls
  }
  async writeRead(address, [reg], n) {
    if (reg === 0x07) return Uint8Array.from(this.fifo.splice(0, n));
    if (reg === 0x01) { // DIE_TEMP_RDY, cleared by the read
      if (this.tempReads !== undefined && --this.tempReads === 0) {
        this.regs[0x1f] = 0xfe; this.regs[0x20] = 0x04; // -2 + 0.25
        return Uint8Array.of(0x02);
      }
      return Uint8Array.of(0);
    }
    return this.regs.slice(reg, reg + n);
  }
}

describe('max30102 (host)', () => {
  it('init: the part ID, a reset, then the datasheet\'s fields for the defaults', async () => {
    const chip = new FakeChip();
    const m = new Max30102(chip);
    await m.init();
    assert.deepEqual(chip.writes, [
      [0x09, 0x40], // RESET
      [0x08, 0x40], // SMP_AVE 4
      [0x0a, 0x2f], // ADC 4096 nA, 400 per second, 411 us
      [0x0c, 0x23, 0x23], // red, IR: 7 mA (35 x 0.2)
      [0x03, 0x02], // DIE_TEMP_RDY_EN
      [0x04, 0, 0, 0], // FIFO pointers, overflow counter
      [0x09, 0x03], // SpO2 mode
    ]);
    assert.equal(m.rate, 100);
  });

  it('init refuses a setting off the datasheet\'s tables', async () => {
    await assert.rejects(new Max30102(new FakeChip()).init({ sampleRate: 300 }), /50, 100, 200/);
    await assert.rejects(new Max30102(new FakeChip()).init({ red: 60 }), /0-51/);
    await assert.rejects(new Max30102(new FakeChip()).init({ mode: 'multi' }), /spo2 or hr/);
  });

  it('init refuses another part', async () => {
    const chip = new FakeChip();
    chip.regs[0xff] = 0x11;
    await assert.rejects(new Max30102(chip).init(), /not a MAX30102/);
  });

  it('readFifo: the samples between the pointers, red then IR, 18 bits', async () => {
    const chip = new FakeChip();
    const m = new Max30102(chip);
    await m.init();
    chip.regs[0x04] = 2; // write pointer
    chip.regs[0x06] = 0; // read pointer
    chip.fifo = [0x01, 0x23, 0x45, 0xff, 0xff, 0xff, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00];
    assert.deepEqual(await m.readFifo(), [{ red: 0x12345, ir: 0x3ffff }, { red: 1, ir: 0x20000 }]);
  });

  it('readFifo wraps the pointers: write 1, read 31 is 2 samples', async () => {
    const chip = new FakeChip();
    const m = new Max30102(chip);
    await m.init({ mode: 'hr' });
    chip.regs[0x04] = 1;
    chip.regs[0x06] = 31;
    chip.fifo = [0, 0, 1, 0, 0, 2];
    assert.deepEqual(await m.readFifo(), [{ red: 1 }, { red: 2 }]);
  });

  it('readFifo throws on an overflow, the FIFO restarted', async () => {
    const chip = new FakeChip();
    const m = new Max30102(chip);
    await m.init();
    chip.regs[0x05] = 7;
    chip.writes.length = 0;
    await assert.rejects(m.readFifo(), /7 samples lost/);
    assert.deepEqual(chip.writes, [[0x04, 0, 0, 0]]);
  });

  it('temperature: waits for DIE_TEMP_RDY; integer (two\'s complement) plus fraction', async () => {
    assert.equal(await new Max30102(new FakeChip()).temperature(), -1.75);
  });

  it('sleep: SHDN', async () => {
    const chip = new FakeChip();
    await new Max30102(chip).sleep();
    assert.deepEqual(chip.writes, [[0x09, 0x80]]);
  });
});
