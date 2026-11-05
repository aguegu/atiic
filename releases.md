# Releases

## 1.1.0

SPI: the CH341 drives an SPI device, and the first one is a display.

- `Ch341.spi(bytes)`: full duplex on SCK (D3), MOSI (D5), MISO (D7), chip
  selects by `pins()`. Mode 0, MSB first to the device: the CH341 shifts
  LSB first under every stream mode (r8845; WCH's `CH341DLL.H` gives its
  0x60 no bit-order bit), so atiic reverses each byte. Replies read while
  the packets go out (the CH341 stalls otherwise), 16 packets a round:
  about 110-117 KB/s, the same from 8 packets a round up to a whole screen
  in one; WCH's DLL says about 68 KB/s.
- Node's opener resets the CH341 (USB reset) on open: a run cut short left
  it taking no command. Driven lines hold over the reset.
- `St7735s`: the Sitronix ST7735S on 4-wire SPI (RES, DC, CS on any of
  D0-D5), r8845's 0.96" 80x160 IPS module's settings as defaults (BGR, no
  inversion, column 24). Colours `0xRRGGBB`; `bits: 12 | 16 | 18` picks the
  pixel format (a screen in 174, 227, 341 ms; a 12-bit odd count's padding
  checked by eye); `scrollArea()`, `scroll(n)`, `scrollRow(n)`,
  `scrollOff()` use the controller's scrolling, a strip chart's step 4.2 ms.
- `BENCH_ST7735` (`res=D0,dc=D1,cs=D2`) in `.env.local` turns on the display's
  board test; the pins test skips without a BMX055.
- Docs: `docs/ch341.md`'s SPI section (bit order, speed, sources: WCH's
  CH341 EVT), `docs/setup.md`'s display bench. Datasheets kept untracked in
  `docs/`: the ST7735S (V1.3), WCH's CH341 EVT header and the CH347's, for
  a CH347T adapter next (60 MHz SPI, MSB or LSB, high-speed USB).

1.0.14-1.0.19 led here: SPI and the driver (1.0.14), the bit order
(1.0.15, 1.0.17), the datasheet cited (1.0.16), the pixel formats
(1.0.18), scrolling (1.0.19).

## 1.0.13

- The setup drawing and the V357's header table mark CS1 and CS2 as the
  chip's D1 and D2 too (pins 16 and 17), as CS0 is D0: lines `bus.pins()`
  can drive, for later.

## 1.0.12

- The setup drawing's BMX055 module as it is: a CJMCU-900F, its ten pins
  (3V3, GND, SCL, SDA, PS, SDO1, SDO2, CSB1, CSB2, CSB3, the user's reading),
  wired to the CH341A's VCC, GND, SCL, SDA in the same order (rows 4-7, the
  wires side by side) and CS0 to PS; the guide's wiring table to match.

## 1.0.11

- `docs/setup.md`: the CH341A and BMX055 bench, step by step, with a
  Fritzing-style drawing (`docs/setup-bmx055.svg`): the V357 CH341A from its
  photo (the 2x8 header's labels; the voltage pair on 3V3, the board's
  default being 5V; the mode jumper on I2C/SPI), five wires, CS0 (the
  chip's D0) to PS. The module drawn with only the five pins wired, its
  layout not known here.

## 1.0.10

- `Ch341.pins({ D0: true, ... })`: the CH341's D0-D5 driven high or low, or
  released to an input (`null`), by its UIO stream (flashrom's command), in
  the adapter's queue, the lines not named kept. Host tests: the packet's
  bytes, D6/D7 refused, the lines remembered (36 in all).
- `BENCH_PS`: the CH341 line wired to a BMX055's PS pin, from an untracked
  `.env.local` (`test:board` and `test:advanced` read it, Node's
  `--env-file-if-exists`); the bench probe drives it high first. On r8845, a
  CH341A (it works as the CH341T did: the same 1a86:5512, the same release
  0x0304) with D0 on PS: floating, nothing answered; driven high, all three
  chips.
- Found on the way: PS driven low while it runs puts the BMX055 on SPI, but
  back high only the gyro and the magnetometer returned; the accelerometer
  stayed on SPI until the module was powered off and on. The datasheet has
  PS wired fixed; the pins test drives it high only.
- Board 19 of 19, three runs (the pins test new).

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
