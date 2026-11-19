// the CHT8305C on a bench: Dart-8346's on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Cht8305 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the CHT8305C's I2C: up to 400 kHz; 100 as tried
const AGREE_C = 0.5; // two readings a second apart, at rest
const AGREE_RH = 2;
const LIMIT_STEP_RH = 0.8; // the limits' steps: 0.78 % and 0.32 C
const LIMIT_STEP_C = 0.33;

describe('cht8305 (board)', onlyWith(Cht8305), () => {
  let bus, c;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    c = new Cht8305(bus, addressOf(Cht8305));
  });

  after(async () => {
    await c?.init();
    await bus?.close();
  });

  it('inits (a soft reset): the defaults, 0x1000 and limits 80 % / 60 C; its supply not low', async () => {
    await c.init();
    assert.equal(await c.config(), 0x1000);
    const l = await c.alertLimits();
    assert.ok(Math.abs(l.humidity - 80) < LIMIT_STEP_RH && Math.abs(l.temperature - 60) < LIMIT_STEP_C, JSON.stringify(l));
    assert.equal(await c.lowBattery(), false);
  });

  it('measures a room: 5-45 C, 5-95 % RH', async () => {
    const { temperature, humidity } = await c.measure();
    assert.ok(temperature > 5 && temperature < 45, `${temperature} C`);
    assert.ok(humidity > 5 && humidity < 95, `${humidity} %`);
  });

  it('two readings a second apart agree', async () => {
    const a = await c.measure();
    await new Promise((r) => setTimeout(r, 1000));
    const b = await c.measure();
    assert.ok(Math.abs(a.temperature - b.temperature) < AGREE_C, `${a.temperature} then ${b.temperature} C`);
    assert.ok(Math.abs(a.humidity - b.humidity) < AGREE_RH, `${a.humidity} then ${b.humidity} %`);
  });

  it('each resolution: the same air', async () => {
    const base = await c.measure();
    for (const temperature of [14, 11]) {
      for (const humidity of [14, 11, 8]) {
        await c.setResolution({ temperature, humidity });
        const m = await c.measure();
        assert.ok(Math.abs(m.temperature - base.temperature) < AGREE_C && Math.abs(m.humidity - base.humidity) < AGREE_RH, `${temperature}/${humidity}: ${m.temperature} C ${m.humidity} %`);
      }
    }
    await c.setResolution({ temperature: 14, humidity: 14 });
  });

  it('the alert: limits under the room\'s air set TALT and HALT after a measurement; over it, clear', async () => {
    const m = await c.measure();
    await c.setAlert({ humidity: m.humidity - 10, temperature: m.temperature - 5, mode: 'either' });
    await c.measure();
    assert.deepEqual(await c.alertStatus(), { pending: true, humidity: true, temperature: true });
    await c.setAlert({ humidity: m.humidity + 10, temperature: m.temperature + 5 });
    await c.measure();
    assert.deepEqual(await c.alertStatus(), { pending: false, humidity: false, temperature: false });
  });

  it('the heater, measuring for 5 s: warmer', async (t) => {
    const base = await c.measure();
    await c.setHeater(true);
    let m, n = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) { m = await c.measure(); n++; }
    await c.setHeater(false);
    t.diagnostic(`before ${base.temperature.toFixed(2)} C ${base.humidity.toFixed(1)} %, after ${n} readings heated ${m.temperature.toFixed(2)} C ${m.humidity.toFixed(1)} %`);
    assert.ok(m.temperature > base.temperature, 'warmer');
  });
});
