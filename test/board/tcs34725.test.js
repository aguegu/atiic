// the TCS3472 on a bench: Dart-8346's at 0x29 on r8845 at 400 kHz (a
// TCS34727 there), a room's light
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Tcs34725 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // its I2C: up to 400 kHz
const RATIO = [8, 32]; // 60x over 4x: 15 by its gains (a dim room's few counts)

describe('tcs34725 (board)', onlyWith(Tcs34725), () => {
  let bus;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
  });

  after(async () => {
    await new Tcs34725(bus, addressOf(Tcs34725)).sleep();
    await bus?.close();
  });

  it('is a TCS34725 or TCS34727; inits; measures four channels within the full scale', async (t) => {
    const s = new Tcs34725(bus, addressOf(Tcs34725));
    const part = await s.part();
    await s.init();
    const m = await s.measure();
    t.diagnostic(`${part}: ${JSON.stringify(m)}`);
    assert.ok(part);
    for (const k of ['clear', 'red', 'green', 'blue']) assert.ok(m[k] >= 0 && m[k] <= s.fullScale, `${k} ${m[k]}`);
  });

  it('clear in proportion to the gain (60x against 4x)', async (t) => {
    const lo = new Tcs34725(bus, addressOf(Tcs34725), { gain: 4 });
    await lo.init();
    const a = (await lo.measure()).clear;
    const hi = new Tcs34725(bus, addressOf(Tcs34725), { gain: 60 });
    await hi.init();
    await hi.ready(); // a whole integration at the new gain
    const b = (await hi.measure()).clear;
    t.diagnostic(`clear ${a} at 4x, ${b} at 60x`);
    assert.ok(a > 0 && b / a >= RATIO[0] && b / a <= RATIO[1], `${b} / ${a}`);
  });
});
