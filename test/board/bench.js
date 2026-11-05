// What's on the bench: each known chip looked for at its addresses by its
// own ID register, once before the tests are laid out, so each chip's tests
// run only with that chip there (and skip with the reason otherwise).
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { Mpu6050, Mpu6500, Bmx055Accel, Bmx055Gyro, Bmx055Mag } from '../../src/index.js';

// for test/board/ch341.test.js, each chip's registers as the CH341's
// reference: how to wake it, a range with no sensor data (a block read must
// match byte reads), a register to write and read back, and values for it
export const REFERENCES = [
  { Driver: Mpu6050, wake: [0x6b, 0x00], staticFirst: 0x0d, staticLast: 0x39, writable: 0x19, values: [0x5a, 0xa5] },
  { Driver: Mpu6500, wake: [0x6b, 0x00], staticFirst: 0x0d, staticLast: 0x39, writable: 0x19, values: [0x5a, 0xa5] },
  // BMX055's accelerometer: its configuration, 0x0f-0x3d (FIFO_STATUS 0x0e and FIFO_DATA 0x3f outside);
  // PMU_BW takes 0x08-0x0f
  { Driver: Bmx055Accel, wake: [0x11, 0x00], staticFirst: 0x0f, staticLast: 0x3d, writable: 0x10, values: [0x09, 0x0e] },
  // BMX055's gyro: the same span of configuration; BW takes 0x00-0x07
  { Driver: Bmx055Gyro, wake: [0x11, 0x00], staticFirst: 0x0f, staticLast: 0x3d, writable: 0x10, values: [0x05, 0x06] },
  // BMX055's magnetometer: its trim registers 0x5d-0x71 (factory values); REP_XY takes any byte
  { Driver: Bmx055Mag, wake: [0x4b, 0x01], staticFirst: 0x5d, staticLast: 0x71, writable: 0x51, values: [0x5a, 0xa5] },
];

// BENCH_PS (from .env.local, or the environment): the CH341 line wired to a
// BMX055's PS pin (D0 on r8845's CH341A). PS picks the BMX055's interface:
// high I2C, low SPI. Driven high before anything looks for a chip; the
// CH341 keeps it while it stays plugged in, across the tests' own opens
export const PS = process.env.BENCH_PS || null;

// a display on the CH341's SPI, its lines as "res=D0,dc=D1,cs=D2", from
// .env.local or the environment: BENCH_ST7735 (r8845's 0.96" 80x160),
// BENCH_GC9107 (r8845's 1.45" 60x160), BENCH_GC9A01 (r8845's round 240x240),
// BENCH_SSD1680 (r8845's 1.54" 152x152 e-paper, its BUSY too: "...,busy=D4"),
// BENCH_SSD1681 (r8845's 1.54" 200x200 e-paper, the same), BENCH_ST7302
// (r8845's 2.13" 122x250 reflective mono TFT), BENCH_MPU6500_SPI (an
// MPU-6500 on the CH341A's SPI, its NCS: "cs=D4")
const lines = (v) => (v ? Object.fromEntries(v.split(',').map((kv) => kv.trim().split('='))) : null);
export const ST7735 = lines(process.env.BENCH_ST7735);
export const GC9107 = lines(process.env.BENCH_GC9107);
export const GC9A01 = lines(process.env.BENCH_GC9A01);
export const SSD1680 = lines(process.env.BENCH_SSD1680);
export const SSD1681 = lines(process.env.BENCH_SSD1681);
export const ST7302 = lines(process.env.BENCH_ST7302);
export const MPU6500_SPI = lines(process.env.BENCH_MPU6500_SPI);

async function probe() {
  const found = new Map(); // Driver -> address
  const bus = await openCh341();
  try {
    if (PS) await bus.pins({ [PS]: true });
    for (const { Driver } of REFERENCES) {
      for (const a of Driver.addresses) {
        if (!(await bus.acks(a))) continue;
        if (Driver.chip.idWake) { // a chip whose ID reads only once woken
          await bus.write(a, Driver.chip.idWake);
          await new Promise((resolve) => setTimeout(resolve, Driver.chip.idWakeMs));
        }
        const [id] = await bus.writeRead(a, [Driver.chip.idRegister], 1);
        if (id === Driver.chip.whoAmI) { found.set(Driver, a); break; }
      }
    }
  } finally {
    await bus.close();
  }
  return found;
}

const found = await probe();

export const addressOf = (Driver) => found.get(Driver) ?? null;

// a describe() option: skip with the reason unless the chip is on the bench
export const onlyWith = (Driver) => ({
  skip: found.has(Driver) ? false : `no ${Driver.chip.name} on the bench (none at ${Driver.addresses.map((a) => `0x${a.toString(16)}`).join(' or ')} with ID 0x${Driver.chip.whoAmI.toString(16)})`,
});

// the first chip found, with its address: the CH341 test's reference
export const reference = REFERENCES.map((r) => ({ ...r, address: found.get(r.Driver) })).find((r) => r.address !== undefined) ?? null;
