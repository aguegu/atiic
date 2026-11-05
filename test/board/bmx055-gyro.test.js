// the BMX055's gyro on a bench: r8845's CH341 on I2C at 400 kHz or on SPI (BENCH_BMX055_SPI), the module at rest
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Gyro } from '../../src/index.js';
import { bmx055Benches } from './bench.js';

const SCL_HZ = 400000;
const SETTLED_MS = 300; // long after any start-up
const GYRO_AGREE = 1; // deg/s: the first reading after init() against a settled one, at rest
const AT_REST_DPS = 5; // at rest, each axis' offset within this (the BMX055's zero-rate offset is about 1 deg/s)

for (const bench of bmx055Benches(Bmx055Gyro, 'gyro', SCL_HZ)) describe(`bmx055 gyro ${bench.label} (board)`, bench.skip, () => {
  let bus, gyro;
  before(async () => {
    const { bus: b, regs, address } = await bench.open();
    bus = b;
    gyro = new Bmx055Gyro(regs, address);
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await gyro.init();
  });

  it('reads near 0 deg/s at rest', async () => {
    const r = (await gyro.measure()).gyroscopes;
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(r[k]) < AT_REST_DPS, `${k}: ${r[k]} deg/s`);
  });

  it('reads a settled gyro right after init() from suspend', async () => {
    await gyro.sleep();
    await gyro.init();
    const first = (await gyro.measure()).gyroscopes;
    await new Promise((resolve) => setTimeout(resolve, SETTLED_MS));
    const later = (await gyro.measure()).gyroscopes;
    for (const k of ['x', 'y', 'z']) {
      assert.ok(Math.abs(first[k] - later[k]) < GYRO_AGREE, `${k}: ${first[k].toFixed(2)} then ${later[k].toFixed(2)} deg/s`);
    }
  });

  it('the same rest at every range', async () => {
    for (const s of Bmx055Gyro.gyroscopeScales) {
      await gyro.init(s);
      const r = (await gyro.measure()).gyroscopes;
      for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(r[k]) < AT_REST_DPS, `±${s}: ${k} ${r[k]} deg/s`);
    }
  });

  it('sleeps', async () => {
    await gyro.sleep();
  });
});
