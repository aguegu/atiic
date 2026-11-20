// the SGP40 on a bench: Dart-8346's at 0x59 on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sgp40 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // its I2C: up to 400 kHz; 100 as tried
const PERIOD_MS = 1000; // a measurement a second (Table 1)
const READINGS = 10;
const STEADY = 0.05; // a still room: the last readings within this share of each other

describe('sgp40 (board)', onlyWith(Sgp40), () => {
  let bus, s;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    s = new Sgp40(bus, addressOf(Sgp40));
  });

  after(async () => {
    await s?.sleep();
    await bus?.close();
  });

  it('reads its serial number', async (t) => {
    const n = await s.serial();
    t.diagnostic(`serial 0x${n.toString(16).padStart(12, '0')}`);
    assert.ok(n > 0 && n < 2 ** 48);
  });

  it('passes its self test', async () => {
    const r = await s.selfTest();
    assert.equal(r.passed, true, `0x${r.result.toString(16)}`);
  });

  it(`measures ${READINGS} raw signals a second apart; the hotplate settles to a steady signal`, async (t) => {
    const raws = [];
    for (let i = 0; i < READINGS; i++) {
      const t0 = Date.now();
      raws.push((await s.measure()).raw);
      await new Promise((r) => setTimeout(r, Math.max(0, PERIOD_MS - (Date.now() - t0))));
    }
    t.diagnostic(raws.join(' '));
    const tail = raws.slice(-3);
    assert.ok(Math.max(...tail) - Math.min(...tail) <= STEADY * Math.max(...tail), tail.join(' '));
    // the first after the hotplate comes on: 0 on ours
    assert.ok(raws.slice(1).every((r) => r > 0 && r < 65535), raws.join(' '));
  });

  it('with a humidity and temperature it still measures (compensation on)', async () => {
    const { raw } = await s.measure({ humidity: 45, temperature: 22 });
    assert.ok(raw > 0 && raw < 65535, `${raw}`);
  });
});
