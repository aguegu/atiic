// the HDC1080 on a bench: Dart-8346's on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hdc1080 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the HDC1080's I2C: 10-400 kHz; 100 as tried
const AGREE_C = 0.5; // two readings a second apart, at rest
const AGREE_RH = 2;
const HEAT_MS = 5000; // the heater on, measuring back to back

describe('hdc1080 (board)', onlyWith(Hdc1080), () => {
  let bus, h;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    h = new Hdc1080(bus, addressOf(Hdc1080));
  });

  after(async () => {
    await h?.init();
    await bus?.close();
  });

  it('inits (a soft reset): the configuration 0x1000, its supply not low', async () => {
    await h.init();
    assert.equal((await h.config()) & ~0x0800, 0x1000);
    assert.equal(await h.lowBattery(), false);
  });

  it('a serial number, the same twice', async (t) => {
    const a = await h.serialNumber();
    assert.equal(await h.serialNumber(), a);
    t.diagnostic(`serial 0x${a.toString(16)}`);
  });

  it('measures a room: 5-45 C, 5-95 % RH', async () => {
    const { temperature, humidity } = await h.measure();
    assert.ok(temperature > 5 && temperature < 45, `${temperature} C`);
    assert.ok(humidity > 5 && humidity < 95, `${humidity} %`);
  });

  it('two readings a second apart agree', async () => {
    const a = await h.measure();
    await new Promise((r) => setTimeout(r, 1000));
    const b = await h.measure();
    assert.ok(Math.abs(a.temperature - b.temperature) < AGREE_C, `${a.temperature} then ${b.temperature} C`);
    assert.ok(Math.abs(a.humidity - b.humidity) < AGREE_RH, `${a.humidity} then ${b.humidity} %`);
  });

  it('each resolution: the same air', async () => {
    const base = await h.measure();
    for (const temperature of [14, 11]) {
      for (const humidity of [14, 11, 8]) {
        await h.setResolution({ temperature, humidity });
        const m = await h.measure();
        assert.ok(Math.abs(m.temperature - base.temperature) < AGREE_C && Math.abs(m.humidity - base.humidity) < AGREE_RH, `${temperature}/${humidity}: ${m.temperature} C ${m.humidity} %`);
      }
    }
    await h.setResolution({ temperature: 14, humidity: 14 });
  });

  it('the heater, measuring back to back for 5 s: warmer', async (t) => {
    const base = await h.measure();
    await h.setHeater(true);
    let m, n = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < HEAT_MS) { m = await h.measure(); n++; }
    await h.setHeater(false);
    t.diagnostic(`before ${base.temperature.toFixed(2)} C ${base.humidity.toFixed(1)} %, after ${n} heated readings ${m.temperature.toFixed(2)} C ${m.humidity.toFixed(1)} %`);
    assert.ok(m.temperature > base.temperature, 'warmer');
  });
});
