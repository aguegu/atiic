// the SHT3x on a bench: BENCH_ADAPTER's bus at 400 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sht3x } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus, ADAPTER } from './bench.js';

const SCL_HZ = 400000; // up to 1 MHz (its datasheet); 400 kHz as the adapters go
const AGREE_C = 0.5; // two readings apart, at rest
const AGREE_RH = 2;
const ROOM = { c: [5, 45], rh: [5, 95] };
const STATUS_RESET = 0x0010; // bit 4: a reset detected (Table 18)

describe('sht3x (board)', onlyWith(Sht3x), () => {
  let bus, s;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    s = new Sht3x(bus, addressOf(Sht3x));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits: a soft reset, its status cleared', async () => {
    await s.init();
    assert.equal((await s.status()) & STATUS_RESET, 0, 'reset flag cleared');
  });

  it('measures a room at each repeatability, the readings agreeing', async () => {
    const base = await s.measure();
    assert.ok(base.temperature > ROOM.c[0] && base.temperature < ROOM.c[1], `${base.temperature} C`);
    assert.ok(base.humidity > ROOM.rh[0] && base.humidity < ROOM.rh[1], `${base.humidity} %`);
    for (const repeatability of Object.keys(Sht3x.REPEATABILITIES)) {
      const m = await new Sht3x(bus, addressOf(Sht3x), { repeatability }).measure();
      assert.ok(Math.abs(m.temperature - base.temperature) < AGREE_C && Math.abs(m.humidity - base.humidity) < AGREE_RH, `${repeatability}: ${m.temperature} C ${m.humidity} %`);
    }
  });

  it('hold master on dart: SCL held until the result, the same air, sooner', { skip: ADAPTER !== 'dart' && 'only dart waits on a held SCL' }, async (t) => {
    await bus.speed(sclFor(SCL_HZ), Sht3x.STRETCH_MS);
    const held = new Sht3x(bus, addressOf(Sht3x), { hold: true });
    const t0 = performance.now();
    const a = await s.measure();
    const t1 = performance.now();
    const b = await held.measure();
    const t2 = performance.now();
    t.diagnostic(`no hold ${(t1 - t0).toFixed(1)} ms, hold ${(t2 - t1).toFixed(1)} ms (r8845: 18, 14)`);
    assert.ok(Math.abs(a.temperature - b.temperature) < AGREE_C && Math.abs(a.humidity - b.humidity) < AGREE_RH, `${b.temperature} C ${b.humidity} %`);
    assert.ok(t2 - t1 < t1 - t0, 'hold master sooner');
  });
});
