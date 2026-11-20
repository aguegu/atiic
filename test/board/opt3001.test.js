// the OPT3001 on a bench: Dart-8346's at 0x44 on r8845 at 100 kHz, a room's light
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Opt3001 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the OPT3001's I2C: up to 2.6 MHz; 100 as tried
const AGREE = 0.2; // two readings of a still room agree within this share, or AGREE_LUX
const AGREE_LUX = 1;

const near = (a, b) => Math.abs(a - b) <= Math.max(AGREE_LUX, AGREE * Math.max(a, b));

describe('opt3001 (board)', onlyWith(Opt3001), () => {
  let bus, o;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    o = new Opt3001(bus, addressOf(Opt3001));
  });

  after(async () => {
    await o?.sleep();
    await bus?.close();
  });

  it('inits: automatic range, continuous, 800 ms; its first conversion ready', async () => {
    await o.init();
    assert.equal((await o.config()) & 0xfe1f, 0xcc10);
  });

  it('measures a room: some lux, under its 83865.6, no overflow', async (t) => {
    const { lux, overflow } = await o.measure();
    t.diagnostic(`${lux} lux`);
    assert.ok(lux >= 0 && lux < 83865.6, `${lux} lux`);
    assert.equal(overflow, false);
  });

  it('two readings a conversion apart agree (a still room)', async () => {
    const a = await o.lux();
    await new Promise((r) => setTimeout(r, Opt3001.CONVERSION_MS[800]));
    const b = await o.lux();
    assert.ok(near(a, b), `${a} then ${b} lux`);
  });

  it('100 ms conversions read the same light', async (t) => {
    const slow = await o.lux();
    const fast = new Opt3001(bus, addressOf(Opt3001), { conversionMs: 100 });
    await fast.init();
    const quick = await fast.lux();
    t.diagnostic(`800 ms ${slow} lux, 100 ms ${quick} lux`);
    assert.ok(near(slow, quick), `${slow} and ${quick} lux`);
    await o.init();
  });
});
