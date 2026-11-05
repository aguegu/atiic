# Releases

## 1.3.14

- `Aht21`: Aosong's AHT21B at 0x38, from its datasheet (V1.0, May 2021):
  the status (0x71) checked for 0x18, a measurement (0xAC 0x33 0x00, 80
  ms, the busy bit), its CRC-8, the formulas. A chip needing Aosong's
  unpublished initialisation is refused. On r8845's CH341T: 28.1 C, 67.7 %
  RH. Host tests (108 in all), a board test.
- The AGS10 (TVOC) set aside: its datasheet asks I2C at 15 kHz or under
  (the CH341: 20 kHz at the least) and 3.0 V ± 0.1 (the dongle: 3.3 V);
  it answered at no clock.

## 1.3.13

- `Mlx90614`: Melexis' IR thermometer at 0x5A, from its datasheet (Rev
  021): RAM words with their PEC checked (the datasheet's Figure 6 and 7
  as host tests), 0.02 K a count, the error flag; its ID number. On
  r8845's (marked BAA: single zone) ambient 26.7 C, the room 26.6-27.0 C.
  Zone 1 alone: its config register's "dual IR sensor" bit is set (0xAFF4)
  and its zone 2 reads 38-55 C, noisy; `object(2)` is for a part known to
  be dual.
- The bench's I2C clock: chips state their top (`chip.maxSclHz`: the
  MLX90614's 100 kHz) and every board test opens at the slowest found; at
  400 kHz beside the MLX90614, a VL53L1X NACKed, at 100 kHz both work.
- Host tests (103 in all).

## 1.3.12

- `Sht20`: Sensirion's humidity and temperature sensor at 0x40, from its
  datasheet (Version 5, 10/2022): no-hold measurements, the maximum times
  waited, CRC-8 and the type bit checked, the datasheet's formulas (its
  example's CRC and 42.5 % as host tests). On r8845: 26.8 C, 69.9 % RH.
  The bench probe knows a chip by its own check when it has no ID register
  (`chip.identify`): the SHT20 by its electronic ID's CRCs.
- `Vl53l1x`: ST's time-of-flight sensor at 0x29, 16-bit register
  addresses, by ST's Ultra Lite Driver (its default configuration and
  sequence, BSD-3, the notice in the source; the same bytes as pre-1.0
  atiic's driver): continuous ranging, the ULD's range status. On r8845:
  ~1966 mm, valid, a reading every ~98 ms.
- Host tests (98 in all); board tests for both.

## 1.3.11

- `Max30102`: Maxim's (ADI's) pulse oximeter at 0x57, from its datasheet
  (19-7740 Rev 1): `init()` with the datasheet's tables as options (mode,
  sample rate, averaging, pulse width, ADC range, LED currents in mA), a
  reset first; `readFifo()` red and IR samples (18 bits), throwing on an
  overflow; `temperature()`. On r8845: 100 samples a second; no finger, red
  ~7,000 / IR ~2,300; a fingertip, ~120,700 / ~108,600, a pulse in it.
- Its die temperature waits on DIE_TEMP_RDY: TEMP_EN, though
  self-clearing, reads back 0 at once, so polling it read 0 C; the flag
  sets after 27.5-28.6 ms (the datasheet's 29).
- A bench reference for the CH341 test; host tests (89 in all).

## 1.3.10

- The BMX055 benchmark counts each chip's samples the way that's right for
  it, each measured over 10 s: the accelerometer by its new_data flag (by
  its data it undercounts: at rest 1 sample in 10 repeats the last); the
  magnetometer by its data (its data-ready flag overcounts: set again 0.3
  ms after a read, no new data, 12 times in 114); the gyro by its data.
  The limits ±10% of the nominal rates (the chips' own clocks: the
  accelerometer ~65 Hz for 62.5). 1.3.9's checks were set from too few
  runs and failed on the bench; three runs pass now.

## 1.3.9

- `test/advanced/bmx055.test.js`: the BMX055's chips polled, on I2C or SPI.
  Over SPI on r8845, ~2400-2600 reads/s; at the drivers' rates every
  sample (accelerometer 58-62 of 62.5, gyro 100, magnetometer 10); at the
  chips' top rates polling catches 95-98% (accelerometer 1956-1967, gyro
  1898-1912 of 2000), the drivers using no FIFO. A sample counted by its
  data with the clear-on-read flags masked (the accelerometer's new_data,
  the magnetometer's data ready): unmasked, each counted twice.

## 1.3.8

- The BMX055 over SPI: its three drivers unchanged, each on `SpiRegisters`.
  On r8845's CJMCU-900F (SDO1 and SDO2 both on MISO, PS on D4 driven low)
  CSB1 is the accelerometer, CSB2 the gyro, CSB3 the magnetometer, read
  off each select's chip ID. The BMX055 board tests run on I2C or SPI
  (`BENCH_BMX055_SPI`): all 14 pass on SPI. `docs/setup.md`: the wiring.

## 1.3.7

- The IMU benchmark's notes: accel+gyro at 8 kHz over SPI stays as it is
  (88-90 of 96 KiB/s). Tried: one SPI burst from FIFO_COUNTH for the count
  and the frames: on the MPU-6500 the register pointer walks on past
  FIFO_R_W (0x74) to 0x75 and on, so the frames read are garbage and the
  FIFO fills (1 kHz "read" at 6314 frames/s, nearly all off 1 g). The
  plain setup stays.

## 1.3.6

- `Ch341.spiSelected(cs, bytes)`: SPI with a chip select, the line driven
  low in the same USB transfer as the bytes (its command padded to a
  packet of its own, as flashrom does), high in the next: a round trip
  less than `pins()`, `spi()`, `pins()`. (The high can't join: a short
  SPI packet ends a transfer, and padding it would clock out bytes.)
  `SpiRegisters` uses it where the bus has it.
- The MPU-6500 over SPI with it: polling ~2080 reads/s (from ~1830);
  accel+gyro at 8 kHz still overflows, less: 88-90 KiB/s and 6-14
  overflows in 2 s (from 83-84, 27-28). What's left is mostly the wire:
  96 KB/s against the CH341's ~110. Host tests (81 in all).

## 1.3.5

- The IMU benchmark's accel+gyro at 8 kHz (12-byte frames, 96 KB/s): over
  SPI it overflows, 7087-7203 of 8000 frames/s (83-84 KiB/s), 27-28
  overflows in 2 s, 3 runs. Not the SPI's throughput (~110 KB/s) but its
  round trips: the 512-byte FIFO fills in 5.3 ms, a read cycle is six USB
  transfers (~3.8 ms), and a late one loses frames. Folding the chip
  select into the SPI transfer may bring it in: not tried.

## 1.3.4

- The IMU benchmark (`test/advanced/imu.test.js`) runs over SPI too
  (`BENCH_MPU6500_SPI`). The MPU-6500 on the CH341A's SPI: polling ~1830
  reads/s (25 KiB/s); its FIFO at 1 kHz every frame, and gyro alone at
  8 kHz every frame too (7934-7948 frames/s, 46.5 KiB/s, 3 runs), where on
  I2C at 400 kHz it overflows.

## 1.3.3

- `SpiRegisters` (`src/buses/spi-registers.js`): a register-addressed SPI
  device as the bus the I2C drivers use, `write(address, bytes)` and
  `writeRead(address, bytes, n)` over `spi()` and a chip-select line, bit 7
  marking a read, the address ignored. So `Mpu6500` runs over SPI
  unchanged: on r8845 a GY-9250 on the CH341A (NCS on D4) reads WHO_AM_I
  0x70, takes every write (SMPLRT_DIV read back three values), measures 1
  g and room temperature, and its FIFO at 1 kHz loses nothing.
- The gyro-settle check failed once, on the first run after wiring; then
  three runs and ten logged sleep/init cycles agreed within 0.3 deg/s (the
  limit is 1). Not reproduced; the board may have moved.
- Host tests (80 in all); `docs/setup.md`: the SPI wiring.

## 1.3.2

- The ST7302's high power mode, looked at again: at 16 and 32 Hz the panel
  blinks, still pictures as well as moving ones, with zhcong's gate scan
  (B8h 09h) or one line interval (05h): too much to use. Noted in the
  driver and `docs/setup.md`; low power at 4 Hz stays the default.

## 1.3.1

- `St7302`: Sitronix's ST7302 on r8845's 2.13" 122x250 reflective mono TFT
  (no BUSY; the picture needs power). zhcong/ST7302-for-arduino's set-up
  (MIT); upright frames (122 wide, 250 tall; the RAM's landscape a quarter
  turn clockwise) packed for its RAM, 12 pixels by 2 in 3 bytes: all of
  122x250 shows (a 3-pixel diagonal to each corner whole). A frame 4,125
  bytes, 38 ms over the CH341.
- Frame rates: `init()` ends in low power mode at 4 Hz, `frameRate(hz)`
  changes it. On the module, high power mode (16, 32 Hz) blinked, low power
  at 8 Hz ghosted, 4 Hz was fine; zhcong's set-up sets none, and the
  chip's default moved nothing in 0.8 s.
- `src/devices/frame.js`: `blankFrame()` and `plot()` shared by the
  e-papers and the ST7302 (still exported by `ssd1680.js`). Host tests (75
  in all); the board test leaves the upright card, labelled 122 and 250.

## 1.3.0

1.2.x closed (1.2.0-1.2.7): e-paper on the CH341. `Ch341.readPins()` reads
the panels' BUSY (D4); `Ssd1680` (r8845's 1.54" 152x152) and `Ssd1681`
(1.54" 200x200, the same driver at 200x200) do full updates (BUSY 2.10 s,
1.68 s), partial updates by display mode 2 (0.59 s, 0.50 s; no flash, no
ghost), and deep sleep with the RAM kept through the wake, so partial
updates go on after it. `demo/epaper-qr.js` puts a QR code on either and
leaves it there unpowered: on the 200x200, version 20 at 2 pixels a module
(666 bytes) scans on a phone, and the demo warns when a text just misses a
version that would draw bigger.

1.3.x: the ST7302 2.13" 250x122 reflective mono TFT (not e-paper: its
picture needs power), parked from 1.2.x (`docs/parked/st7302-smoke.mjs`,
untracked).

## 1.2.7

- `demo/epaper-qr.js`: the SSD1681 when `BENCH_SSD1681` is set (on the
  200x200, `https://i2c.ninja` is version 2 at 8 pixels a module, 200
  pixels); a warning when the text just misses a version that would draw
  bigger: "690 bytes need version 21, 1 px a module; version 20 holds 666
  at M: cut 24 bytes for 2 px a module". Version 20-M at 2 pixels (666
  bytes, 194 pixels) scans on a phone.

## 1.2.6

- `Ssd1681`: Solomon Systech's SSD1681 on r8845's 1.54" 200x200
  black/white e-paper (the same wiring, BUSY on D4). Its commands, RAM and
  flow are the SSD1680's (Rev 1.1, 9.1), so it is `Ssd1680` at 200x200:
  the window, orientation, partial updates and the RAM through sleep and
  wake all held first time. BUSY: a full update 1,682-1,685 ms, a partial
  494-498 ms.
- The e-paper board tests shared (`test/board/epaper.js`), run for
  `BENCH_SSD1680` or `BENCH_SSD1681`. Host tests (69 in all).

## 1.2.5

- `Ssd1680.wake()`: out of deep sleep mode 1 by a HW reset (the only way
  out) and the panel's settings, no SWRESET. The RAM comes through: on
  r8845's module a partial update right after a 3 s sleep, RAM 26h not
  rewritten, moved a square cleanly, no ghost. Without an earlier
  `sleep()`, `init()`. `init()` split into `hardwareReset()` and
  `configure()`.
- Host tests (67 in all); the board test sleeps (BUSY high), wakes (BUSY
  low) and makes a partial update.

## 1.2.4

- `docs/setup.md`: the QR demo's sizes on the 152x152 (6 down to 2 pixels
  a module, versions 2 to 14, capacities from qrcode-generator) and what
  scanned: 355 bytes as version 14-M at 2 pixels a module (146 pixels)
  scans on a phone; 374 bytes went to version 15, 1 pixel a module.

## 1.2.3

- `demo/epaper-qr.js` (`npm run demo:qr [text] [quiet modules]`): a QR code
  on the SSD1680 e-paper, the panel left asleep, readable unplugged.
  `https://i2c.ninja` as version 2-M at 6 pixels a module (150 of 152
  pixels) with no quiet zone scans fine on a phone; at the spec's margin it
  was 5 pixels (125). `qrcode-generator` 2.0.4 (MIT) as a dev dependency,
  the demo's only; its capacities match the QR tables quoted (versions
  2, 3, 6, 12 at L and M).

## 1.2.2

- `Ssd1680.showPartial(frame)`: a partial update, the chip's display mode 2
  (22h FFh, the waveform in the panel's OTP): only the pixels that differ
  from the last frame shown, no flash. On r8845's module BUSY 588-594 ms
  (a full update 2,100), about 650 ms with the RAM writes; eight in a row
  moving a square: no ghost, the border clean. A full update when nothing
  was shown since `init()`.
- `show()` writes the frame into RAM 26h as well (the previous image mode 2
  compares against), where it wrote zeros: the driver is for black/white
  panels (RAM 26h is red on three-colour ones).
- Host tests (65 in all); the board test moves a square by partial updates
  and leaves its card with a second label, the partial update's time,
  added by one.

## 1.2.1

- `Ssd1680`: Solomon Systech's SSD1680 e-paper controller, on r8845's
  1.54" 152x152 black/white module (the displays' wiring, BUSY on D4).
  The datasheet's operation flow (Rev 1.4, 9.1); `show(frame)` writes the
  RAM and runs a full update, returning BUSY's high time: 2,101-2,106 ms on
  the module, plus ~58 ms of RAM over the CH341. Frames a bit a pixel,
  `blankFrame()`, `plot()`. The RAM window at 0, 0 showed whole, the
  orientation as drawn, first try.
- `Ch341.readPins()`: D0-D7's levels by the status read (0xA0).
  `docs/ch341.md`: no longer claims a pull-up on a released D0-D5 (DS1
  lists them for D6 and D7 only).
- Host tests (63 in all); the board test leaves a card labelled with its
  first update's time.

## 1.2.0

1.1.x closed (1.1.0-1.1.5): SPI on the CH341 and three display drivers on
it, `DcsPanel`'s `St7735s` (0.96" 80x160), `Gc9107` (1.45" 60x160) and
`Gc9a01` (round 240x240), each in 12, 16 and 18 bits, with the
controller's scrolling, checked by eye on r8845 and left showing a card
that labels itself. Found on the way: the CH341 shifts LSB first only
(about 110-117 KB/s, a 240x240 frame about a second), the GC9107's 12-bit
code is the datasheet's other one, scrolling follows the panel's scan
lines only, and a round panel is a rectangle behind a circle.

1.2.x: e-ink displays.

## 1.1.5

- `docs/setup.md`, "The round module: a rectangle behind a circle": the
  GC9A01's memory, scan and every write are rectangles; 45,244 of its
  57,600 pixels show (78.5%), a frame sends 24,712 bytes to the corners;
  the rows' chords; the largest rectangle inside, 169x169; why skipping
  the corners hardly pays over the CH341 (windows cost round trips: ~11%
  at best in bands, more than it saves row by row, estimated).

## 1.1.4

- A note on scrolling's one direction (`dcs-panel.js`, `docs/setup.md`): the
  controller scrolls along the panel's scan lines only, which MADCTL can't
  turn; the bars held landscape scroll leftwards, the round GC9A01 upwards
  (6.9 ms a row, 146 a second on r8845, against about a second for a whole
  frame redrawn); a quarter turn of the round module makes it leftwards.

## 1.1.3

- `Gc9a01`: GalaxyCore's GC9A01 on r8845's round 240x240 IPS module (32.4
  mm across, the same wiring). Espressif's esp_lcd_gc9a01 inner registers
  (behind FE and EF), inversion on, BGR, the columns mirrored: a marker
  drawn above the red square showed on the right, with the red one, so a
  mirror, not swapped colours. A ring at the memory's edge shows whole.
  Its 12-bit format works (COLMOD 3) though the datasheet's serial sections
  show 16 and 18 only.
- `DcsPanel`: `mirrorX` (MADCTL's MX); a chip's scroll definition without
  BFA (the GC9A01's takes TFA and VSA alone). Host tests (58 in all).
- The board tests' round layout: rings at the edge (white, red, green,
  blue, 3 pixels each: white and green look wider than red and blue, the
  eye's doing, the data the same) and the self-labelled card upright in
  the circle's square. The scroll step's limit from the row's bytes: a
  240-pixel row 10.8 ms. On r8845: a frame about 1 s (16 bits), 0.97 (12),
  1.75 (18).

## 1.1.2

- `format(bits)`: a DcsPanel's pixel format changed without an init: what's
  on the panel stays, the next pixels are read in the new format, so
  formats can share a screen. Host test (55 in all).
- The display board tests leave a card that labels itself: inside a white
  border, thirds labelled 12, 16, 18 (a 5x7 digit font, `test/board/font.js`),
  each its pixel format's ramps. On the GC9107 all three formats checked by
  eye this way: steps in 12, smooth in 18.

## 1.1.1

- `Gc9107`: GalaxyCore's GC9107, on r8845's 1.45" 60x160 IPS module (same
  wiring as the ST7735S). Its panel needs the chip's inner registers set
  (Espressif's esp_lcd_gc9107 values behind FE and EF): the standard
  commands alone left a white haze over a quarter of the screen; with them
  it shows inverted unless INVON. BGR, 60x160 at column 34 (a whole-memory
  red fill under a bordered window: no red at any edge).
- Its 12-bit code is 0x03, as the ST7735S's: the datasheet (V1.2) says 001
  in its COLMOD table (6.2.28) and 011 in its 4-line serial section
  (4.2.2); on the module, side by side, 0x03 showed the card and 0x01
  nothing.
- `DcsPanel` (`src/devices/dcs-panel.js`): the two chips' shared code
  (commands, pixel formats, scrolling, drawing); `St7735s` and `Gc9107`
  give their own (memory rows, COLMOD codes, setup commands, the module's
  defaults). Host tests for the GC9107 (54 in all); the board tests shared
  (`test/board/panel.js`), run for `BENCH_ST7735` or `BENCH_GC9107`, the
  fill limits from each screen's bytes.

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
