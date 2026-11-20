// the MAX30100 driver against a fake chip: its set-up (Tables 3-6, 8, 9),
// the FIFO's IR-then-red samples and pointers, the temperature
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Max30100, Max30102 } from '../../src/index.js';

class FakeMax {
  constructor({ samples = [], ovf = 0, temp = [0x14, 0x09] } = {}) {
    this.regs = new Uint8Array(256);
    this.regs[0xff] = 0x11;
    this.regs[0xfe] = 0x05;
    this.samples = samples;
    this.regs[0x02] = samples.length & 0x0f;
    this.regs[0x03] = ovf;
    this.temp = temp;
    this.log = [];
  }
  async write(address, [reg, ...data]) {
    this.log.push([reg, ...data]);
    if (reg === 0x06 && data[0] & 0x40) { this.regs[0x06] = 0; return; } // RESET: done at once
    if (reg === 0x06 && data[0] & 0x08) { this.regs[0x00] |= 0x40; this.regs.set(this.temp, 0x16); }
    this.regs.set(data, reg);
  }
  async writeRead(address, [reg], n) {
    if (reg === 0x05) return Uint8Array.from(this.samples.flatMap(([ir, red]) => [ir >> 8, ir & 0xff, red >> 8, red & 0xff]).slice(0, n));
    const out = this.regs.slice(reg, reg + n);
    if (reg === 0x00) this.regs[0x00] = 0;
    return out;
  }
}

describe('max30100 (host)', () => {
  it('init: reset, SpO2 config (HI_RES, rate, width), LEDs packed red|IR, TEMP_RDY enabled, pointers cleared, the mode', async () => {
    const f = new FakeMax();
    await new Max30100(f).init({ red: 27.1, ir: 50 });
    assert.deepEqual(f.log, [[0x06, 0x40], [0x07, 0x47], [0x09, 0x8f], [0x01, 0x40], [0x02, 0, 0, 0], [0x06, 0x03]]);
  });

  it('init: Table 6\'s nearest current; Tables 8 and 9 refuse what they don\'t allow', async () => {
    const f = new FakeMax();
    await new Max30100(f).init({ mode: 'hr', sampleRate: 1000, pulseWidth: 400, red: 8, ir: 4 });
    assert.deepEqual(f.log.at(-1), [0x06, 0x02]);
    assert.deepEqual(f.log.find(([r]) => r === 0x09), [0x09, 0x21]);
    await assert.rejects(new Max30100(f).init({ sampleRate: 1000, pulseWidth: 400 }), /1000 a second with 400 us: 400 at most in spo2 mode/);
    await assert.rejects(new Max30100(f).init({ sampleRate: 200, pulseWidth: 1600 }), /100 at most/);
    await assert.rejects(new Max30100(f).init({ red: 60 }), /red LED 60 mA: 0-50/);
  });

  it('init refuses a MAX30102 (part ID 0x15), and the MAX30102\'s ID is not this one\'s', async () => {
    const f = new FakeMax();
    f.regs[0xff] = 0x15;
    await assert.rejects(new Max30100(f).init(), /part ID 0x15, not a MAX30100/);
    assert.notEqual(Max30100.chip.whoAmI, Max30102.chip.whoAmI);
  });

  it('readFifo: IR then red, 16 bits each; hr mode IR alone; an overflow throws and clears', async () => {
    const f = new FakeMax({ samples: [[0x1234, 0x0567], [0xffff, 0x0001]] });
    const m = new Max30100(f);
    await m.init();
    f.regs[0x02] = 2;
    assert.deepEqual(await m.readFifo(), [{ ir: 0x1234, red: 0x0567 }, { ir: 0xffff, red: 0x0001 }]);
    m.mode = 'hr';
    assert.deepEqual(await m.readFifo(), [{ ir: 0x1234 }, { ir: 0xffff }]);
    f.regs[0x03] = 3;
    await assert.rejects(m.readFifo(), /overflowed: 3 samples lost/);
  });

  it('temperature: TEMP_EN with the mode kept; integer plus sixteenths, a negative integer too', async () => {
    const f = new FakeMax({ temp: [0x14, 0x09] });
    const m = new Max30100(f);
    await m.init();
    assert.equal(await m.temperature(), 20.5625);
    assert.deepEqual(f.log.filter(([r]) => r === 0x06).at(-1), [0x06, 0x0b]);
    f.temp = [0x80, 0x08];
    assert.equal(await m.temperature(), -127.5);
  });

  it('sleep: SHDN, the mode kept', async () => {
    const f = new FakeMax();
    const m = new Max30100(f);
    await m.init();
    await m.sleep();
    assert.deepEqual(f.log.at(-1), [0x06, 0x83]);
  });
});
