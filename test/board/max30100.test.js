// the MAX30100 on a bench: Dart-8346's at 0x57 on r8845 at 400 kHz, a module
// with nothing on it (no finger: the samples are the light its cover returns)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Max30100 } from '../../src/index.js';
import { onlyWith, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // the MAX30100's top on I2C
const RATE_MS = 2000; // the count good to a poll's few samples in 200
const RATE_TOLERANCE = 0.05;
const POLL_MS = 50; // the FIFO's 16 samples last 160 ms at 100 a second

describe('max30100 (board)', onlyWith(Max30100), () => {
  let bus, m;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    m = new Max30100(bus);
  });

  after(async () => {
    await m?.sleep();
    await bus?.close();
  });

  it('inits', async () => {
    await m.init();
  });

  it('queues 100 samples a second, IR and red, within 16 bits', async () => {
    await m.readFifo();
    const samples = [];
    const t0 = performance.now();
    while (performance.now() - t0 < RATE_MS) {
      samples.push(...await m.readFifo());
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    const rate = (samples.length * 1000) / (performance.now() - t0);
    assert.ok(Math.abs(rate - m.rate) <= m.rate * RATE_TOLERANCE, `${rate.toFixed(1)} a second`);
    for (const { red, ir } of samples) assert.ok(red > 0 && red <= 0xffff && ir > 0 && ir <= 0xffff, `${red}, ${ir}`);
  });

  it('heart-rate mode queues IR alone', async () => {
    await m.init({ mode: 'hr' });
    await new Promise((r) => setTimeout(r, POLL_MS * 2)); // 10 samples: under the FIFO's 16
    const samples = await m.readFifo();
    assert.ok(samples.length > 0 && samples.every((s) => s.ir > 0 && s.red === undefined), JSON.stringify(samples.slice(0, 2)));
    await m.init();
  });

  it('reads a room temperature from its die', async () => {
    const t = await m.temperature();
    assert.ok(t > 10 && t < 50, `${t} C`);
  });
});
