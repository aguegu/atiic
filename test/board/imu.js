// The MPU-6050 and MPU-6500 board tests' gravity and FIFO checks, one copy.
// They check the driver on a board, not the module's calibration: modules
// differ (r8845's two MPU-6500s, 2026-11-10: one at rest read |a| 0.99 g,
// the other 1.19 g in every run, on any adapter).
import assert from 'node:assert/strict';

// |a| at rest: a driver error lands far outside this (a wrong full-scale
// range reads 0.5 or 2 g, bytes out of order anything), a module's offset
// inside it
export const G_MIN = 0.75;
export const G_MAX = 1.25;
// the FIFO's samples against the module's own reading at rest, g
export const G_AGREE = 0.05;
export const FIFO_TEST_MS = 300;
// samples a millisecond at 1 kHz, from the first one read: the clock starts
// there, not at startFifo(), whose first samples come after a start-up
// (measured on the CH347 and dart alike: from startFifo(), 0.943-0.996)
export const FIFO_RATE_MIN = 0.95;
export const FIFO_RATE_MAX = 1.05;

export const size = ({ x, y, z }) => Math.hypot(x, y, z);

// one reading at rest: |a| within G_MIN-G_MAX, a room temperature; its |a|
export async function gravity(t, mpu) {
  const r = await mpu.measure();
  const g = size(r.accelerometers);
  t.diagnostic(`|a| ${g.toFixed(3)} g at rest, ${r.temperature.toFixed(1)} C`);
  assert.ok(g > G_MIN && g < G_MAX, `|a| ${g} g`);
  assert.ok(r.temperature > 0 && r.temperature < 50, `${r.temperature} C`);
  return g;
}

// the FIFO at 1 kHz for FIFO_TEST_MS from its first sample: none lost, and
// each sample's |a| the module's own at rest
export async function fifo(t, mpu, restG) {
  await mpu.startFifo(); // accel + gyro, 1 kHz
  const samples = [];
  while (!samples.length) samples.push(...await mpu.readFifo());
  const t0 = performance.now();
  const first = samples.length; // in the FIFO before the clock started
  while (performance.now() - t0 < FIFO_TEST_MS) samples.push(...await mpu.readFifo());
  const ms = performance.now() - t0;
  await mpu.stopFifo();
  const n = samples.length - first;
  t.diagnostic(`${n} samples in ${ms.toFixed(0)} ms after the first`);
  assert.ok(n >= ms * FIFO_RATE_MIN && n <= ms * FIFO_RATE_MAX + 1, `${n} in ${ms.toFixed(0)} ms`);
  for (const s of samples) {
    const g = size(s.accelerometers);
    assert.ok(Math.abs(g - restG) < G_AGREE, `|a| ${g} g, at rest ${restG.toFixed(3)} g`);
  }
}
