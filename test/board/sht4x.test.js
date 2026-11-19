// the SHT4x on a bench: Dart-8346's SHT40 on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sht4x } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the SHT4x's I2C: up to 1 MHz; 100 as tried
const AGREE_C = 0.5; // two readings a second apart, at rest
const AGREE_RH = 2;

describe('sht4x (board)', onlyWith(Sht4x), () => {
  let bus, s;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    s = new Sht4x(bus, addressOf(Sht4x));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits (a soft reset)', async () => {
    await s.init();
  });

  it('a serial number, the same twice', async (t) => {
    const a = await s.serialNumber();
    assert.equal(await s.serialNumber(), a);
    t.diagnostic(`serial 0x${a.toString(16).padStart(8, '0')}`);
  });

  it('measures a room: 5-45 C, 5-95 % RH, CRCs good', async () => {
    const { temperature, humidity } = await s.measure();
    assert.ok(temperature > 5 && temperature < 45, `${temperature} C`);
    assert.ok(humidity > 5 && humidity < 95, `${humidity} %`);
  });

  it('two readings a second apart agree', async () => {
    const a = await s.measure();
    await new Promise((r) => setTimeout(r, 1000));
    const b = await s.measure();
    assert.ok(Math.abs(a.temperature - b.temperature) < AGREE_C, `${a.temperature} then ${b.temperature} C`);
    assert.ok(Math.abs(a.humidity - b.humidity) < AGREE_RH, `${a.humidity} then ${b.humidity} %`);
  });

  it('each repeatability: its wait enough, the same air', async () => {
    const base = await s.measure();
    for (const repeatability of Object.keys(Sht4x.REPEATABILITIES)) {
      const m = await new Sht4x(bus, addressOf(Sht4x), { repeatability }).measure();
      assert.ok(Math.abs(m.temperature - base.temperature) < AGREE_C && Math.abs(m.humidity - base.humidity) < AGREE_RH, `${repeatability}: ${m.temperature} C ${m.humidity} %`);
    }
  });

  // the heated reading's RH is no guide: specifications "not valid" while
  // heating (4.8); ours read higher, not lower (21.8 C 56.8 % -> 36.0 C 58.7 %)
  it('the heater, 200 mW for 0.1 s: much warmer, then back', async (t) => {
    const base = await s.measure();
    const hot = await s.heat(200);
    t.diagnostic(`before ${base.temperature.toFixed(2)} C ${base.humidity.toFixed(1)} %, heated ${hot.temperature.toFixed(2)} C ${hot.humidity.toFixed(1)} %`);
    assert.ok(hot.temperature > base.temperature + 5, 'warmer by over 5 C');
    await new Promise((r) => setTimeout(r, 3000)); // 0.11 s on, then off 20x longer: under 5 %
    const after = await s.measure();
    assert.ok(Math.abs(after.temperature - base.temperature) < AGREE_C, `back: ${after.temperature} C`);
  });
});
