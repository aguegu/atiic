// The BMX055's chips polled (on I2C or SPI, whichever the bench has): reads
// a second of each chip's data registers, and of those the new samples (a
// read between two samples gets the same bytes again), at atiic's drivers'
// rates and at each chip's top (the accelerometer's bandwidth 1000 Hz, a
// sample every 0.5 ms, PMU_BW 01111b; the gyro's 2000 Hz ODR, BW 0001b).
// The drivers use no FIFO, so polling is all. A sample is new by its data,
// the flags that clear on read masked (the accelerometer's new_data, bit 0
// of each axis' LSB; the magnetometer's data ready, 0x48 bit 0) and the
// accelerometer's temperature left out. Keep the module still; each row
// runs ROW_MS. On r8845 over SPI (1.3.9, 3 runs):
//  - ~2400-2600 reads/s (15-19 KiB/s of 6-8 byte reads)
//  - at the drivers' rates every sample: the accelerometer 58-62 of 62.5
//    (at rest two in a row can read the same: counted as one), the gyro
//    100 of 100, the magnetometer 10 of 10
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
const AT_DRIVER_RATE = [0.9, 1.03]; // of the rate: at rest, equal samples count once
const AT_TOP_MIN = 0.9; // of the rate: polling at ~1.3x it
const CHIPS = [
  { Driver: Bmx055Accel, chip: 'accel', reg: 0x02, bytes: 7, key: (d) => [0, 1, 2, 3, 4, 5].map((i) => (i % 2 ? d[i] : d[i] & 0xfe)), rates: [{ label: '62.5 Hz (the driver)', hz: 62.5 }, { label: '2000 Hz', hz: 2000, set: [0x10, 0x0f] }] },
  { Driver: Bmx055Gyro, chip: 'gyro', reg: 0x02, bytes: 6, key: (d) => Array.from(d), rates: [{ label: '100 Hz (the driver)', hz: 100 }, { label: '2000 Hz', hz: 2000, set: [0x10, 0x01] }] },
  { Driver: Bmx055Mag, chip: 'mag', reg: 0x42, bytes: 8, key: (d) => Array.from(d, (b, i) => (i === 6 ? b & 0xfe : b)), rates: [{ label: '10 Hz (the driver)', hz: 10 }] },
];

for (const { Driver, chip, reg, bytes, key: sample, rates } of CHIPS) {
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
            const key = sample(await regs.writeRead(address, [reg], bytes)).join(',');
            if (key !== last) fresh++;
            last = key;
            reads++;
          }
          const s = (performance.now() - t0) / 1000;
          if (set) await dev.init(); // back to the driver's settings
          t.diagnostic(`${label.padEnd(20)} ${(reads / s).toFixed(0)} reads/s (${((reads * bytes) / s / 1024).toFixed(1)} KiB/s), ${(fresh / s).toFixed(0)} new samples/s of ${hz}`);
          const f = fresh / s;
          if (set) assert.ok(f >= hz * AT_TOP_MIN, `${f.toFixed(0)} new samples/s of ${hz}`);
          else assert.ok(f >= hz * AT_DRIVER_RATE[0] && f <= hz * AT_DRIVER_RATE[1], `${f.toFixed(0)} new samples/s of ${hz}`);
        });
      }
    });
  }
}
