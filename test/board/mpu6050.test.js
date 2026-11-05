// the MPU-6050 on a bench: r8845's CH341T at 400 kHz, the module at rest
// (not necessarily flat: only the size of gravity is checked)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050 } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { onlyWith, sclFor } from './bench.js';

const SCL_HZ = 400000; // the MPU-6050's fast mode, its rated top
const FIFO_TEST_MS = 300;
const G_MIN = 0.9;
const G_MAX = 1.1;
const SETTLED_MS = 300; // long after any start-up
const GYRO_AGREE = 1; // deg/s: the first reading after init() against a settled one, at rest

describe('mpu6050 (board)', onlyWith(Mpu6050), () => {
  let bus, mpu;
  before(async () => {
    bus = await openCh341(sclFor(SCL_HZ));
    mpu = new Mpu6050(bus);
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await mpu.init();
  });

  it('measures about 1 g at rest, a room temperature', async () => {
    const r = await mpu.measure();
    const { x, y, z } = r.accelerometers;
    const g = Math.hypot(x, y, z);
    assert.ok(g > G_MIN && g < G_MAX, `|a| ${g} g`);
    assert.ok(r.temperature > 0 && r.temperature < 50, `${r.temperature} C`);
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

  it('queues 1 kHz samples in its FIFO, none lost', async () => {
    await mpu.startFifo(); // accel + gyro, 1 kHz
    const t0 = performance.now();
    const samples = [];
    while (performance.now() - t0 < FIFO_TEST_MS) samples.push(...await mpu.readFifo());
    const ms = performance.now() - t0;
    await mpu.stopFifo();
    assert.ok(samples.length >= ms * 0.95 && samples.length <= ms * 1.05 + 1, `${samples.length} in ${ms.toFixed(0)} ms`);
    for (const { accelerometers: { x, y, z } } of samples) {
      const g = Math.hypot(x, y, z);
      assert.ok(g > G_MIN && g < G_MAX, `|a| ${g} g`);
    }
  });

  it('sleeps', async () => {
    await mpu.sleep();
  });
});
