// the MPU-6500 over SPI on a bench: r8845's GY-9250 on the CH341A (SCL to
// SCK, SDA to MOSI, AD0 to MISO, NCS on BENCH_MPU6500_SPI's cs), atiic's
// Mpu6500 driver unchanged on SpiRegisters. At rest (not necessarily flat:
// only the size of gravity is checked)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6500, SpiRegisters } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { MPU6500_SPI } from './bench.js';

const FIFO_TEST_MS = 300;
const G_MIN = 0.9;
const G_MAX = 1.1;
const SETTLED_MS = 300;
const GYRO_AGREE = 1; // deg/s

describe('mpu6500 over SPI (board)', { skip: MPU6500_SPI ? false : 'no BENCH_MPU6500_SPI: no MPU-6500 on the SPI' }, () => {
  let bus, spi, mpu;
  before(async () => {
    bus = await openCh341();
    spi = await new SpiRegisters(bus, MPU6500_SPI).open();
    mpu = new Mpu6500(spi);
  });

  after(async () => {
    await bus?.close();
  });

  it('inits (its WHO_AM_I over SPI)', async () => {
    await mpu.init();
  });

  it('measures about 1 g at rest, a room temperature', async () => {
    const r = await mpu.measure();
    const g = Math.hypot(r.accelerometers.x, r.accelerometers.y, r.accelerometers.z);
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
    await mpu.startFifo();
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
