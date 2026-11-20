// the SGP30 on a bench: Dart-8346's at 0x58 on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sgp30 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // its I2C: up to 400 kHz; 100 as tried
const PERIOD_MS = 1000; // measure_iaq once a second (its datasheet)
const RUN_S = Sgp30.INIT_S + 5; // past its fixed first 15 s
const ROOM_CO2EQ = [400, 2000]; // ppm: a room's (400 its floor)
const ROOM_TVOC = [0, 2000]; // ppb

describe('sgp30 (board)', onlyWith(Sgp30), () => {
  let bus, s;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    s = new Sgp30(bus, addressOf(Sgp30));
  });

  after(async () => {
    await bus?.close();
  });

  it('reads its serial number and feature set (product type 0)', async (t) => {
    const n = await s.serial();
    const f = await s.featureSet();
    t.diagnostic(`serial 0x${n.toString(16).padStart(12, '0')}, feature set 0x${f.toString(16).padStart(4, '0')}`);
    assert.ok(n > 0 && n < 2 ** 48);
    assert.equal(f >> 12, 0);
  });

  it('passes its self test (before init)', async () => {
    const r = await s.selfTest();
    assert.equal(r.passed, true, `0x${r.result.toString(16)}`);
  });

  it(`inits; 400 ppm and 0 ppb at first, a room's after its ${Sgp30.INIT_S} s; the raw signals within 16 bits`, { timeout: (RUN_S + 10) * 1000 }, async (t) => {
    await s.init();
    const got = [];
    for (let i = 0; i < RUN_S; i++) {
      const t0 = Date.now();
      got.push(await s.measure());
      await new Promise((r) => setTimeout(r, Math.max(0, PERIOD_MS - (Date.now() - t0))));
    }
    t.diagnostic(got.map((g) => `${g.co2eq}/${g.tvoc}`).join(' '));
    assert.deepEqual(got[0], { co2eq: 400, tvoc: 0 });
    const last = got.at(-1);
    assert.ok(last.co2eq >= ROOM_CO2EQ[0] && last.co2eq <= ROOM_CO2EQ[1], `${last.co2eq} ppm`);
    assert.ok(last.tvoc >= ROOM_TVOC[0] && last.tvoc <= ROOM_TVOC[1], `${last.tvoc} ppb`);
    const { h2, ethanol } = await s.raw();
    t.diagnostic(`raw H2 ${h2}, ethanol ${ethanol}`);
    assert.ok(h2 > 0 && h2 < 65535 && ethanol > 0 && ethanol < 65535);
  });

  it('its baseline reads back and sets back (CRCs checked both ways)', async () => {
    const b = await s.baseline();
    await s.setBaseline(b);
    assert.ok(b.co2eq > 0 && b.tvoc > 0, JSON.stringify(b));
  });
});
