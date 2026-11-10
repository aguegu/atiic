// the MPU-6050 on a bench: r8845's CH341T at 400 kHz, the module at rest
// (not necessarily flat: only the size of gravity is checked)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050 } from '../../src/index.js';
import { gravity, fifo } from './imu.js';
import { onlyWith, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // the MPU-6050's fast mode, its rated top
const SETTLED_MS = 300; // long after any start-up
const GYRO_AGREE = 1; // deg/s: the first reading after init() against a settled one, at rest

describe('mpu6050 (board)', onlyWith(Mpu6050), () => {
  let bus, mpu;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    mpu = new Mpu6050(bus);
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await mpu.init();
  });

  let restG; // |a| at rest, this module's
  it('measures about 1 g at rest (a driver check: not the module\'s calibration), a room temperature', async (t) => {
    restG = await gravity(t, mpu);
  });

  it('reads a settled gyro right after init() from sleep', async () => {
    await mpu.sleep();
    await mpu.init();
    const first = (await mpu.measure()).gyroscopes;
    await new Promise((resolve) => setTimeout(resolve, SETTLED_MS));
    const later = (await mpu.measure()).gyroscopes;
    for (const k of ['x', 'y', 'z']) {
      assert.ok(Math.abs(first[k] - later[k]) < GYRO_AGREE, `${k}: ${first[k].toFixed(1)} then ${later[k].toFixed(1)} deg/s`);
    }
  });

  it('queues 1 kHz samples in its FIFO, none lost, each the module\'s |a| at rest', async (t) => {
    await fifo(t, mpu, restG);
  });

  it('sleeps', async () => {
    await mpu.sleep();
  });
});
