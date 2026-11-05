// the AHT21B on a bench: r8845's CH341T at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Aht21 } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { onlyWith, addressOf, sclFor } from './bench.js';

const SCL_HZ = 100000; // as tried; the datasheet gives no top
const EVERY_MS = 2000; // 4.4: a measurement every 2 s, not to warm it
const AGREE_C = 0.5;
const AGREE_RH = 2;

describe('aht21 (board)', onlyWith(Aht21), () => {
  let bus, a;
  before(async () => {
    bus = await openCh341(sclFor(SCL_HZ));
    a = new Aht21(bus, addressOf(Aht21));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits (its status 0x18)', async () => {
    await a.init();
  });

  it('measures a room: 5-45 C, 5-95 % RH, its CRC good; 2 s later the same', async () => {
    const x = await a.measure();
    assert.ok(x.temperature > 5 && x.temperature < 45, `${x.temperature} C`);
    assert.ok(x.humidity > 5 && x.humidity < 95, `${x.humidity} %`);
    await new Promise((r) => setTimeout(r, EVERY_MS));
    const y = await a.measure();
    assert.ok(Math.abs(x.temperature - y.temperature) < AGREE_C, `${x.temperature} then ${y.temperature}`);
    assert.ok(Math.abs(x.humidity - y.humidity) < AGREE_RH, `${x.humidity} then ${y.humidity}`);
  });
});
