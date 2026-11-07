// the ADXL345 on a bench: r8845's CH341 at 400 kHz, the module at rest on
// a desk: 1 g, whatever its tilt
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Adxl345 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // its fast mode
// |a| at rest: 1 g; its sensitivity is 230-282 LSb/g (Table 1), the
// offsets up to 0.15 g (X, Y) and 0.25 g (Z)
const ONE_G_MIN = 0.8;
const ONE_G_MAX = 1.2;
const AGREE_G = 0.05; // two readings a second apart, at rest (noise 0.75-1.1 LSb rms)
const size = ({ x, y, z }) => Math.hypot(x, y, z);
const fmt = (a) => `${a.x.toFixed(3)} ${a.y.toFixed(3)} ${a.z.toFixed(3)}`;

describe('adxl345 (board)', onlyWith(Adxl345), () => {
  let bus, acc;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    acc = new Adxl345(bus, addressOf(Adxl345));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await acc.init();
  });

  it('reads 1 g at rest', async () => {
    const a = (await acc.measure()).accelerometers;
    assert.ok(size(a) > ONE_G_MIN && size(a) < ONE_G_MAX, `|a| ${size(a).toFixed(3)} g (${fmt(a)})`);
  });

  it('two readings a second apart agree', async () => {
    const a = (await acc.measure()).accelerometers;
    await new Promise((r) => setTimeout(r, 1000));
    const b = (await acc.measure()).accelerometers;
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a[k] - b[k]) < AGREE_G, `${k}: ${a[k]} then ${b[k]} g`);
  });

  it('passes its self test (3.3 V), then reads 1 g again', async () => {
    const r = await acc.selfTest();
    assert.ok(r.pass, `change ${JSON.stringify(r.change)} limits ${JSON.stringify(r.limits)}`);
    const a = (await acc.measure()).accelerometers;
    assert.ok(size(a) > ONE_G_MIN && size(a) < ONE_G_MAX, `after: |a| ${size(a).toFixed(3)} g (${fmt(a)})`);
  });

  it('sleeps', async () => {
    await acc.sleep();
  });
});
