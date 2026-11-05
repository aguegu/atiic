// the BMX055's accelerometer on a bench: r8845's CH341T at 400 kHz, the
// module at rest (only the size of gravity checked, at any tilt)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Accel } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { onlyWith, addressOf } from './bench.js';

const SCL_HZ = 400000;
const G_MIN = 0.9;
const G_MAX = 1.1;
const g = ({ x, y, z }) => Math.hypot(x, y, z);

describe('bmx055 accelerometer (board)', onlyWith(Bmx055Accel), () => {
  let bus, acc;
  before(async () => {
    bus = await openCh341(SCL_HZ);
    acc = new Bmx055Accel(bus, addressOf(Bmx055Accel));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits', async () => {
    await acc.init();
  });

  it('measures about 1 g at rest, a room temperature', async () => {
    const r = await acc.measure();
    assert.ok(g(r.accelerometers) > G_MIN && g(r.accelerometers) < G_MAX, `|a| ${g(r.accelerometers)} g`);
    assert.ok(r.temperature > 0 && r.temperature < 50, `${r.temperature} C`);
  });

  it('reads right straight after init() from suspend', async () => {
    await acc.sleep();
    await acc.init();
    const r = await acc.measure();
    assert.ok(g(r.accelerometers) > G_MIN && g(r.accelerometers) < G_MAX, `|a| ${g(r.accelerometers)} g`);
  });

  it('the same 1 g at every range', async () => {
    for (const s of Bmx055Accel.accelerometerScales) {
      await acc.init(s);
      const a = g((await acc.measure()).accelerometers);
      assert.ok(a > G_MIN && a < G_MAX, `±${s} g: |a| ${a} g`);
    }
  });

  it('sleeps', async () => {
    await acc.sleep();
  });
});
