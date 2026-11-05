# Releases

## 1.0.9

- The BMX055's magnetometer (`src/devices/bmx055-mag.js`,
  `import { Bmx055Mag } from 'atiic'`), the last of its three chips:
  `init()` (powered, the chip ID, the factory trims read, the regular preset
  nXY 9 and nZ 15, normal at 10 Hz), `measure()` (the field in uT, an axis
  that overflowed or has no reading yet `null`, not 0), `sleep()`
  (suspend). Registers and presets from the datasheet; the data and trim
  layouts and the floating-point compensation from Bosch's BMM150 Sensor API
  (BSD-3-Clause, its notice in the file, a note in the README). Where the
  two differ (the regular preset's nZ: 15 in the BMX055's datasheet, 8 in
  the 2020 API) the datasheet is followed.
- Measured on r8845's module (0x13): |B| 58.4 uT on the desk; after normal
  mode the first reading (~10 ms) holds none yet, the second (~20 ms) is
  right, 6 of 6: a measurement is 9.8 ms (the datasheet's formula); the
  driver waits 50 ms.
- The bench probe wakes a chip before its ID where it needs it (`idWake`:
  the magnetometer's ID reads 0x00 suspended).
- Host 34 of 34 (the compensation checked on numbers worked by hand);
  board 18 of 18, three runs.

## 1.0.8

- The BMX055's gyro (`src/devices/bmx055-gyro.js`,
  `import { Bmx055Gyro } from 'atiic'`), the second of its three chips:
  `init(scale)` (±125 to ±2000 deg/s; soft reset, the range, 100 Hz with
  its 32 Hz filter, normal power), `measure()` (deg/s), `sleep()`
  (suspend). Its facts from the datasheet (BST-BMX055-DS000-02, the GYR
  registers), cross-checked with Linux's bmg160 driver. No temperature: the
  BMX055's gyro has none (0x08 reserved).
- Measured on r8845's module (0x69): the rates settle within 0.5 deg/s about
  30 ms after normal mode (24 wake-ups), the datasheet's start-up time; the
  kernel waits 80 ms as a margin, the driver 50.
- Host 28 of 28; board 14 of 14, three runs (the CH341's 4, the
  accelerometer's 5, the gyro's 5; the MPU tests skipped).

## 1.0.7

- The BMX055's accelerometer (`src/devices/bmx055-accel.js`,
  `import { Bmx055Accel } from 'atiic'`), the first of its three chips:
  `init(scale)` (soft reset, the range, 62.5 Hz, normal power), `measure()`
  (12 bits to g, the temperature), `sleep()` (suspend). Its facts from
  Linux's bmc150-accel driver first (Bosch's datasheet wouldn't download),
  then every one checked against the datasheet (BST-BMX055-DS000-02 rev 1.1,
  kept untracked in `docs/`, Bosch's notice). On r8845's module at 0x19:
  the module answered nothing until its PS pin was tied to VCC.
- Board tests find each chip by its own ID register at its addresses
  (`test/board/bench.js`); `ch341.test.js` takes whichever chip is there
  as its register reference. Host 24 of 24, board 9 of 9 (the MPU tests
  skipped, no MPU on the bench).

## 1.0.6

- MPU-6500 (`src/devices/mpu6500.js`, `import { Mpu6500 } from 'atiic'`), on
  r8845's "GY-9250", which carries one (WHO_AM_I 0x70; no magnetometer at
  0x0C, so no MPU-9250). The MPU-6050's driver with its chip facts in one
  place (`static chip`) and the MPU-6500's own: WHO_AM_I 0x70, the
  temperature raw / 333.87 + 21, the FIFO 512 bytes, the accel filter at
  ACCEL_CONFIG2 in the same burst (facts as Linux's inv_mpu6050 driver has
  them; TDK's PDFs no longer download).
- Measured on the board: the gyro settled within 0.5 deg/s by 66 ms after
  `init()` at worst (24 wake-ups; the MPU-6050 needed 110), so a 100 ms wait.
  And with the gyro's filter off the MPU-6500 samples at 8 kHz whatever
  SMPLRT_DIV says (2, 2.67 and 4 kHz each filled at ~4400 frames/s and
  overflowed): `startFifo` refuses a divider with the filter off on it,
  test first (red, then green).
- Board and advanced tests read WHO_AM_I at 0x68 first and run that chip's,
  the other's skipped with the reason; the advanced FIFO rows a chip can't
  run skipped too. `test/advanced/imu.test.js` (was mpu6050). The fake chip
  shared (`test/host/fake-mpu.js`).
- Host 20 of 20; board 9 of 9 three runs (the MPU-6050's skipped); advanced
  4 of 4 with 3 skipped. On the GY-9250 the chip's clock runs a little slow:
  991-995 frames/s for 1000 (the GY-521's ran fast, 1006-1007).

## 1.0.5

- `npm run test:advanced` (`test/advanced/`): measurements as tests, the
  benchmarks from the tryout. MPU-6050 at 400 kHz, 2 s a row, a table
  printed: polling ~1600 reads/s keeps up at 62.5 Hz and misses ~1.5 % at
  1 kHz (988-992 new samples/s of the chip's 1007); the FIFO loses no frame
  up to gyro alone at 4 kHz; gyro at 8 kHz overflows (~28 KiB/s through).
  7 of 7, three runs.

## 1.0.4

- [docs/setup.md](docs/setup.md): the bench, step by step (jumpers, wiring,
  udev, tests, a first read), with a Fritzing-style drawing
  (`docs/setup.svg`): the common CH341T 2-in-1 dongle (yellow jumper I2C/TTL,
  green 3V3/5V) on I2C and 3V3, four wires to a GY-521.
- MPU-6050: `init()` waits for the gyro to settle (150 ms), not its typical
  start-up (30 ms + a sample, 46 ms). Found running the doc's example: right
  after a wake-up the gyro read up to 100 deg/s off. Measured on r8845:
  within 0.5 deg/s 80 ms after the wake-up, 110 ms when woken within 5 ms of
  going to sleep. Board test first: a gyro reading right after `init()` from
  sleep agrees within 1 deg/s with one 300 ms later (red 3 of 3 before, green
  5 of 5 after; 100 ms still failed on z).
- Host 14 of 14, board 9 of 9.

## 1.0.3

- MPU-6050, the first driver (`src/devices/mpu6050.js`, `import { Mpu6050 }
  from 'atiic'`): adapter-free, any bus with `write` and `writeRead`.
  `init(gyroscopeScale, accelerometerScale)` checks WHO_AM_I, writes its
  config in one burst and waits for a sample at the new settings (30 ms gyro
  start-up + 16 ms); `measure()`; `sleep()`; FIFO mode (`startFifo`,
  `readFifo`, `stopFifo`), every frame through up to gyro 4 kHz at 400 kHz.
- Tests: host 8 against a fake MPU-6050 (its registers, FIFO and every write);
  board 4 on r8845 at 400 kHz (1 g at rest, 1 kHz FIFO none lost). Host 14 of
  14, board 8 of 8 three runs in a row.

## 1.0.2

- The CH341 adapter (`src/adapters/ch341`, [docs/ch341.md](docs/ch341.md)),
  back from the tryout: `scan`, `write`, `read`, `writeRead` over WebUSB; in
  Node by the usb package, which now detaches the kernel's spi-ch341 itself
  (the tryout only ran because a probe had detached it before).
- Tooling: ESLint 10.14.0 as iap.meshmass.com; tests on Node's own runner
  (`node:test`, no test dependency: `npm test`, host, no hardware;
  `npm run test:board`, r8845's CH341T with an MPU-6050); minimatch 11.0.4
  override (npm audit: 0).
- Host 6 of 6, board 4 of 4 three runs in a row, from spi-ch341 bound.

## 1.0.1

- MIT license (0.5.1 and before: MPL-2.0).

## 1.0.0

- Started over from an empty tree: the CH341 in I2C mode replaces the STC8H
  Atiic bridge. 0.5.1 (tag `0.5.1`) is the last release on the old bridge.
