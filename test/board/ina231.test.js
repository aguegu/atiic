// the INA231 on a bench: r8845's CH341T, a module with its 0.1 ohm shunt
// in whatever circuit it's wired into (r8845: ~4.85 V on its bus, ~14 mA)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Ina231 } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { onlyWith, addressOf, sclFor } from './bench.js';

const SCL_HZ = 400000;
const CONVERSION_MS = 5; // shunt and bus, 1.1 ms each: a fresh pair after the reset
const AGREE = 0.02; // the chip's current against shunt / R, relative

describe('ina231 (board)', onlyWith(Ina231), () => {
  let bus, ina;
  before(async () => {
    bus = await openCh341(sclFor(SCL_HZ));
    ina = new Ina231(bus, addressOf(Ina231));
  });

  after(async () => {
    await ina?.sleep();
    await bus?.close();
  });

  it('inits (reset, continuous, its calibration)', async () => {
    await ina.init();
    await new Promise((r) => setTimeout(r, CONVERSION_MS));
  });

  it('its current agrees with its shunt voltage over the shunt; its power with V x I', async () => {
    const r = await ina.measure();
    assert.ok(r.bus >= 0 && r.bus < 28, `${r.bus} V`);
    const byOhm = r.shunt / ina.shunt;
    if (Math.abs(byOhm) > 0.001) {
      assert.ok(Math.abs(r.current - byOhm) <= Math.abs(byOhm) * AGREE + ina.currentLsb, `${r.current} A against ${byOhm} A`);
      assert.ok(Math.abs(r.power - r.bus * r.current) <= Math.abs(r.bus * r.current) * AGREE + 25 * ina.currentLsb, `${r.power} W against ${r.bus * r.current} W`);
    }
  });
});
