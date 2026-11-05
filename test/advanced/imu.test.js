// The MPU-6050 and MPU-6500 pushed (whichever is on the bench): how much data a CH341 at 400 kHz takes off it, by
// polling its data registers and by its FIFO. Measurements more than smoke
// tests; each prints its table (node --test's diagnostics) and holds what the
// bench showed (1.0.3 on r8845):
//  - polling, ~1600 reads/s, keeps up at 62.5 Hz; at 1 kHz it misses a
//    few (992 new samples/s of the chip's 1007: two samples between reads
//    when a read runs late), where the FIFO misses none
//  - the FIFO loses no frame up to gyro alone at 4 kHz (24 KB/s)
//  - gyro alone at 8 kHz (48 KB/s) overflows: past the bus (44 KB/s at
//    400 kHz, less the CH341's per-packet round trips: ~31 KiB/s seen)
// Keep the module still; each row runs ROW_MS.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050, Mpu6500, SpiRegisters } from '../../src/index.js';
import { onlyWith, MPU6500_SPI } from '../board/bench.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';

const SCL_HZ = 400000;
const ROW_MS = 2000;
const REG_SMPLRT_DIV = 0x19;
const REG_ACCEL_XOUT_H = 0x3b;
const MEASURE_BYTES = 14;
const DIV_1KHZ = 0; // 1 kHz / (1 + 0) with the filter on
const RATE_TOLERANCE = 0.03; // the chip's own oscillator: 1006-1007 Hz for 1000 seen
const POLL_MISS_MAX = 0.05; // polling at 1 kHz: ~1.5 % missed seen

const within = (got, want) => Math.abs(got - want) <= want * RATE_TOLERANCE;

// the benches: each chip on I2C where found, and the MPU-6500 on SPI
// (BENCH_MPU6500_SPI), its driver on SpiRegisters
const BENCHES = [
  ...[Mpu6050, Mpu6500].map((Driver) => ({ Driver, name: `${Driver.chip.name} (advanced)`, skip: onlyWith(Driver), transport: 'i2c' })),
  { Driver: Mpu6500, name: 'MPU-6500 over SPI (advanced)', skip: { skip: MPU6500_SPI ? false : 'no BENCH_MPU6500_SPI' }, transport: 'spi' },
];

for (const { Driver, name, skip: benchSkip, transport } of BENCHES) describe(name, benchSkip, () => {
  let bus, mpu;
  before(async () => {
    if (transport === 'spi') {
      const ch341 = await openCh341();
      bus = await new SpiRegisters(ch341, MPU6500_SPI).open();
      bus.close = () => ch341.close();
    } else {
      bus = await openCh341(SCL_HZ);
    }
    mpu = new Driver(bus);
    await mpu.init();
  });

  after(async () => {
    await mpu?.sleep();
    await bus?.close();
  });

  // reads/s and, of those, new samples/s (a read between two samples gets
  // the same 14 bytes again)
  async function poll() {
    let reads = 0, fresh = 0, last = '';
    const t0 = performance.now();
    while (performance.now() - t0 < ROW_MS) {
      const key = (await bus.writeRead(mpu.address, [REG_ACCEL_XOUT_H], MEASURE_BYTES)).join(',');
      if (key !== last) fresh++;
      last = key;
      reads++;
    }
    const s = (performance.now() - t0) / 1000;
    return { reads: reads / s, fresh: fresh / s };
  }

  it('polling keeps up at 62.5 Hz, misses a few at 1 kHz', async (t) => {
    const slow = await poll();
    await bus.write(mpu.address, [REG_SMPLRT_DIV, DIV_1KHZ]);
    const fast = await poll();
    await mpu.init(); // back to the driver's settings
    for (const [label, r] of [['62.5 Hz', slow], ['1 kHz', fast]]) {
      t.diagnostic(`${label.padEnd(8)} ${r.reads.toFixed(0)} reads/s (${(r.reads * MEASURE_BYTES / 1024).toFixed(1)} KiB/s), ${r.fresh.toFixed(0)} new samples/s`);
    }
    assert.ok(within(slow.fresh, 62.5), `62.5 Hz: ${slow.fresh.toFixed(0)} new samples/s`);
    assert.ok(fast.fresh >= 1000 * (1 - POLL_MISS_MAX), `1 kHz: ${fast.fresh.toFixed(0)} new samples/s`);
  });

  const ROWS = [
    { label: 'accel+gyro 1 kHz', accelerometers: true, filter: true, divider: 0, fits: true },
    { label: 'gyro 1 kHz', accelerometers: false, filter: true, divider: 0, fits: true },
    { label: 'gyro 2 kHz', accelerometers: false, filter: false, divider: 3, fits: true },
    { label: 'gyro 2.67 kHz', accelerometers: false, filter: false, divider: 2, fits: true },
    { label: 'gyro 4 kHz', accelerometers: false, filter: false, divider: 1, fits: true },
    { label: 'gyro 8 kHz', accelerometers: false, filter: false, divider: 0, fits: false, spiFits: undefined },
  ];

  for (const row of ROWS) {
    const unsupported = !row.filter && row.divider && !Driver.chip.dividerWithFilterOff;
    const skip = unsupported ? `the ${Driver.chip.name} ignores SMPLRT_DIV with the filter off: 8 kHz only` : false;
    it(`FIFO ${row.label}: ${row.fits ? 'every frame through' : 'overflows, past the bus'}`, { skip }, async (t) => {
      await mpu.startFifo(row);
      let frames = 0, reads = 0, overflows = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ROW_MS) {
        try {
          frames += (await mpu.readFifo()).length;
        } catch (e) {
          if (!e.message.includes('overflowed')) throw e;
          overflows++;
        }
        reads++;
      }
      const s = (performance.now() - t0) / 1000;
      await mpu.stopFifo();
      const f = frames / s;
      t.diagnostic(`${row.label.padEnd(16)} ${f.toFixed(0)} frames/s of ${mpu.sampleRate.toFixed(0)}, ${(f * mpu.fifoFrame / 1024).toFixed(1)} KiB/s, ${(reads / s).toFixed(0)} reads/s, ${overflows} overflows`);
      const fits = transport === 'spi' && 'spiFits' in row ? row.spiFits : row.fits;
      if (fits === undefined) return; // not known yet: reported only
      if (fits) {
        assert.equal(overflows, 0);
        assert.ok(within(f, mpu.sampleRate), `${f.toFixed(0)} frames/s`);
      } else {
        assert.ok(overflows > 0, 'expected to overflow');
      }
    });
  }
});
