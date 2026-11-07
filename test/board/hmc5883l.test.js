// the HMC5883L on a bench: r8845's CH341 at 400 kHz, the module at rest on
// a desk: Earth's field, whatever the heading
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hmc5883l } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // its fast mode
// Earth's field is 25-65 uT over its surface; a room's steel bends it, so a little wider
const EARTH_MIN_UT = 20;
const EARTH_MAX_UT = 80;
const AGREE_UT = 3; // two readings a second apart, at rest (its noise: 2 mG = 0.2 uT)
const size = ({ x, y, z }) => Math.hypot(x, y, z);
const fmt = (m) => `${m.x?.toFixed(1)} ${m.y?.toFixed(1)} ${m.z?.toFixed(1)}`;

describe('hmc5883l (board)', onlyWith(Hmc5883l), () => {
  let bus, mag;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    mag = new Hmc5883l(bus, addressOf(Hmc5883l));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await mag.init();
  });

  it('reads Earth\'s field at rest', async () => {
    const m = (await mag.measure()).magnetometers;
    for (const k of ['x', 'y', 'z']) assert.notEqual(m[k], null, `${k} overflowed`);
    assert.ok(size(m) > EARTH_MIN_UT && size(m) < EARTH_MAX_UT, `|B| ${size(m).toFixed(1)} uT (${fmt(m)})`);
  });

  it('two readings a second apart agree', async () => {
    const a = (await mag.measure()).magnetometers;
    await new Promise((r) => setTimeout(r, 1000));
    const b = (await mag.measure()).magnetometers;
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a[k] - b[k]) < AGREE_UT, `${k}: ${a[k]} then ${b[k]} uT`);
  });

  it('passes its self test (both biases), then reads the field again', async () => {
    const r = await mag.selfTest();
    assert.ok(r.pass, `positive ${JSON.stringify(r.positive)} negative ${JSON.stringify(r.negative)}`);
    const m = (await mag.measure()).magnetometers;
    assert.ok(size(m) > EARTH_MIN_UT && size(m) < EARTH_MAX_UT, `after: |B| ${size(m).toFixed(1)} uT (${fmt(m)})`);
  });

  it('sleeps', async () => {
    await mag.sleep();
  });
});
