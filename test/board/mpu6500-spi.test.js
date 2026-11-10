// the MPU-6500 over SPI on a bench: r8845's GY-9250 on the CH341A (SCL to
// SCK, SDA to MOSI, AD0 to MISO, NCS on BENCH_MPU6500_SPI's cs), atiic's
// Mpu6500 driver unchanged on SpiRegisters. At rest (not necessarily flat:
// only the size of gravity is checked)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6500, SpiRegisters } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { MPU6500_SPI } from './bench.js';
import { gravity, fifo } from './imu.js';

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
