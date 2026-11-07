// the SHT20 on a bench: r8845's CH341 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sht20 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

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
});
