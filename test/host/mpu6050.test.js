// the MPU-6050 driver against a fake one on a fake bus: its registers, its
// FIFO, and every write the driver makes
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050 } from '../../src/index.js';

const ADDRESS = 0x68;
const REG_FIFO_COUNT_H = 0x72;
const REG_FIFO_R_W = 0x74;
const REG_WHO_AM_I = 0x75;

class FakeMpu6050 {
  constructor() {
    this.regs = new Uint8Array(128);
    this.regs[REG_WHO_AM_I] = 0x68;
    this.fifo = [];
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
    if (reg === REG_FIFO_R_W) return Uint8Array.from(this.fifo.splice(0, n));
    if (reg === REG_FIFO_COUNT_H) return Uint8Array.of(this.fifo.length >> 8, this.fifo.length & 0xff);
    return this.regs.slice(reg, reg + n);
  }

  // big-endian int16s into consecutive registers
  set(reg, values) {
    values.forEach((v, i) => {
      this.regs[reg + 2 * i] = (v >> 8) & 0xff;
      this.regs[reg + 2 * i + 1] = v & 0xff;
    });
  }

  queue(values) {
    for (const v of values) this.fifo.push((v >> 8) & 0xff, v & 0xff);
  }
}

describe('mpu6050 (host)', () => {
  let bus, mpu;
  beforeEach(() => {
    bus = new FakeMpu6050();
    mpu = new Mpu6050(bus);
  });

  it('init: awake, then the four config registers in one burst', async () => {
    await mpu.init('2000', '16');
    assert.deepEqual(bus.writes, [
      [0x6b, 0x00], // PWR_MGMT_1: awake
      [0x19, 0x0f, 0x04, 3 << 3, 3 << 3], // SMPLRT_DIV 62.5 Hz, DLPF 20 Hz, FS_SEL, AFS_SEL
    ]);
  });

  it('init refuses a chip that is not an MPU-6050, and unknown scales', async () => {
    bus.regs[REG_WHO_AM_I] = 0x71;
    await assert.rejects(mpu.init(), /WHO_AM_I 0x71/);
    await assert.rejects(mpu.init('300'), /gyroscopeScale/);
    await assert.rejects(mpu.init('500', '3'), /accelerometerScale/);
  });

  it('measure: big-endian counts to g, degrees C and deg/s at the scales chosen', async () => {
    await mpu.init('500', '4'); // 65.5 LSB a deg/s, 8192 a g
    bus.set(0x3b, [8192, -4096, 0, -340, 655, -131, 0]);
    const r = await mpu.measure();
    assert.deepEqual(r.accelerometers, { x: 1, y: -0.5, z: 0 });
    assert.ok(Math.abs(r.temperature - 35.53) < 1e-9);
    assert.deepEqual(r.gyroscopes, { x: 10, y: -2, z: 0 });
  });

  it('sleep sets PWR_MGMT_1 SLEEP', async () => {
    await mpu.sleep();
    assert.deepEqual(bus.writes.at(-1), [0x6b, 0x40]);
  });

  it('FIFO: started reset and on, whole frames parsed, a partial one left', async () => {
    await mpu.init('250', '2'); // 131 a deg/s, 16384 a g
    bus.writes = [];
    await mpu.startFifo(); // accel + gyro, 1 kHz
    assert.equal(mpu.sampleRate, 1000);
    assert.deepEqual(bus.writes, [
      [0x19, 0x00, 0x04], // SMPLRT_DIV 0, DLPF on
      [0x23, 0x78], // FIFO_EN: XG YG ZG ACCEL
      [0x6a, 0x04], // USER_CTRL: FIFO_RESET
      [0x6a, 0x40], // USER_CTRL: FIFO_EN
    ]);
    bus.queue([16384, 0, 0, 131, 0, -262]);
    bus.queue([0, 16384, 0, 0, 0, 0]);
    bus.queue([1, 2, 3]); // half a frame: stays queued
    const samples = await mpu.readFifo();
    assert.deepEqual(samples, [
      { accelerometers: { x: 1, y: 0, z: 0 }, gyroscopes: { x: 1, y: 0, z: -2 } },
      { accelerometers: { x: 0, y: 1, z: 0 }, gyroscopes: { x: 0, y: 0, z: 0 } },
    ]);
    assert.equal(bus.fifo.length, 6);
    assert.deepEqual(await mpu.readFifo(), []);
  });

  it('FIFO: gyro alone at 4 kHz, the filter off', async () => {
    await mpu.init();
    await mpu.startFifo({ accelerometers: false, filter: false, divider: 1 });
    assert.equal(mpu.sampleRate, 4000);
    assert.equal(mpu.fifoFrame, 6);
    assert.deepEqual(bus.regs.slice(0x19, 0x1b), Uint8Array.of(0x01, 0x00));
    assert.equal(bus.regs[0x23], 0x70);
  });

  it('FIFO: full means overflowed: it throws and restarts the FIFO', async () => {
    await mpu.init();
    await mpu.startFifo();
    bus.fifo = new Array(1024).fill(0);
    bus.writes = [];
    await assert.rejects(mpu.readFifo(), /overflowed/);
    assert.deepEqual(bus.writes, [[0x6a, 0x04], [0x6a, 0x40]]);
  });

  it('stopFifo: off, and back to the driver\'s 62.5 Hz with the filter', async () => {
    await mpu.init();
    await mpu.startFifo({ filter: false });
    bus.writes = [];
    await mpu.stopFifo();
    assert.deepEqual(bus.writes, [[0x6a, 0x00], [0x23, 0x00], [0x19, 0x0f, 0x04]]);
  });
});
