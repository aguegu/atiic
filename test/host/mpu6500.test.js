// the MPU-6500 driver against a fake one: what differs from the MPU-6050
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050, Mpu6500 } from '../../src/index.js';
import FakeMpu from './fake-mpu.js';

describe('mpu6500 (host)', () => {
  let bus, mpu;
  beforeEach(() => {
    bus = new FakeMpu(0x70);
    mpu = new Mpu6500(bus);
  });

  it('init: the burst goes on to ACCEL_CONFIG2, the accel filter as the gyro\'s', async () => {
    await mpu.init('2000', '16');
    assert.deepEqual(bus.writes, [
      [0x6b, 0x00], // PWR_MGMT_1: awake
      [0x19, 0x0f, 0x04, 3 << 3, 3 << 3, 0x04], // ... ACCEL_CONFIG, ACCEL_CONFIG2: 20 Hz
    ]);
  });

  it('each driver takes only its own chip', async () => {
    await assert.rejects(new Mpu6500(new FakeMpu(0x68)).init(), /WHO_AM_I 0x68, not an MPU-6500/);
    await assert.rejects(new Mpu6050(new FakeMpu(0x70)).init(), /WHO_AM_I 0x70, not an MPU-6050/);
  });

  it('the temperature: raw / 333.87 + 21', async () => {
    await mpu.init();
    bus.set(0x41, [0]);
    assert.equal((await mpu.measure()).temperature, 21);
    bus.set(0x41, [3728]); // r8845's GY-9250 at rest
    assert.ok(Math.abs((await mpu.measure()).temperature - 32.166) < 0.001);
  });

  it('the FIFO: full at 512 bytes', async () => {
    await mpu.init();
    await mpu.startFifo();
    bus.fifo = new Array(510).fill(0); // under: whole frames read
    assert.equal((await mpu.readFifo()).length, 42);
    bus.fifo = new Array(512).fill(0);
    await assert.rejects(mpu.readFifo(), /MPU-6500 FIFO overflowed/);
  });

  it('the filter off: 8 kHz only, SMPLRT_DIV ignored (seen on r8845: 2 kHz asked, ~4400 a second)', async () => {
    await mpu.init();
    await mpu.startFifo({ accelerometers: false, filter: false });
    assert.equal(mpu.sampleRate, 8000);
    await assert.rejects(mpu.startFifo({ accelerometers: false, filter: false, divider: 1 }), /the MPU-6500 ignores SMPLRT_DIV with the filter off/);
    await mpu.startFifo({ divider: 3 }); // with the filter: 1 kHz / 4
    assert.equal(mpu.sampleRate, 250);
  });

  it('the rest as the MPU-6050: scales, addresses', () => {
    assert.deepEqual(Mpu6500.addresses, [0x68, 0x69]);
    assert.deepEqual(Mpu6500.gyroscopeScales, Mpu6050.gyroscopeScales);
  });
});
