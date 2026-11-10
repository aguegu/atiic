// the VL53L1X on a bench: BENCH_ADAPTER's bus at 400 kHz, the module still, aimed
// at whatever is in front of it (the room: ~2 m on r8845)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Vl53l1x } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000;
const READINGS = 10;
const RANGE_MM = [40, 4000]; // the sensor's reach
const AGREE_MM = 30; // readings of a still scene, max - min (r8845: ~4)
const PERIOD_MS = [80, 130]; // the default configuration's ~100 ms a reading (r8845: 96-99)
// configure()'s modes and budgets, each READINGS readings: a reading every
// budget, within PERIOD_SLACK (the sensor's oscillator against the host's
// clock, and a reading's I2C after it)
const CONFIGS = [['short', 15], ['short', 20], ['short', 33], ['short', 50], ['short', 100], ['long', 20], ['long', 33], ['long', 50], ['long', 100], ['long', 200]];
const PERIOD_SLACK = [0.85, 1.25];
// the ROIs tried, sides in SPADs, largest first; at ROI_VALID_MIN and up
// valid at ~1 m (a 4 x 4 gets too little light there)
const ROI_SIDES = [16, 8, 4];
const ROI_VALID_MIN = 8;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));

describe('vl53l1x (board)', onlyWith(Vl53l1x), () => {
  let bus, tof;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    tof = new Vl53l1x(bus, addressOf(Vl53l1x));
  });

  after(async () => {
    await tof?.sleep();
    await bus?.close();
  });

  it('inits (the ULD\'s sequence)', async () => {
    await tof.init();
  });

  it(`${READINGS} readings: valid, in reach, agreeing, ~100 ms apart`, async () => {
    await tof.measure();
    const t0 = performance.now();
    const ds = [];
    for (let i = 0; i < READINGS; i++) {
      const { distance, status } = await tof.measure();
      assert.equal(status, 0, `status ${status} at ${distance} mm`);
      ds.push(distance);
    }
    const period = (performance.now() - t0) / READINGS;
    assert.ok(ds.every((d) => d > RANGE_MM[0] && d < RANGE_MM[1]), ds.join(' '));
    assert.ok(Math.max(...ds) - Math.min(...ds) <= AGREE_MM, ds.join(' '));
    assert.ok(period > PERIOD_MS[0] && period < PERIOD_MS[1], `${period.toFixed(0)} ms a reading`);
  });

  // r8845, a target at ~1 m, long, 100 ms (2026-11-10): 16 x 16 215 SPADs,
  // ~8.7 Mcps; 8 x 8 53 SPADs, ~2.6 Mcps, valid; 4 x 4 12 SPADs, ~0.6
  // Mcps, status 2 (signal fail) every time: under the sensor's minimum
  // signal; an 8 x 8 centred at row 12 status 13, every number 0xffff
  it('a reading\'s other numbers: its own light back, the background, the SPADs used; a smaller ROI uses fewer, gets less', async (t) => {
    await tof.configure({ mode: 'long', budget: 100 });
    const rois = {};
    for (const side of ROI_SIDES) {
      await tof.roi({ width: side, height: side });
      await tof.measure(); // ranged with the old ROI
      const r = rois[side] = await tof.measure();
      t.diagnostic(`${side} x ${side}: ${r.distance} mm, status ${r.status}, signal ${r.signal.toFixed(0)} kcps, ambient ${r.ambient.toFixed(1)} kcps, ${r.spads} SPADs`);
    }
    await tof.roi();
    for (const side of ROI_SIDES) {
      const r = rois[side];
      assert.ok(r.spads > 0 && r.spads <= side ** 2, `${r.spads} SPADs in ${side} x ${side}`);
      if (side >= ROI_VALID_MIN) assert.equal(r.status, 0, `${side} x ${side}: status ${r.status}`);
    }
    for (let i = 1; i < ROI_SIDES.length; i++) {
      const [a, b] = [rois[ROI_SIDES[i - 1]], rois[ROI_SIDES[i]]];
      assert.ok(b.spads < a.spads && b.signal < a.signal, `${ROI_SIDES[i]} x ${ROI_SIDES[i]} under ${ROI_SIDES[i - 1]} x ${ROI_SIDES[i - 1]}`);
    }
  });

  for (const [mode, budget] of CONFIGS) {
    it(`${mode}, ${budget} ms: a reading every ${budget} ms, valid, in reach, agreeing`, async (t) => {
      await tof.configure({ mode, budget });
      await tof.measure();
      const t0 = performance.now();
      const ds = [];
      for (let i = 0; i < READINGS; i++) {
        const { distance, status } = await tof.measure();
        assert.equal(status, 0, `status ${status} at ${distance} mm`);
        ds.push(distance);
      }
      const period = (performance.now() - t0) / READINGS;
      t.diagnostic(`${period.toFixed(1)} ms a reading, ${mean(ds).toFixed(0)} mm, sd ${sd(ds).toFixed(1)} mm, ${Math.min(...ds)}-${Math.max(...ds)}`);
      assert.ok(ds.every((d) => d > RANGE_MM[0] && d < RANGE_MM[1]), ds.join(' '));
      assert.ok(Math.max(...ds) - Math.min(...ds) <= AGREE_MM, ds.join(' '));
      assert.ok(period > budget * PERIOD_SLACK[0] && period < budget * PERIOD_SLACK[1], `${period.toFixed(1)} ms a reading`);
    });
  }
});
