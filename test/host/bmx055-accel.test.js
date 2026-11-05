// the BMX055 accelerometer's driver against a fake one: its registers and
// every write the driver makes
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Accel } from '../../src/index.js';

const ADDRESS = 0x19;

class FakeBmx055Accel {
  constructor(chipId = 0xfa) {
    this.regs = new Uint8Array(0x40);
    this.regs[0x00] = chipId;
    this.writes = [];
  }

  async write(address, bytes) {
    assert.equal(address, ADDRESS);
    this.writes.push(Array.from(bytes));
    const [reg, ...values] = bytes;
    values.forEach((v, i) => { this.regs[reg + i] = v; });
  }

  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    return this.regs.slice(reg, reg + n);
  }

  // a 12-bit count into an axis' two registers, low byte first, at the top of 16
  setAxis(k, count) {
    const raw = (count << 4) & 0xffff;
    this.regs[0x02 + 2 * k] = raw & 0xff;
    this.regs[0x03 + 2 * k] = raw >> 8;
  }
}

describe('bmx055 accelerometer (host)', () => {
  let bus, acc;
  beforeEach(() => {
    bus = new FakeBmx055Accel();
    acc = new Bmx055Accel(bus, ADDRESS);
  });

  it('init: soft reset, the range, 62.5 Hz, normal power', async () => {
    await acc.init('8');
    assert.deepEqual(bus.writes, [
      [0x14, 0xb6], // BGW_SOFTRESET
      [0x0f, 0x08], // PMU_RANGE: +/-8 g
      [0x10, 0x0a], // PMU_BW: a sample every 16 ms
      [0x11, 0x00], // PMU_LPW: normal
    ]);
  });

  it('init refuses another chip, and unknown scales', async () => {
    await assert.rejects(new Bmx055Accel(new FakeBmx055Accel(0xfb), ADDRESS).init(), /chip ID 0xfb, not a BMX055 accelerometer/);
    await assert.rejects(acc.init('6'), /accelerometerScale/);
  });

  it('measure: 12 bits signed, low byte first, to g by the range; the temperature', async () => {
    await acc.init('2'); // 1024 a g
    bus.setAxis(0, 1024);
    bus.setAxis(1, -512);
    bus.setAxis(2, -2048); // the 12 bits' bottom
    bus.regs[0x02] |= 0x01; // the new-data flag in the low bits: ignored
    bus.regs[0x08] = 0xfe; // -2: 22 C
    const r = await acc.measure();
    assert.deepEqual(r.accelerometers, { x: 1, y: -0.5, z: -2 });
    assert.equal(r.temperature, 22);
    await acc.init('16'); // 128 a g
    bus.setAxis(0, 128);
    assert.equal((await acc.measure()).accelerometers.x, 1);
  });

  it('sleep: suspend', async () => {
    await acc.sleep();
    assert.deepEqual(bus.writes.at(-1), [0x11, 0x80]);
  });
});
