// What's on the bench: each known chip looked for at its addresses by its
// own ID register, once before the tests are laid out, so each chip's tests
// run only with that chip there (and skip with the reason otherwise).
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { openCh347 } from '../../src/adapters/ch347/node.js';
import { Mpu6050, Mpu6500, Bmx055Accel, Bmx055Gyro, Bmx055Mag, Max30102, Sht20, Vl53l1x, Mlx90614, Aht21, Ina231, Hmc5883l, Adxl345, Itg3200, SpiRegisters } from '../../src/index.js';

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
  // MAX30102: its configuration 0x08-0x0d, shut down (SHDN: the registers
  // read and written as usual); LED1_PA takes any byte
  { Driver: Max30102, wake: [0x09, 0x80], staticFirst: 0x08, staticLast: 0x0d, writable: 0x0c, values: [0x5a, 0xa5] },
];

// the other chips looked for: no 8-bit registers for the CH341 test to try
// (Sht20, Aht21: commands only; Vl53l1x: 16-bit register addresses;
// Mlx90614: words with a PEC; Ina231: 16-bit registers; Hmc5883l: known
// by its three ID bytes; Adxl345: not tried as the CH341's reference;
// Itg3200: WHO_AM_I and not an MPU's, after the MPUs are looked for)
const OTHERS = [Sht20, Vl53l1x, Mlx90614, Aht21, Ina231, Hmc5883l, Adxl345, Itg3200];

// BENCH_ADAPTER (from .env.local, or the environment): the I2C bus the
// chips' tests run on, ch341 (the default) or ch347 (a CH347T in mode 1 or a
// CH347F). The SPI and pin tests stay on the CH341 (the CH347 adapter has no
// SPI or pins yet)
export const ADAPTER = process.env.BENCH_ADAPTER || 'ch341';
const OPENERS = { ch341: openCh341, ch347: openCh347 };
if (!OPENERS[ADAPTER]) throw new Error(`BENCH_ADAPTER ${ADAPTER}: ch341 or ch347`);
export const openBus = (hz) => OPENERS[ADAPTER](hz);

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
// MPU-6500 on the CH341A's SPI, its NCS: "cs=D4"), BENCH_BMX055_SPI (a BMX055
// on the CH341A's SPI: its three chip selects and PS, "accel=D0,gyro=D1,
// mag=D2,ps=D4"; PS driven low, the module on SPI)
const lines = (v) => (v ? Object.fromEntries(v.split(',').map((kv) => kv.trim().split('='))) : null);
export const ST7735 = lines(process.env.BENCH_ST7735);
export const GC9107 = lines(process.env.BENCH_GC9107);
export const GC9A01 = lines(process.env.BENCH_GC9A01);
export const SSD1680 = lines(process.env.BENCH_SSD1680);
export const SSD1681 = lines(process.env.BENCH_SSD1681);
export const ST7302 = lines(process.env.BENCH_ST7302);
export const MPU6500_SPI = lines(process.env.BENCH_MPU6500_SPI);
export const BMX055_SPI = lines(process.env.BENCH_BMX055_SPI);

// an AT24C08 EEPROM on the I2C: its first block's address ("0x50"), from
// .env.local or the environment. No ID register to look for it by; its
// board test writes (and puts back) 24 bytes at 0x2F8
export const AT24C08 = process.env.BENCH_AT24C08 ? Number(process.env.BENCH_AT24C08) : null;

async function probe() {
  const found = new Map(); // Driver -> address
  const bus = await openBus();
  try {
    if (PS && ADAPTER === 'ch341') await bus.pins({ [PS]: true });
    for (const Driver of [...REFERENCES.map((r) => r.Driver), ...OTHERS]) {
      for (const a of Driver.addresses) {
        // an address a chip found before holds: not asked again (an
        // ITG-3200's idWake writes 0x3E, a BMX055 gyro's FIFO_CONFIG_1)
        if ([...found.values()].includes(a)) continue;
        if (!(await bus.acks(a))) continue;
        if (Driver.chip.idWake) { // a chip whose ID reads only once woken
          await bus.write(a, Driver.chip.idWake);
          await new Promise((resolve) => setTimeout(resolve, Driver.chip.idWakeMs));
        }
        if (Driver.chip.identify) { // a chip known by a check of its own, no ID register
          if (await Driver.chip.identify(bus, a)) { found.set(Driver, a); break; }
          continue;
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

// an I2C clock for the bench: hz, or the slowest top among the chips found
// (chip.maxSclHz: an MLX90614 on the bus holds everyone to 100 kHz)
export const sclFor = (hz) => Math.min(hz, ...[...found.keys()].map((D) => D.chip.maxSclHz ?? Infinity));

// a describe() option: skip with the reason unless the chip is on the bench
export const onlyWith = (Driver) => ({
  skip: found.has(Driver) ? false : `no ${Driver.chip.name} on the bench (none at ${Driver.addresses.map((a) => `0x${a.toString(16)}`).join(' or ')}${Driver.chip.identify ? '' : ` with ID 0x${Driver.chip.whoAmI.toString(16)}`})`,
});

// the first chip found, with its address: the CH341 test's reference
export const reference = REFERENCES.map((r) => ({ ...r, address: found.get(r.Driver) })).find((r) => r.address !== undefined) ?? null;

// a BMX055 chip's benches, I2C and SPI: { label, skip, open() } where open()
// gives { bus, regs, address }, regs the bus its driver takes (the CH341 on
// I2C; on SPI, SpiRegisters on the chip's select, PS driven low first)
export function bmx055Benches(Driver, chip, sclHz) {
  return [
    {
      label: 'on I2C', skip: onlyWith(Driver),
      open: async () => {
        const bus = await openBus(sclFor(sclHz));
        return { bus, regs: bus, address: addressOf(Driver) };
      },
    },
    {
      label: 'on SPI', skip: { skip: BMX055_SPI ? false : 'no BENCH_BMX055_SPI: no BMX055 on the SPI' },
      open: async () => {
        const { ps, accel, gyro, mag } = BMX055_SPI;
        const bus = await openCh341();
        await bus.pins({ ...(ps ? { [ps]: false } : {}), [accel]: true, [gyro]: true, [mag]: true });
        return { bus, regs: new SpiRegisters(bus, { cs: BMX055_SPI[chip] }), address: 0 };
      },
    },
  ];
}
