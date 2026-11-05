// the BMX055's magnetometer on a bench: r8845's CH341T at 400 kHz, the
// module at rest on a desk: Earth's field, whatever the heading
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Mag } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { onlyWith, addressOf } from './bench.js';

const SCL_HZ = 400000;
// Earth's field is 25-65 uT over its surface; a room's steel bends it, so a little wider
const EARTH_MIN_UT = 20;
const EARTH_MAX_UT = 80;
const AGREE_UT = 3; // the first reading after init() against one a second later, at rest (the regular preset's noise: 0.6 uT rms)
const SETTLED_MS = 1000;
const size = ({ x, y, z }) => Math.hypot(x, y, z);

describe('bmx055 magnetometer (board)', onlyWith(Bmx055Mag), () => {
  let bus, mag;
  before(async () => {
    bus = await openCh341(SCL_HZ);
    mag = new Bmx055Mag(bus, addressOf(Bmx055Mag));
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
    assert.ok(size(m) > EARTH_MIN_UT && size(m) < EARTH_MAX_UT, `|B| ${size(m).toFixed(1)} uT (${m.x.toFixed(1)} ${m.y.toFixed(1)} ${m.z.toFixed(1)})`);
  });

  it('reads right straight after init() from suspend', async () => {
    await mag.sleep();
    await mag.init();
    const first = (await mag.measure()).magnetometers;
    await new Promise((resolve) => setTimeout(resolve, SETTLED_MS));
    const later = (await mag.measure()).magnetometers;
    for (const k of ['x', 'y', 'z']) {
      assert.ok(first[k] !== null && Math.abs(first[k] - later[k]) < AGREE_UT, `${k}: ${first[k]?.toFixed(2)} then ${later[k].toFixed(2)} uT`);
    }
  });

  it('sleeps', async () => {
    await mag.sleep();
  });
});
