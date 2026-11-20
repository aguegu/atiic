// the QMC5883L on a bench: Dart-8346's module on r8845 at 100 kHz, still
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Qmc5883l } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the QMC5883L's I2C: up to 400 kHz; 100 as tried
const MAX_UT = 200; // Earth's field (25-65 uT) and a module's own offset (ours to about 40 uT an axis), nothing near
const AGREE_UT = 3; // two readings at rest
const RANGES_AGREE_UT = 5; // the two ranges' scales, at rest

describe('qmc5883l (board)', onlyWith(Qmc5883l), () => {
  let bus, q;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    q = new Qmc5883l(bus, addressOf(Qmc5883l));
  });

  after(async () => {
    await q?.sleep();
    await bus?.close();
  });

  it('inits: a soft reset, continuous at 50 Hz, its first data ready', async () => {
    await q.init();
  });

  it('measures a field: every axis there, |B| under 200 uT (nothing magnetic near)', async (t) => {
    const { x, y, z } = (await q.measure()).magnetometers;
    t.diagnostic(`${x} ${y} ${z} uT`);
    for (const v of [x, y, z]) assert.ok(v !== null, 'an axis saturated: a magnet near?');
    assert.ok(Math.hypot(x, y, z) < MAX_UT, `|B| ${Math.hypot(x, y, z)} uT`);
  });

  it('two readings at rest agree', async () => {
    const a = (await q.measure()).magnetometers;
    await new Promise((r) => setTimeout(r, 200));
    const b = (await q.measure()).magnetometers;
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a[k] - b[k]) < AGREE_UT, `${k}: ${a[k]} then ${b[k]}`);
  });

  it('the two ranges read the same field (3000 and 12000 LSB/G)', async () => {
    const a = (await q.measure()).magnetometers;
    const fine = new Qmc5883l(bus, addressOf(Qmc5883l), { range: '2G' });
    await fine.init();
    const b = (await fine.measure()).magnetometers;
    await q.init();
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a[k] - b[k]) < RANGES_AGREE_UT, `${k}: 8G ${a[k]}, 2G ${b[k]}`);
  });

  it('a relative temperature, steady at rest', async () => {
    const a = await q.temperature();
    const b = await q.temperature();
    assert.ok(Math.abs(a - b) < 1, `${a} then ${b}`);
  });
});
