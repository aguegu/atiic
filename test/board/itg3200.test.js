// the ITG-3200 on a bench: r8845's CH341 at 400 kHz, the module at rest on
// a desk: no rotation but its zero-rate offset, a room's temperature
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Itg3200 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // its fast mode
const ZRO_DPS = 40; // the initial zero-rate tolerance, each axis (1.7, 3.1)
const AGREE_DPS = 3; // two readings a second apart, at rest (noise 0.38 deg/s rms at 98 Hz)
const fmt = (g) => `${g.x.toFixed(2)} ${g.y.toFixed(2)} ${g.z.toFixed(2)}`;

describe('itg3200 (board)', onlyWith(Itg3200), () => {
  let bus, gyro;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    gyro = new Itg3200(bus, addressOf(Itg3200));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await gyro.init();
  });

  it('reads no rotation at rest (within its zero-rate offset), a room\'s temperature', async () => {
    const { gyroscopes: g, temperature } = await gyro.measure();
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(g[k]) < ZRO_DPS, `${k}: ${g[k]} deg/s (${fmt(g)})`);
    assert.ok(temperature > 5 && temperature < 50, `${temperature} C`);
  });

  it('two readings a second apart agree', async () => {
    const a = (await gyro.measure()).gyroscopes;
    await new Promise((r) => setTimeout(r, 1000));
    const b = (await gyro.measure()).gyroscopes;
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a[k] - b[k]) < AGREE_DPS, `${k}: ${a[k]} then ${b[k]} deg/s`);
  });

  it('sleeps, then inits again (asleep its WHO_AM_I reads 0)', async () => {
    await gyro.sleep();
    await gyro.init();
    const { temperature } = await gyro.measure();
    assert.ok(temperature > 5 && temperature < 50, `${temperature} C`);
  });

  it('sleeps', async () => {
    await gyro.sleep();
  });
});
