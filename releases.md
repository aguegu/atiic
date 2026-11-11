# Releases

## 1.6.1

- **`St7789`, Sitronix's ST7789** (a 240x320 module, the user's, on the
  CH347F EVT: "it is a ST7789, 240x320"), from its datasheet (ST7789V
  Version 1.3, 2014/03): a 240x320 frame memory, COLMOD 0x53/0x55/0x66, the
  scroll definition with BFA; DcsPanel's commands, no setup beyond them.
  The module's settings found by eye with the user: inverted (without INVON
  each colour showed its complement), RGB order, at 0, 0. `st7789.test.js`
  (BENCH_ST7789) 7/7 on the CH347F; a full screen in 28.5 ms at 60 MHz.
- **The CH347F after a missing device**: it answers a refused address and
  nothing more of that packet (the CH347T answers every byte), and atiic
  waited on, its read cancelled and the transfers after it with it. A
  refusal now ends the wait, a stop following. `ch347.test.js` 5/5 on the
  CH347F (was 1/5); host tests for it.
- docs/ch347.md: the CH347F's SPI and I/O lines, an ST7789's wiring and
  speeds, and a wedge still open.

## 1.6.0

A new dongle: WCH's CH347F (a minor version, the user: "we can bump atiic minor
version with new dongle support").

- **The CH347F's I2C works** (the user's CH347F EVT on r8845: "I would
  like to know about the jumper setup, so we could get it on mode 1"; it has
  no modes and no jumper for it). Its SCL and SDA start as UART1's flow
  control, and every I2C transfer hung. On opening a CH347F (55DE) the
  adapter now sends WCH's pin switch for I2C, as WCH's Linux driver does
  (USB20_CMD_FUNC_SWITCH 0xe2, its index 3), and refuses to open if the
  reply isn't success. Measured: the EVT board's 24C02 at 0x50 scanned,
  written and read back. A CH347T in mode 1 is untouched. docs/ch347.md has
  the CH347F's interfaces and the command; host tests for both chips and a
  refused switch.
- **`docs/ch347f-evt.svg`**, the CH347F EVT's cheatsheet (from WCH's
  photo and KiCad design, drawn by ch32v00x's `scripts/cheatsheets`): its
  headers pin by pin, IO0-IO7 where they are, the three jumpers (JP1 for
  VIO, P8 the flash's chip select, P7 JTAG's pin 7), I2C on UART1's
  flow-control pins.

## 1.5.11

- **`Spl06`, Goertek's SPL06-001 barometer** (the user's CJMCU module on
  r8845's dart, from its datasheet, Version 7.0, not copied: Goertek marks
  it confidential): at 0x77 or 0x76, known by its ID 0x10; a soft reset,
  ready awaited, its coefficients decoded (Table 10: 12-, 20- and 16-bit),
  its 5.6 compensation with Table 4's scale factors; its Table 5 modes,
  weather, indoor (the default) and sports, measured in the background,
  the result shift above 8 times. A mode change waits out the old mode's
  measurement and clears its result: before, one could be read with the
  new scale (833.63 hPa among 1020.10s). On r8845: 1020.1 hPa, 20.5 C (the
  AHT30 beside it 20.57 C), a still room's spread 0.9 Pa at indoor, 0.1 at
  sports. Host tests (198 in all); board test 3/3, twice.
- **The AHT30 is read by `Aht21`** (the user's module on r8845's dart, with
  its datasheet, Aosong, June 2024, now in docs/): the same command, wait,
  7 bytes, CRC-8 and formulas as the AHT21B, status 0x18 alike, and no ID
  register, so the two aren't told apart: the driver's name is "AHT21B /
  AHT30", its errors "AHT2x". The AHT30's power-up is 5 ms, its pace a
  reading a second or more. Board test 2/2 on the AHT30: 21.9 C, 44.1 % RH.

## 1.5.10

- **`Sht3x`, Sensirion's SHT3x-DIS** (SHT30, SHT31, SHT35; the user's
  SHT30 on r8845's dart, from its datasheet, Version 7, 2022): at 0x44 or
  0x45, single-shot measurements at high, medium or low repeatability
  (Table 9's commands, Table 5's longest waits: 15.5, 6.5, 4.5 ms), both
  words' CRCs checked, the datasheet's formulas; `hold: true` for a bus
  that waits on a held SCL (dart: 13-14 ms a reading against 16-19);
  known by its status register's CRC. The bench looks for it before the
  INA231 (0x40-0x4F). Host tests; board test 3/3, three runs with an SHT20
  and a BH1745NUC on the same bus (10/10 all three).

## 1.5.9

- **`Sht20`: its resolution, and hold master on dart** (the user: "0.5hz
  looks not that active", then "dart is waiting sht20 on the bus, right?").
  `setResolution('12/14' | '8/12' | '10/13' | '11/11')` reads the user
  register and changes only bits 7 and 0 (Table 8: its reserved bits "must
  not be changed"; r8845's module keeps 0x3A's); the waits follow Table 7;
  `periodMs()`, the shortest period at 10 % active (2.3: self-heating under
  0.1 C): 1140 ms at 12/14 bits, 520 at 10/13, 260 at 11/11 and 8/12.
  `new Sht20(bus, 0x40, { hold: true })`: hold master mode (0xE3, 0xE5), the
  trigger and the read one transaction, the sensor holding SCL until done,
  for a bus that waits on it (dart, `bus.speed(hz, Sht20.STRETCH_MS)`). On
  r8845's dart: a reading 117/55/28/28 ms without hold, 91/42/23/22 with
  (12/14, 10/13, 11/11, 8/12 bits), the same air. Board test 5/5 on dart.
- **`Bh1745`, ROHM's BH1745NUC colour sensor** (the user's module, on
  r8845's dart with an SHT20), from its datasheet (Rev.002, 2016): known
  by its part ID (0x0B in 40h) and ROHM's manufacturer ID (0xE0 in 92h),
  at 0x38 or 0x39; a software reset, then the measurement time (160-5120
  ms) and gain (1x, 2x, 16x); `measure()` waits for VALID and gives red,
  green, blue and clear as counts (no lux: the datasheet gives no formula).
  Host tests; a board test, 16x and 4x the time each giving about that
  many counts (r8845, a dim room: 15.8-16.2 and 4.0-4.1 times), 5/5 with
  the SHT20's twice.
- **`Aht21`'s check wants the busy bit clear too**: a BH1745NUC at the same
  0x38 reads 0xFF there, which had passed for the calibration bits.
- **The bench looks for the SHT20 before the INA231** at 0x40: the INA231's
  check reads 0xFE, an SHT20's soft-reset command (found on dart, where an
  SHT20 stopped answering after it).

## 1.5.8

- **dart's command set 1.1** (its firmware 0.02): `speed()` takes any SCL
  from 7327 Hz to 400 kHz on a 1.1 dart (`SPEED_MIN`, `SPEED_MAX`; 1.0:
  100 and 400 kHz), for a device that wants it slow (the AGS10: 15 kHz or
  under). A bus held low names the line: `bus held low: SCL (at 0x1a)`,
  `e.held`; a scan reports a bus error instead of an empty bus. A 1.0
  dart's `BUS_BUSY` reads as before. `docs/dart.md` for 1.1; host tests
  (179 in all). On r8845: a VL53L1X through dart at 10, 100 and 400 kHz,
  the same distance within 4 mm. The AGS10 tried again on dart at 10 kHz:
  its module holds SCL low from power-up (README, `docs/setup.md`).

## 1.5.7

- **The VL53L1X's other numbers and its region of interest.** `measure()`
  gives, besides the distance and status, `signal` (kcps of its own light
  back), `ambient` (kcps of the background) and `spads` (the SPADs used),
  as ST's GetSignalRate, GetAmbientRate and GetSpadNb, all from one 17-byte
  read of 0x89-0x99 (as the ULD's GetResult). `roi({ width, height, centre
  })` narrows its view to 4-16 SPADs a side, centred on SPAD 199 by default;
  `Vl53l1x.spadAt(row, column)` gives ST's SPAD numbers (the table in
  SparkFun's SparkFun_VL53L1X.h). On dart at r8845, a target at ~1 m:
  16 x 16 215 SPADs and ~8.6 Mcps, 8 x 8 53 SPADs and ~2.5 Mcps, 4 x 4 12
  SPADs and ~0.6 Mcps with status 2 (signal fail) every time.
- **The timing budgets ST's datasheet allows** (DS12385 rev. 8, 3.5.2: 20 ms
  the minimum, short mode only; 33 ms the minimum in every mode): the ULD's
  15 ms short and 20 ms long, offered in 1.5.6, are refused now. Long mode
  at 20 ms had read ~6 cm short of the others.
- The board test, on dart at r8845: 11/11.

## 1.5.6

- **The VL53L1X's distance mode and timing budget**: `configure({ mode,
  budget, period })`, with the register values of ST's Ultra Lite Driver
  (SetDistanceMode, SetTimingBudgetInMs, SetInterMeasurementInMs; BSD-3,
  its notice in the file). Modes `'short'` and `'long'`; budgets 15 (short
  only), 20, 33, 50, 100, 200, 500 ms; the period from one ranging to the
  next defaults to the budget. Anything ST has no values for is refused.
  The board test, on dart at r8845, a still target at ~0.94 m, ten readings
  each:

  | budget | short: ms a reading, sd | long: ms a reading, sd |
  |---|---|---|
  | 15 | 14.9, 4.0 mm | |
  | 20 | 21.1, 3.3 mm | 19.8, 5.5 mm (~877 mm, 6 cm short) |
  | 33 | 34.0, 1.3 mm | 32.7, 1.8 mm |
  | 50 | 49.5, 0.9 mm | 49.6, 2.4 mm |
  | 100 | 99.3, 0.6 mm | 99.3, 1.4 mm |
  | 200 | | 198.7, 0.8 mm |

## 1.5.5

- **The MPU-6500's datasheet tolerances as a diagnostic** (the user: "we just
  show what we get from the sensors taking no credit on it"): from
  PS-MPU-6500A-01 rev. 1.1, table 2 (sensitivity initial tolerance +/-3 %,
  zero-g +/-60 mg on every axis, both tested in production; cross-axis
  +/-2 %): |a| at rest, any orientation, within 1 +/- 0.154 g; outside it
  the test says so ("the module, not the driver") and still passes, its
  pass window the driver's 0.75-1.25 g. On r8845 the CH347's module (1.19 g)
  is outside, dart's (0.975 g) inside. The MPU-6050's test gets no
  tolerance until its datasheet is read.

## 1.5.4

- **The MPU board tests check the driver, not the module** (the user: "fix
  both in atiic", after a CH347 and dart side by side on r8845, a module on
  each). `test/board/imu.js`, one copy for the MPU-6050, MPU-6500 and
  MPU-6500 SPI tests: |a| at rest within 0.75-1.25 g (a wrong range reads
  0.5 or 2 g; one module read 1.19 g every run, on any adapter: its offset,
  now a diagnostic, not a failure); the FIFO's rate counted from its first
  sample, not from `startFifo()` (from there both adapters read 0.943-0.996
  samples a ms, under the old 0.95 now and then: the sensor's start-up), and
  each sample's |a| against the same module's reading at rest (within
  0.05 g). The MPU-6500's test: 10/10 on the CH347 and 10/10 on dart, 300
  samples in 300-301 ms after the first on both.

## 1.5.3

- **A dart is told by its answer, not its name** (the user: "but why there
  is a hard coded string match for it?"): `open()` no longer matches the
  product string (a rename broke every host that knew the old one: i2c.ninja
  1.6.1 refused "Dart"). It sends INFO and takes a dart by the reply: the op
  and tag echoed, the reply whole, a command set major it speaks. No answer
  within `IDENTIFY_MS` (1 s; `open(speed, { identifyMs })`), or another
  reply, is "not a dart", the device closed. `PRODUCT_NAME` gone. Tests: any
  name opens; a device that never answers is refused in identifyMs; one
  answering another op is refused.

## 1.5.2

- **dart's `close()` releases its interface** before closing the device, as
  the CH341's and CH347's do: without it a second open in the same process
  (`test/board/bench.js` probes the bus, then a test opens it) failed with
  `claimInterface error: interface is busy` (found running the MPU-6500's
  board test on dart, r8845).
- dart's product string: one ending in "dart", any case, is taken; the
  user named it "Dart" (it was "dart"), the manufacturer "Sourcekit" (was
  "sourcekit"); a browser's USB chooser shows "Dart".
- `test/board/mpu6500.test.js` on dart (r8845, `BENCH_ADAPTER=dart`), its
  first chip test on it: 6 runs, 4 green; 2 failed the FIFO test narrowly
  (a sample at |a| 1.109 g against 1.1; 285 samples in 300 ms against 95 %).
  Not compared with a CH341 yet (none plugged in): open, in dart's notes.

## 1.5.1

- **dart's command set has a version** (the user: "a protocol version is a
  good idea", the command set kept whatever chip a dart is built on): INFO
  starts with it (uint16, major high byte, minor low; 1.0), the firmware's
  version after it. `open()` reads INFO and refuses a major it doesn't speak
  (`PROTOCOL_MAJOR` 1), taking any minor. `info()` gives `protocol`. The
  fake dart's tests: a newer minor taken, another major refused.

## 1.5.0

- **dart, a third adapter** (the user: "let's move to atiic to support it",
  a minor version for it): the user's USB-to-I2C bridge (docs/dart.md), `ffff:da92` "sourcekit" "dart", over WebUSB as the CH341
  and CH347. `src/adapters/dart` (`Dart`, `FILTERS`, `DartError`;
  `node.js`'s `openDart(speed)`), the same bus as the other two (`scan`,
  `write`, `read`, `writeRead`, `acks`) and `info()`, `speed(hz,
  stretchMs)`. What it adds: it waits for a held SCL (up to a stretch limit,
  2 ms by default); a refused data byte throws `0x.. refused byte k`, told
  from a missing device's `no ack from 0x..`; a transaction and a whole scan
  each one USB round trip. `open()` checks the product string ("dart":
  0xffff is nobody's vendor ID). `test/host/dart-protocol.test.js` (10, a
  fake dart); `test/board/bench.js` takes `BENCH_ADAPTER=dart`. The
  firmware's own bench test, on the same command set, 19/19; this adapter
  on dart too: info, scan, a 40-byte write read back at 400 kHz, plain
  reads continuing, acks, `0x52 refused byte 5`, `no ack from 0x2a`, 100
  kHz with a 90 ms stretch limit read back by `info()`. No chip named (the
  user). The firmware isn't published.

## 1.4.33

- **docs/ch347.md, which line for which job** (the user's GC9A01 wiring and
  what they saw at plug-in): IO4 (ACT) is high from power-up and low once
  USB is configured, so a backlight on it lights at plug-in, then stays
  dark until the program turns it on; good for a backlight or a RES, not a
  chip select. The GC9A01 example wired so: RES IO2, DC IO5, CS IO6, the
  backlight IO4, run at 60 MHz.
- Tagged `1.4.33`: the CH347 with its lines as IO0-IO7, for what depends
  on atiic by tag (i2c.ninja; ch32v00x's ch347/apps/attitude pins a commit).

## 1.4.32

- **The CH347's lines are IO0-IO7** (the user: one name, as the board's back
  prints it; "less noun terms in sight"): `pins()`, `readPins()` and the
  GPIO status use `IO2`, `IO4` ...; `pins()` still takes WCH's `GPIOn` and
  the print's `CS0`, `CS1` (IO2, IO5), so code written with them runs.
  `readPins()`'s keys change from `GPIOn` to `IOn`. docs/ch347.md says where
  the names come from (WCH's datasheet and DLL GPIOn, its EVT schematics
  GPn, the board IOn: the same numbers; digital only, no ADC).
- Since 1.4.31, in plain commits: every CH347T line in mode 1 an I/O (IO2
  and IO5 taken from the chip selects right after the SPI config, measured
  on a loopback: the config gives pin 5 back, pin 9 only a replug); IO7
  measured a full digital I/O on the mode switch; `readPins()`; the board
  sheets without the "tested" ticks, the SPI display's wiring or pin
  ranges.
- **The CH347T sheets in IOx**: the board sheet's badges `IO2 (CS0)` ... and
  its notes; the pinout sheet brought up to date (five I/O lines in a row,
  was three GPIOs and two chip selects; the display wiring out, as on the
  board sheet).

## 1.4.31

- The jumper caps see-through, their spring contact inside (the user: to
  see which two pins are joined): a metal strip from one pin to the
  other, under the cap's tint (CH341A and CH341T).

## 1.4.30

- The jumpers drawn as one part each (the user): their three pins in an
  outlined base (CH341A and CH341T); the CH341A's exactly on the side rows'
  columns (the I2C/SPI jumper under the left row, the 3V3 pair under the
  right row and one pitch in), where 1.4.29 had them by the board's width.

## 1.4.29

- The CH341A's jumpers on the side rows' grid (the user: the same span,
  nothing overlapping): each jumper's first pin a pitch below the last
  hole, its pins a pitch apart, the I2C/SPI jumper under the left row and
  the 3V3 pair under the right; the board a little longer for them, the
  regulator beside the chip.

## 1.4.28

- The CH341A table's cells D0 (CS0), D1 (CS1), D2 (CS2) (the user): atiic's
  name, the print beside it.

## 1.4.27

- The CH341A board drawn with its header's silkscreen, as on the front
  photo (the user): the outer row's names above its pins, the inner row's
  below (CS0, CS1, CS2 there as printed), so the table's D0-D2 meet the
  board's CS0-CS2 along the leader lines; the table a little higher for
  them.

## 1.4.26

- The CH341A sheet without CS0-CS2 (the user): the header's three cells
  D0, D1, D2, digital I/O, as atiic names them; a note that D0, D1, D2
  and D4 can each be a chip select, so up to four SPI devices share SCK,
  MOSI and MISO at once (a BMX055's three chips ran on D0-D2).

## 1.4.25

- The CH341A sheet's D0-D2 and D4 as "digital I/O" (the user: "a free
  line" misleads), D6 "digital input", the legend to match; SPI's chip
  select "any of D0-D2, D4".

## 1.4.24

- The CH341A sheet names CS0-CS2 as what they are to atiic, D0-D2 (the
  user): plain lines like D4 ("a free line"), the header cells D0, D1, D2
  with "printed CS0 ..." beneath; a note that CS0-CS2 are WCH's names for
  them in SPI mode, the handy ones beside SCK, MOSI, MISO, and that a chip
  select is any free line. (The CH347T's CS0/CS1 stay: there they are the
  chip's own chip-select outputs.)

## 1.4.23

- Every pin and hole on the board sheets round (the user: squares are the
  jumpers'): the soldered header pins gold circles, the bare holes grey
  ones (the CH347T's and CH341A's square pin-1 pads too); only the
  jumpers' pins square.

## 1.4.22

- The CH341A's USB-A in the CH341T's proportions (the user: far too long):
  13 wide, 15 out, 4 over the board, at 0.4 of the board's width.

## 1.4.21

- The CH341A and CH341T sheets share their header pins and jumpers (the
  user): a soldered male pin drawn one way (a gold pad and its pin), so the
  CH341A's 2x8 header shows as the pins it is, like the CH341T's 6 (its
  side rows stay bare holes, as on the board); a jumper drawn one way,
  three pins and a cap over two, each in its real colour (yellow and green
  on the CH341T, black on the CH341A).

## 1.4.20

- The CH341A and CH341T sheets draw the same USB-A plug (the user): its
  shell over the board's end, its four contacts above, two windows; the
  CH341T's to scale, the CH341A's in its photo's proportions to the board.
  The CH341A's "3V3 (both)" under its jumper pair, clear of the shell.

## 1.4.19

- The board sheets without the chip pin numbers (p15 ...) on their tags
  (the user), and their legend line with them; the CH341A's 2x8 header as
  a table above the board (the user: no two rows of tags), a column a
  header column, the outer row on top of the inner, leader lines to the
  pads; the CH341T's header the same way (its I2C-mode and TTL-mode roles,
  a GY-521's wire). Subtitles and captions to match.

## 1.4.18

- The CH341A sheet's AMS1117-3.3 as on the photo (the user): SOT-223, its
  three pins toward the 3V3 jumpers and its wide tab toward the chip, so on
  the turned board pins right, tab left, the body standing. (The photo also
  shows the 3V3 caps as shipped on the two pins by the USB, the "3V3" print
  by the far ones: the sheet's 3V3 setting stands.)

## 1.4.17

- The board sheets say what "p15" means (the user didn't know): a legend
  line on each, "p15: the CH341A chip's pin 15 (numbered as in its
  datasheet): the pin that hole is wired to" (the CH347T's, the CH341T's
  on theirs).

## 1.4.16

- The cheatsheets without the bench's name or a list of what ran on them
  (the user): the CH341A's "as run on r8845" devices out; the ticks'
  legend just "tested" (CH341A, CH347T); the CH347T's and the pinout's
  display wiring as "Wiring an SPI display"; the CH341A's notes name its
  rows as drawn (left-hand, right-hand), not by the unturned board's edges.

## 1.4.15

- The CH341T sheet redrawn from the vendor's photo (the user), to scale:
  the board 18 x 35 mm, the header at the 2.54 mm pitch, the chip's SSOP-20
  body, the HC-49S crystal (about 10.7 x 4.7 mm) lying across below the
  chip, the jumpers upright either side (yellow left, green right) at the
  pins' pitch, the USB-A shell overlapping the board's end with its four
  contacts. Corrected: the LEDs, TNOW at the lower left and RDY at the
  lower right (swapped before); the crystal's place and angle.

## 1.4.14

- The CH341A sheet's parts placed as on the vendor's photo, turned with
  the board (the user): the 12 MHz crystal upright between the chip and the
  right-hand row, the chip a little left of centre, the AMS1117-3.3
  regulator (U3) drawn below it, the 3V3 jumper pair bottom right and the
  I2C/SPI jumper far left by the USB.

## 1.4.13

- The three dongle sheets in one layout (the user: all USB toward the
  bottom): each board turned so its USB plug points down, the pin rows on
  its sides with horizontal callouts (the CH347T's both rows, the CH341A's
  two edge rows), a header on the top edge with vertical ones above it
  (the CH341A's 2x8, outer row nearest, the CH341T's 6 pins); the jumpers
  and the mode switch turned with their boards. Drawn by one generator, so
  the three share their pills, legend and notes.

## 1.4.12

- The cheatsheets' credit names the user in full (the user): "atiic ·
  github.com/aguegu/atiic · MIT · © 2026 Weihong Guan (aGuegu), drawn with
  Claude", on all four (`ch347t-pinout`, `ch347t-board`, `ch341t-board`,
  `ch341a-board`).

## 1.4.11

- `docs/ch341a-board.svg`: the CH341A dongle V357 (the user's photos,
  front and back), the third dongle atiic has run on: the 2x8 header and
  both 10-hole edge rows, each hole's chip pin (CH341DS1's CH341A SOP-28
  column), its role in I2C/SPI mode, atiic's name (D0-D7), what ran on it;
  the edge rows named from the back (flipped top to bottom): D0-D7, WR,
  VCC along the bottom (D4 the fifth hole, on no header pin), the parallel
  port's along the top; the header's TXD/RXD are ERR/PEMP inputs in this
  mode. Credited as the others. In `docs/setup.md` (with the edge rows
  written out) and `docs/ch341.md`.

## 1.4.10

- The three cheatsheets credited (the user): `ch347t-pinout.svg`,
  `ch347t-board.svg` and `ch341t-board.svg` each end with "atiic ·
  github.com/aguegu/atiic · MIT · © 2026 aGuegu (Weihong), drawn with
  Claude", under their sources line.

## 1.4.9

- `docs/ch341t-board.svg`: the CH341T "2-in-1" dongle (the user: the same
  for the CH341 dongles): its 6-pin header, the chip pin behind each
  (CH341DS1's CH341C/T column: SDA 15, SCL 16, TXD 3, RXD 4, VCC 20/13,
  GND 11/12), each in I2C mode (1a86:5512) and TTL mode, the two jumpers
  (the chip reads SDA at reset for its mode, §5.3), wiring to a GY-521;
  the board as `setup.svg` draws it. In `docs/ch341.md` and `setup.md`,
  with the note that the CH341T has I2C only (no D0-D7: SPI and pins()
  take the CH341A).

## 1.4.8

- The board sheet with the board's back (the user's photo): it's the
  LXC-CH347, and its back labels IO0-IO7 on eight headers, each the one
  whose chip pin is that GPIO in the datasheet's mode 0 table (IO0 JTAG
  TCK, pin 6; IO1 TDO, 7; IO2 TMS, 5; IO3 I2C SCL, 11; IO4 UART0 DCD, 15;
  IO5 UART0 DTR, 9; IO6 UART1 CTS, 2; IO7 UART1 RTS, 13): the header-to-pin
  mapping borne out. Shown beside the chip pins, with the note that in
  mode 1 only IO4, IO6, IO7 are GPIOs.

## 1.4.7

- `docs/ch347t-board.svg`: r8845's CH347T development board in mode 1 (the
  user: "this ch347t dongle SVGed"): both 16-pin rows as the silkscreen
  names them, the chip pin behind each, its mode-1 function and `pins()`
  name; the UART0 and JTAG headers dashed (in mode 1 the same chip pins as
  the SPI and I2C headers); the mode switch's table; the SPI display's
  wiring as run; a tick on each header that ran on r8845. Headers read
  off the vendor's photo, chip pins from the silkscreen names and the
  datasheet, not traced. In `docs/ch347.md`.

## 1.4.6

- **The CH347's SPI at wire speed:** 4,093 bytes a write-read command (WCH's
  driver's limit), the next sent before the last reply is read. 25,600
  bytes at 7.5 MHz in 28.4 ms (27.3 on the wire; 39.1 before), at 15 MHz
  14.5, at 30 MHz 7.7.
- `openCh347(hz, { spiHz, spiMode })` in Node (the options reached only
  the browser's `open()`); `BENCH_SPI_HZ` on the bench.
- **The GC9A01 on the CH347** (the user rewired it: res=GPIO4, dc=GPIO6,
  cs=CS0): its board test passed at 7.5, 15, 30 and 60 MHz; at 60 MHz a
  240x240 screen in 24-26 ms, about 38 a second (~1 s on the CH341), its
  card right by eye (the user). The ST7735S's test passed at 15 MHz.
- `docs/ch347.md` "Speed": the clocks, the measurements, each panel's rated
  clock (from its datasheet). The CH347's I2C scan corrected to ~27 ms
  (280 was the first run's) in `ch347.md` and `i2c_adapters.md`.

## 1.4.5

- The ST7735's RES moved from CS1 to GPIO4 (pin 15, ACT), freeing CS1 for
  a second SPI device (the user): the board test passed so, and the reset
  seen working (GPIO4 held low 6 s, the panel dark, then red after
  `init()`; the CH347's GPIO status 80 then c0). `docs/ch347.md` and the
  pinout sheet's ST7735 wiring: `res=GPIO4,dc=GPIO6,cs=CS0`.

## 1.4.4

- **The CH347's SPI and pins** (the user wired an ST7735 to it): `spi()`
  (0xC2 write-read, 507 bytes a command; the 0xC0 config once: SPI modes
  0-3, 60 MHz / 2^0..7, 7.5 MHz by default) and `pins()` (CS0/CS1 by 0xC1;
  GPIOs by 0xCC). The commands from flashrom's `ch347_spi.c` and WCH's
  Linux `ch34x_mphsi_master`, checked on r8845: the config's status 0,
  GPIO6's status following it. The ST7735S's whole board test passed on
  the CH347T (DC on GPIO6, RES on CS1, CS on CS0), its card right by eye
  (the user).
- **Three GPIOs on the CH347T in mode 1**, not eight: WCH's driver offers
  GPIO4 (pin 15), GPIO6 (pin 2) and GPIO7 (pin 13); 1.4.3's sheet showed
  all eight. `docs/ch347t-pinout.svg` redrawn: what `pins()` drives, and
  the ST7735's wiring.
- The panels' board tests open the bench's adapter (`openBus`); host tests
  for the config, chip select, GPIO and write-read packets, and spi()/pins()
  on a fake.
- Not yet: the speed (a 16-bit 80x160 screen in 162 ms, each 507 bytes
  waiting for its reply).

## 1.4.3

- `docs/ch347t-pinout.svg` redrawn for mode 1 alone (the user: mode 1 for
  now, every GPIO numbered): each pin's mode-1 function, its GPIO number
  where it has one (GPIO0 pin 6 SCK, 1 pin 7 MISO, 2 pin 5 SCS0, 3 pin 11
  SCL, 4 pin 15 ACT, 5 pin 9 SCS1, 6 pin 2 CTS1, 7 pin 13 RTS1), a strip
  of GPIO0-7 in order, which stay free while I2C and SPI run, and the
  sources: the numbers from the datasheet's mode 0 table and WCH's EVT
  schematic and guide, not yet tried on the board.

## 1.4.2

- `docs/ch347t-pinout.svg`: a cheatsheet of the CH347T's 20 pins (TSSOP20),
  each pin's function in modes 1/2 (atiic's), 0 and 3, the mode straps
  (pins 10 and 13) and their PIDs, the 5 V-tolerant inputs, and the
  power-up pull-down options; every label from CH347DS1 V1.6 (§4.3, §5.2).
  In `docs/ch347.md`.

## 1.4.1

- `docs/i2c_adapters.md`: the CH341 and the CH347 side by side on I2C
  (USB IDs and speed, interface, packet and reply sizes, the acks each
  replies, OUT 0, speeds, what errors each catches, opening in Node, Linux
  access, where the packets come from, what's board-tested), linked from
  the README and both adapter docs.

## 1.4.0

- **The CH347 as an I2C bus** (`atiic/adapters/ch347`, `.../ch347/node`):
  a CH347T in mode 1 (`1a86:55db`) or a CH347F (`55de`), over WebUSB in a
  browser or Node, its vendor interface found by class. WCH's EVT
  (`CH347EVT.ZIP`) has only the Windows DLL and its demo, so the packets
  were measured on r8845's CH347T with an MPU-6050: the CH341's I2C stream
  commands, but every written byte replies its ack (0x01 acked), OUT 0
  breaks a transaction (never sent), and a packet and its reply go up to
  512 bytes (the CH341's 32). A refused data byte now throws too, naming
  it. `docs/ch347.md`.
- Host tests: the packets, and a fake CH347 running the stream against
  pretend devices (scan, a refused byte, a 1,000-byte read).
- The bench: `BENCH_ADAPTER=ch347` runs every chip's I2C test on the
  CH347 (`openBus` in `test/board/bench.js`); `test/board/ch347.test.js`
  as `ch341.test.js`, with a 1,200-byte read across packets. On r8845
  `ch347.test.js` and `mpu6050.test.js` pass, the rest skipping (only the
  MPU-6050 on its bus).

## 1.3.23

- README: an I2C address table: each driver's addresses, what picks them
  (pins per the datasheets; the BMX055's Table 64; the MLX90614's EEPROM;
  the VL53L1X's power-up 0x29), the ones board-tested on r8845, and the
  addresses to keep apart on one bus (0x68/0x69, 0x40, 0x53).

## 1.3.22

- The bench's probe doesn't ask an address again once a chip there is
  found: the ITG-3200's wake (a write of 0x00 to 0x3E) would otherwise
  reach an MPU or BMX055 gyro at 0x68/0x69 (the BMX055 gyro's 0x3E is its
  FIFO_CONFIG_1; a write clears its FIFO).

## 1.3.21

- The AT24C08's board test checks all four block addresses answer before
  it writes anything: named on the bench but gone, it fails untouched.
- The ADXL345 re-tested alone at 0x53 (the AT24C08 off the bench): 10 of
  10 with the HMC5883L, three runs; 1.11 g at rest, self test +287 -298
  +597 LSb, as 1.3.18's (taken while the EEPROM shared its address).

## 1.3.20

- `At24c`: Atmel's AT24C01A/02/04/08A/16A EEPROMs, from their datasheet
  (0180Z1-SEEPR-5/07); the AT24C08 board-tested. A read is one random read,
  sequential across the 256-byte blocks (each block its own device address,
  0x50-0x53 for the AT24C08); writes are split at the 16-byte (8 for 1K, 2K)
  page edges, each followed by acknowledge polling (tWR 5 ms max). No ID
  register: `BENCH_AT24C08` names it on a bench; the board test writes 24
  bytes across a page and a block edge, reads them back and puts back what
  was there (r8845: the whole 1 KB the same before and after; two page
  writes 6.3 ms). Host tests (141 in all).
- Found on r8845: this AT24C08 had shared 0x53 with the ADXL345 (block 3's
  address): reads came out right (the EEPROM's 0xFF under the ADXL's
  bytes), but 1.3.18's ADXL345 tests wrote into its block 3 (0x2C, 0x2D,
  0x31). Taken apart on the bench since.

## 1.3.19

- `Itg3200`: InvenSense's 3-axis gyroscope at 0x68 or 0x69, from its
  product specification (rev 1.4 for the register map, 1.7 for the
  figures): a reset, the X gyro's PLL as the clock (as recommended),
  +/-2000 deg/s (14.375 LSb per deg/s), 98 Hz at 1 kHz, deg/s and its
  temperature (280 LSb/C, -13200 at 35 C). Known by WHO_AM_I's address bits
  and not an MPU's ID at 0x75 (an MPU-6050 shares 0x68).
- Found on r8845's part: asleep, every register but PWR_MGM reads 0,
  WHO_AM_I too, its settings kept. `init()` resets first (which wakes it);
  the bench wakes it before asking (`idWake`). A board test sleeps and
  inits again.
- On r8845: 3.7, -4.0, 2.2 deg/s at rest (the zero-rate tolerance is +/-40),
  27.8 C. Host tests (136 in all), a board test.

## 1.3.18

- `Adxl345`: Analog Devices' 3-axis accelerometer at 0x53 or 0x1D, from its
  datasheet (Rev. G): full resolution at +/-16 g (256 LSb/g), 100 Hz,
  measurement mode, g; its "Using Self-Test" (10 samples averaged each way,
  4 to settle), Table 15's limits scaled by Table 14 for the supply (3.3 V
  by default). `init()` waits 4 samples: on r8845 the first sample after
  the turn-on read 5 % short (Y 265 against a settled 280 LSb), the next
  one had settled. On r8845: |a| 1.09 g at rest (280 LSb/g on Y, inside
  230-282); self test +289 -302 +598 LSb, in range. Host tests (128 in
  all), a board test.

## 1.3.17

- `Hmc5883l`: Honeywell's 3-axis magnetometer at 0x1E, from its datasheet
  (Form #900405 Rev E): its continuous-mode example (8 samples averaged, 15
  Hz) at the default gain (1090 LSb/gauss, +/-1.3 Ga), the X Z Y data,
  microtesla, -4096 as an overflow (null); its self test with both biases
  (gain 5, 243-575 LSb). Known by its ID "H43". On r8845: |B| 63.3
  uT at rest; self test +451 +424 +436 / -444 -430 -423. Host
  tests (120 in all), a board test.

## 1.3.16

- README: what atiic is (I2C and SPI drivers, the CH341, Node.js and
  WebUSB), an example, and the devices board-tested so far: 9 sensors, 6
  displays, the AGS10 tried and not supported. `package.json`: a
  description and keywords naming them.

## 1.3.15

- `Ina231`: TI's current and power monitor at 0x40-0x4F, from its datasheet
  (SBOS644D): reset, the continuous configuration written (so an INA231B
  runs too), the calibration by Equation 1 (the datasheet's 2 mohm / 1 mA
  example as a host test: 2560, 10 A, 119.8 W), shunt voltage and current
  signed. pre-1.0's defaults: 0.1 ohm (r8845's R100), 0.1 mA a count; its
  reads were unsigned. On r8845: 4.843 V, 13.0 mA, 62.5 mW; the chip's
  current agrees with shunt voltage over 0.1 ohm. Its FEh/FFh read the
  INA226's IDs (0x5449, 0x2260; SBOS547C), the bench's way to know it.
- Host tests (113 in all), a board test.

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
