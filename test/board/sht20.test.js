// the SHT20 on a bench: r8845's CH341 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sht20 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus, ADAPTER } from './bench.js';

const SCL_HZ = 100000; // the SHT20's I2C: up to 400 kHz; 100 as tried
const AGREE_C = 0.5; // two readings a second apart, at rest
const AGREE_RH = 2;

describe('sht20 (board)', onlyWith(Sht20), () => {
  let bus, s;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    s = new Sht20(bus, addressOf(Sht20));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits (a soft reset)', async () => {
    await s.init();
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

  it('each resolution: its waits, its period, the same air (only bits 7 and 0 of the user register changed)', async () => {
    const u = await s.userRegister();
    const base = await s.measure();
    for (const name of Object.keys(Sht20.RESOLUTIONS)) {
      await s.setResolution(name);
      assert.equal((await s.userRegister()) & ~0x81, u & ~0x81, `${name}: reserved bits kept`);
      const m = await s.measure();
      assert.ok(Math.abs(m.temperature - base.temperature) < AGREE_C && Math.abs(m.humidity - base.humidity) < AGREE_RH, `${name}: ${m.temperature} C ${m.humidity} %`);
    }
    await s.init();
  });

  // dart waits on a held SCL (CH341, CH347: they don't)
  it('hold master on dart: the sensor holds SCL, one transaction a reading, the same air, sooner', { skip: ADAPTER !== 'dart' && 'only dart waits on a held SCL' }, async (t) => {
    await bus.speed(SCL_HZ, Sht20.STRETCH_MS);
    const held = new Sht20(bus, addressOf(Sht20), { hold: true });
    const t0 = performance.now();
    const a = await s.measure();
    const t1 = performance.now();
    const b = await held.measure();
    const t2 = performance.now();
    t.diagnostic(`no hold ${(t1 - t0).toFixed(0)} ms, hold ${(t2 - t1).toFixed(0)} ms (r8845: 117, 91)`);
    assert.ok(Math.abs(a.temperature - b.temperature) < AGREE_C && Math.abs(a.humidity - b.humidity) < AGREE_RH, `${b.temperature} C ${b.humidity} %`);
    assert.ok(t2 - t1 < t1 - t0, 'hold master sooner');
  });
});
