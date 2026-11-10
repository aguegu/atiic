// the SPL06 on a bench: BENCH_ADAPTER's bus at 400 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Spl06 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // up to 3.4 MHz (its datasheet); 400 kHz as the adapters go
const PRESSURE_PA = [30000, 110000]; // its operating range, 300-1100 hPa
const ROOM_C = [5, 45];
const READINGS = 5;
// a still room's spread at indoor (16 times: 1.2 Pa RMS in Table 8); r8845: 0.9 Pa
const STILL_SD_PA = 5;
// readings across mode changes agree within this (r8845: 1020.04-1020.13 hPa);
// a stale result from the old mode read 833 hPa
const MODES_AGREE_PA = 50;

const sd = (a) => { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

describe('spl06 (board)', onlyWith(Spl06), () => {
  let bus, s;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    s = new Spl06(bus, addressOf(Spl06));
  });

  after(async () => {
    await s?.sleep();
    await bus?.close();
  });

  it('inits: a reset, its coefficients, indoor', async () => {
    await s.init();
    assert.ok(s.coef.c00 !== 0 || s.coef.c10 !== 0, 'coefficients read');
  });

  it(`${READINGS} readings at indoor: in range, a room, still`, async (t) => {
    const r = [];
    for (let i = 0; i < READINGS; i++) r.push(await s.measure());
    const ps = r.map((x) => x.pressure);
    t.diagnostic(`${(ps[0] / 100).toFixed(2)} hPa, sd ${sd(ps).toFixed(2)} Pa, ${r[0].temperature.toFixed(2)} C`);
    for (const x of r) {
      assert.ok(x.pressure > PRESSURE_PA[0] && x.pressure < PRESSURE_PA[1], `${x.pressure} Pa`);
      assert.ok(x.temperature > ROOM_C[0] && x.temperature < ROOM_C[1], `${x.temperature} C`);
    }
    assert.ok(sd(ps) < STILL_SD_PA, `sd ${sd(ps)} Pa`);
  });

  it('every mode, changed back and forth: no reading from the mode before', async () => {
    const ps = [];
    for (const mode of ['weather', 'sports', 'indoor', 'weather', 'sports']) {
      await s.configure({ mode });
      for (let i = 0; i < 2; i++) ps.push((await s.measure()).pressure);
    }
    assert.ok(Math.max(...ps) - Math.min(...ps) < MODES_AGREE_PA, `${Math.min(...ps)} to ${Math.max(...ps)} Pa`);
  });
});
