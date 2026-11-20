// the AS7341 on a bench: Dart-8346's at 0x39 on r8845 at 400 kHz, a room's light
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { As7341 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // its I2C: up to 400 kHz
const KEYS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'clear', 'nir'];
const RATIO = [4, 64]; // 256x over 16x: 16 by its gains (0.5 to 3 counts' rounding in a dim room)

describe('as7341 (board)', onlyWith(As7341), () => {
  let bus;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
  });

  after(async () => {
    await new As7341(bus, addressOf(As7341)).sleep();
    await bus?.close();
  });

  it('measures all ten channels, within 16 bits', async (t) => {
    const a = new As7341(bus, addressOf(As7341));
    await a.init();
    const m = await a.measure();
    t.diagnostic(JSON.stringify(m));
    for (const k of KEYS) assert.ok(m[k] >= 0 && m[k] <= 0xffff, `${k} ${m[k]}`);
  });

  it('Clear in proportion to the gain (256x against 16x)', async (t) => {
    const hi = new As7341(bus, addressOf(As7341), { gain: 256 });
    await hi.init();
    const a = (await hi.measure()).clear;
    const lo = new As7341(bus, addressOf(As7341), { gain: 16 });
    await lo.init();
    const b = (await lo.measure()).clear;
    t.diagnostic(`clear ${a} at 256x, ${b} at 16x`);
    assert.ok(b > 0 && a / b >= RATIO[0] && a / b <= RATIO[1], `${a} / ${b}`);
  });
});
