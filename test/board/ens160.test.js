// the ENS160 on a bench: Dart-8346's on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Ens160 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the ENS160's I2C: up to 1 MHz (14.1); 100 as tried
const AQI = [1, 5]; // the UBA's index (16.2.8)

describe('ens160 (board)', onlyWith(Ens160), () => {
  let bus, e;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    e = new Ens160(bus, addressOf(Ens160));
  });

  after(async () => {
    await e?.sleep();
    await bus?.close();
  });

  it('inits: the standard mode running (STATAS), its first data', async (t) => {
    const started = Date.now();
    await e.init();
    t.diagnostic(`first data in ${Date.now() - started} ms`);
    assert.ok((await e.status()) & 0x80);
  });

  it('measures a room: AQI 1-5, some TVOC and eCO2, a validity flag', async (t) => {
    const m = await e.measure();
    t.diagnostic(JSON.stringify(m));
    assert.ok(m.aqi >= AQI[0] && m.aqi <= AQI[1], `AQI ${m.aqi}`);
    assert.ok(Ens160.VALIDITY.includes(m.validity));
    assert.ok(m.tvoc >= 0 && m.tvoc <= 0xffff && m.eco2 >= 0 && m.eco2 <= 0xffff);
  });

  it('compensate: DATA_T and DATA_RH read back what TEMP_IN and RH_IN were given', async () => {
    await e.compensate(21.5, 40.25);
    const c = await e.compensation();
    assert.ok(Math.abs(c.temperature - 21.5) < 1 / 32, `${c.temperature} C`);
    assert.ok(Math.abs(c.humidity - 40.25) < 1 / 256, `${c.humidity} %`);
  });

  it('new data comes again (NEWDAT) within its limit', async () => {
    await e.measure(); // NEWDAT cleared
    const started = Date.now();
    while (!((await e.status()) & 0x02)) {
      assert.ok(Date.now() - started < 5000, 'no new data in 5 s');
      await new Promise((r) => setTimeout(r, 50));
    }
  });
});
