// the BH1745NUC on a bench: BENCH_ADAPTER's bus at 400 kHz, a room's light
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bh1745 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // the datasheet's fSCL max
const COUNT_MAX = 0xffff;
// 16x against 1x, 640 ms against 160 ms: the counts' ratio, a room's light
// changing a little between the readings (r8845, dim: 15.6-16.3, ~4)
const GAIN_RATIO = [12, 20];
const TIME_RATIO = [3, 5];
const COUNTS_MIN = 10; // the 1x reading summed, enough to compare (r8845, dim: 17-24, ratios right)

const sum = (m) => m.red + m.green + m.blue;

describe('bh1745 (board)', onlyWith(Bh1745), () => {
  let bus, c;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    c = new Bh1745(bus, addressOf(Bh1745));
  });

  after(async () => {
    await c?.sleep();
    await bus?.close();
  });

  it('inits (a reset, 160 ms, 1x) and measures within its time', async () => {
    await c.init();
    const t0 = performance.now();
    const m = await c.measure();
    assert.ok(performance.now() - t0 < 2 * 160, 'VALID in time');
    for (const k of ['red', 'green', 'blue', 'clear']) assert.ok(m[k] >= 0 && m[k] <= COUNT_MAX, `${k} ${m[k]}`);
  });

  it('16x gain and 4x the time each give about that many counts', async (t) => {
    await c.configure({ timeMs: 160, gain: 1 });
    const one = await c.measure();
    if (sum(one) < COUNTS_MIN) {
      t.skip(`too dark to compare: ${sum(one)} counts`);
      return;
    }
    await c.configure({ timeMs: 160, gain: 16 });
    const g16 = await c.measure();
    await c.configure({ timeMs: 640, gain: 1 });
    const t4 = await c.measure();
    const [rg, rt] = [sum(g16) / sum(one), sum(t4) / sum(one)];
    t.diagnostic(`1x ${JSON.stringify(one)}; 16x ${(rg).toFixed(1)} times; 640 ms ${rt.toFixed(1)} times`);
    assert.ok(rg > GAIN_RATIO[0] && rg < GAIN_RATIO[1], `16x: ${rg}`);
    assert.ok(rt > TIME_RATIO[0] && rt < TIME_RATIO[1], `640 ms: ${rt}`);
  });
});
