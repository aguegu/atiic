// the BMX055 gyro's driver against a fake one: its registers and every
// write the driver makes
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Gyro } from '../../src/index.js';

const ADDRESS = 0x69;

class FakeBmx055Gyro {
  constructor(chipId = 0x0f) {
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

  setAxis(k, count) {
    const raw = count & 0xffff;
    this.regs[0x02 + 2 * k] = raw & 0xff;
    this.regs[0x03 + 2 * k] = raw >> 8;
  }
}

// no real waiting on the host
class Quick extends Bmx055Gyro {
  static chip = { ...Bmx055Gyro.chip, settleMs: 0 };
}

describe('bmx055 gyro (host)', () => {
  let bus, gyro;
  beforeEach(() => {
    bus = new FakeBmx055Gyro();
    gyro = new Quick(bus, ADDRESS);
  });

  it('init: soft reset, the range, 100 Hz with its 32 Hz filter, normal power', async () => {
    await gyro.init('250');
    assert.deepEqual(bus.writes, [
      [0x14, 0xb6], // BGW_SOFTRESET
      [0x0f, 0x03], // RANGE: +/-250 deg/s
      [0x10, 0x07], // BW: 100 Hz, 32 Hz filter
      [0x11, 0x00], // LPM1: normal
    ]);
  });

  it('init refuses another chip (an MPU-6050 at the same address), and unknown scales', async () => {
    await assert.rejects(new Quick(new FakeBmx055Gyro(0x68), ADDRESS).init(), /chip ID 0x68, not a BMX055 gyro/);
    await assert.rejects(gyro.init('300'), /gyroscopeScale/);
  });

  it('measure: 16 bits signed, low byte first, to deg/s by the range (Table 29)', async () => {
    await gyro.init('2000'); // 16.4 a deg/s
    bus.setAxis(0, 164);
    bus.setAxis(1, -1640);
    bus.setAxis(2, 0);
    const r = (await gyro.measure()).gyroscopes;
    [[r.x, 10], [r.y, -100], [r.z, 0]].forEach(([got, want]) => assert.ok(Math.abs(got - want) < 1e-9, `${got} vs ${want}`));
    await gyro.init('125'); // 262.4 a deg/s
    bus.setAxis(0, 2624);
    assert.ok(Math.abs((await gyro.measure()).gyroscopes.x - 10) < 1e-9);
  });

  it('sleep: suspend', async () => {
    await gyro.sleep();
    assert.deepEqual(bus.writes.at(-1), [0x11, 0x80]);
  });
});
