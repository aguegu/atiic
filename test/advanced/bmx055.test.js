// The BMX055's chips polled (on I2C or SPI, whichever the bench has): reads
// a second of each chip's data registers, and of those the new samples (a
// read between two samples gets the same bytes again), at atiic's drivers'
// rates and at each chip's top (the accelerometer's bandwidth 1000 Hz, a
// sample every 0.5 ms, PMU_BW 01111b; the gyro's 2000 Hz ODR, BW 0001b).
// The drivers use no FIFO, so polling is all. How a new sample is told,
// each as measured over 10 s on r8845:
//  - the accelerometer by its new_data_x flag (bit 0 of 0x02, cleared by
//    the read): 64.5 a second, the median gap 15.5 ms; by its data, 58.6:
//    at rest, 1 sample in 10 reads the same as the one before
//  - the magnetometer by its data changing (its data ready flag, 0x48 bit
//    0, overcounts: 12 of 114 times set again 0.3 ms after a read, no new
//    data): 10.2 a second, the median gap 98.7 ms
//  - the gyro by its data changing (no flag; noisy enough not to repeat) Keep the module still; each row
// runs ROW_MS. On r8845 over SPI (1.3.9, 3 runs):
//  - ~2400-2600 reads/s (15-19 KiB/s of 6-8 byte reads)
//  - at the drivers' rates every sample: the accelerometer ~65 of 62.5
//    (its clock ~3% fast), the gyro 100.5 of 100, the magnetometer ~10.2
//    of 10
//  - at the top, polling catches most, not all: the accelerometer
//    1956-1967 of 2000, the gyro 1898-1912 of 2000 (a late read misses
//    one; every sample would take the chips' FIFOs, which the drivers
//    don't use)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Accel, Bmx055Gyro, Bmx055Mag } from '../../src/index.js';
import { bmx055Benches } from '../board/bench.js';

const SCL_HZ = 400000;
const ROW_MS = 2000;
const AT_DRIVER_RATE = [0.9, 1.1]; // of the rate: the chips' own clocks
const AT_TOP_MIN = 0.9; // of the rate: polling at ~1.3x it
const CHIPS = [
  { Driver: Bmx055Accel, chip: 'accel', reg: 0x02, bytes: 7, isNew: (d) => (d[0] & 1) === 1, rates: [{ label: '62.5 Hz (the driver)', hz: 62.5 }, { label: '2000 Hz', hz: 2000, set: [0x10, 0x0f] }] },
  { Driver: Bmx055Gyro, chip: 'gyro', reg: 0x02, bytes: 6, mask: (d) => Array.from(d), rates: [{ label: '100 Hz (the driver)', hz: 100 }, { label: '2000 Hz', hz: 2000, set: [0x10, 0x01] }] },
  { Driver: Bmx055Mag, chip: 'mag', reg: 0x42, bytes: 8, mask: (d) => Array.from(d, (b, i) => (i === 6 ? b & 0xfe : b)), rates: [{ label: '10 Hz (the driver)', hz: 10 }] },
];

for (const { Driver, chip, reg, bytes, isNew, mask, rates } of CHIPS) {
  for (const bench of bmx055Benches(Driver, chip, SCL_HZ)) {
    describe(`${Driver.chip.name} polled ${bench.label} (advanced)`, bench.skip, () => {
      let bus, regs, address, dev;
      before(async () => {
        ({ bus, regs, address } = await bench.open());
        dev = new Driver(regs, address);
        await dev.init();
      });

      after(async () => {
        await dev?.sleep();
        await bus?.close();
      });

      for (const { label, hz, set } of rates) {
        it(`${label}: reads and new samples a second`, async (t) => {
          if (set) await regs.write(address, set);
          let reads = 0, fresh = 0, last = '';
          const t0 = performance.now();
          while (performance.now() - t0 < ROW_MS) {
            const d = await regs.writeRead(address, [reg], bytes);
            if (isNew) {
              if (isNew(d)) fresh++;
            } else {
              const key = mask(d).join(',');
              if (key !== last) fresh++;
              last = key;
            }
            reads++;
          }
          const s = (performance.now() - t0) / 1000;
          if (set) await dev.init(); // back to the driver's settings
          t.diagnostic(`${label.padEnd(20)} ${(reads / s).toFixed(0)} reads/s (${((reads * bytes) / s / 1024).toFixed(1)} KiB/s), ${(fresh / s).toFixed(1)} new samples/s of ${hz}`);
          const f = fresh / s;
          if (set) assert.ok(f >= hz * AT_TOP_MIN, `${f.toFixed(1)} new samples/s of ${hz}`);
          else assert.ok(f >= hz * AT_DRIVER_RATE[0] && f <= hz * AT_DRIVER_RATE[1], `${f.toFixed(1)} new samples/s of ${hz}`);
        });
      }
    });
  }
}
