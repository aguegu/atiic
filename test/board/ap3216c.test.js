// the AP3216C on a bench: Dart-8346's at 0x1E on r8845 at 100 kHz, a room's light
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Ap3216c } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // its I2C: up to 400 kHz; 100 as tried
const AGREE = 0.3; // the widest and the narrowest range agree within this share, or AGREE_LUX
const AGREE_LUX = 1.5; // the widest's step is 0.36 lux: a dim room reads a few counts

describe('ap3216c (board)', onlyWith(Ap3216c), () => {
  let bus, a;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    a = new Ap3216c(bus, addressOf(Ap3216c));
  });

  after(async () => {
    await a?.sleep();
    await bus?.close();
  });

  it('inits: ALS and PS+IR running (mode 3)', async () => {
    await a.init();
    assert.equal((await bus.writeRead(addressOf(Ap3216c), [0x00], 1))[0], 0x03);
  });

  it('measures a room: lux in its range, IR and proximity in 10 bits', async (t) => {
    const m = await a.measure();
    t.diagnostic(JSON.stringify(m));
    assert.ok(m.lux >= 0 && m.lux <= Ap3216c.FULL_SCALE_LUX[0] * 1.2, `${m.lux} lux`);
    assert.ok(m.ir >= 0 && m.ir < 1024 && m.proximity >= 0 && m.proximity < 1024);
  });

  it('the narrowest range reads the same light as the widest', async (t) => {
    const wide = (await a.measure()).lux;
    const narrow = new Ap3216c(bus, addressOf(Ap3216c), { range: 3 });
    await narrow.init();
    const fine = (await narrow.measure()).lux;
    t.diagnostic(`range 0 ${wide.toFixed(2)} lux, range 3 ${fine.toFixed(3)} lux`);
    assert.ok(Math.abs(wide - fine) <= Math.max(AGREE_LUX, AGREE * Math.max(wide, fine)), `${wide} and ${fine} lux`);
    await a.init();
  });
});
