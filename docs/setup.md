# Setup

The bench atiic's tests run on: a CH341T dongle in I2C mode, an MPU-6050 on
a GY-521 board, four wires, a Linux PC (r8845 here).

![CH341T in I2C mode at 3.3V, wired to a GY-521](setup.svg)

## Parts

- A CH341T "2-in-1" dongle (USB to I2C / TTL): USB-A, a 6-pin header
  (VCC GND SCL SDA TXD RXD), a yellow jumper for the mode (I2C or TTL) and a
  green one for the voltage (3V3 or 5V).
- A GY-521 (MPU-6050): 8 pins VCC GND SCL SDA XDA XCL AD0 INT, its own
  regulator and pull-ups.
- Four female-to-female jumper wires.

## The jumpers, before plugging in

The CH341T reads its mode when it powers up: set both jumpers with the
dongle unplugged.

- **Yellow on I2C.** On TTL the dongle is a serial port instead, and atiic
  can't open it.
- **Green on 3V3.** VCC then gives 3.3V, and SDA/SCL swing to 3.3V: the
  CH341's SDA and SCL pull up to its own supply, and the MPU-6050 is a 3.3V
  part.

## Wiring

| CH341T | GY-521 | wire |
|---|---|---|
| SDA | SDA | blue |
| SCL | SCL | yellow |
| GND | GND | black |
| VCC | VCC | red |

TXD and RXD stay free (UART only). On the GY-521, AD0, INT, XDA and XCL stay
free: AD0 is pulled low on the board, so the MPU-6050 answers at 0x68 (0x69
with AD0 tied to VCC).

## The PC (Linux)

1. Plug the dongle in. In I2C mode it's `1a86:5512`:

   ```
   $ lsusb | grep 1a86
   Bus 001 Device 025: ID 1a86:5512 QinHeng Electronics CH341 in EPP/MEM/I2C mode, EPP/I2C adapter
   ```

   No `5512` but a new `/dev/ttyUSB*`: the yellow jumper is on TTL.

2. Give the device to your user with a udev rule (here the group `uucp`; use
   one you're in, `id` lists them), in `/etc/udev/rules.d/99-ch341.rules`:

   ```
   SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="5512", GROUP="uucp", MODE="0660"
   ```

   then `sudo udevadm control --reload && sudo udevadm trigger`, or replug.
   The kernel's `spi-ch341` binds to the dongle on every plug; atiic
   detaches it when it opens the dongle ([ch341.md](ch341.md)).

3. Node 22 or newer, then in atiic:

   ```
   npm install
   npm test              # the host tests, no hardware
   npm run test:board    # the CH341 and the IMU on this bench
   npm run test:advanced # measurements: how much data the IMU gives (about 20 s)
   ```

   `test:board` scans the bus and expects the IMU at 0x68 and nothing
   else, reads it at rest (about 1 g, at any tilt; a gyro already settled
   right after `init()`) and runs its FIFO at 1 kHz for 300 ms.
   `test:advanced` measures what the bus takes off the IMU, polling and
   by its FIFO from 1 to 8 kHz, prints the table and holds the limits seen.
   Keep the module still while they run.

## Another IMU: the MPU-6500

The tests read WHO_AM_I at 0x68 before they start and run the tests of the
chip they find, skipping the other's with the reason (`no MPU-6050 on the
bench (0x68: WHO_AM_I 0x70)`). The other chip so far: a board sold as
GY-9250, which carries an MPU-6500 (WHO_AM_I 0x70), not the MPU-9250 (0x71)
the name says: nothing answers at 0x0C, where an MPU-9250's magnetometer
would, even with the bypass on. Wired the same: its VCC, GND, SCL and SDA to
the dongle's.

## Another bench: a CH341A and a BMX055

![A CH341A (V357) dongle in I2C/SPI mode at 3.3V, wired to a BMX055 module (CJMCU-900F), CS0 (D0) to its PS pin](setup-bmx055.svg)

Bosch's 9-axis BMX055 is three chips at three addresses: the accelerometer
at 0x18 or 0x19, the gyro at 0x68 or 0x69, the magnetometer at 0x10-0x13
(r8845's module, a CJMCU-900F: 0x19, 0x69, 0x13). The CJMCU-900F's pins,
top to bottom: 3V3, GND, SCL, SDA, PS, SDO1, SDO2, CSB1, CSB2, CSB3 (SDO1/2
and CSB1-3 set the chips' I2C addresses, or are SPI's chip selects). atiic drives all three (`Bmx055Accel`,
`Bmx055Gyro`, `Bmx055Mag`); the tests find each by its chip ID (the
magnetometer's reads only once its power bit is set).

Its **PS** pin picks the interface: high for I2C, low for SPI. Left floating
the module answered nothing on I2C. A wire to VCC does; on r8845 a CH341A
line drives it instead, which is why this bench uses the CH341A: it brings
more of the chip's lines out.

### The dongle: the V357 CH341A

The USB plug on the right, a 2x8 header on the left (two rows of 10 holes
along the edges, the parallel port, unused here):

| Outer column | Inner column |
|---|---|
| GND | MISO |
| RXD | MOSI |
| TXD | SCK |
| VCC | CS2 (the chip's D2, pin 17) |
| GND | CS1 (the chip's D1, pin 16) |
| SCL | CS0 (the chip's D0, pin 15) |
| SDA | GND |
| VCC | VCC |

Set the jumpers with it unplugged:

- **The pair top right: 3V3.** The board comes on 5V; the BMX055 is a 3.3V
  part (3.6V at most).
- **The one bottom right: I2C/SPI** (UART is the serial port, 1a86:5523).

### Wiring

| CH341A header | CJMCU-900F |
|---|---|
| VCC (outer, row 4) | 3V3 |
| GND (outer, row 5) | GND |
| SCL (outer, row 6) | SCL |
| SDA (outer, row 7) | SDA |
| CS0 (inner, row 6) | PS |

The four in the same order on both boards, so their wires run side by side.
SDO1, SDO2 and CSB1-CSB3 stay free (as this module leaves them, the chips
answer at 0x19, 0x69 and 0x13).

### PS from D0

Put `BENCH_PS=D0` in an untracked `.env.local` in atiic: `npm run
test:board` drives D0 high before anything looks for a chip, and the CH341
holds it while it stays plugged in (each replug: run the tests or drive it
again, `bus.pins({ D0: true })`). Never drive PS low while the BMX055 runs:
the gyro and the magnetometer come back when it goes high again, but the
accelerometer stays on SPI until the module is powered off and on.

## A display on SPI: an ST7735S

The same CH341A, still in I2C/SPI mode at 3.3V, drives a 0.96" 80x160 IPS
module (ST7735S, 4-wire SPI). Its pins to the header's inner column:

| module | CH341A |
|---|---|
| GND | GND |
| VCC | VCC (3.3V) |
| SCL | SCK |
| SDA | MOSI |
| RES | CS0 (D0) |
| DC | CS1 (D1) |
| CS | CS2 (D2) |
| BLK | VCC (3.3V): the backlight always on |

The module sends nothing back: MISO stays unwired. Its RES and DC aren't
chip selects; atiic drives them as plain lines. On r8845 `.env.local` has
`BENCH_ST7735=res=D0,dc=D1,cs=D2`; the board test leaves a white border on
black with red, green and blue squares. This panel: RGB565, BGR order, no
inversion, 24 columns in (`new St7735s(bus)`'s defaults).
Colours are `0xRRGGBB`; `{ bits: 12 | 16 | 18 }` picks the pixel format
(16 by default): 12 bits is the quickest (a screen in 174 ms on r8845) and
shows a ramp in 16 steps, 18 the smoothest (341 ms).
`scrollArea()`, `scroll(n)` and `scrollRow(n)` use the controller's
scrolling along the panel's long side: a strip chart draws one new row a
step (4.2 ms on r8845, about 240 steps a second) instead of a whole screen.

The same wiring drives a 1.45" 60x160 IPS module on a GC9107 (`Gc9107`,
`BENCH_GC9107=res=D0,dc=D1,cs=D2`): its panel needs the chip's inner
registers set (Espressif's values, sent by `init()`; without them a white
haze over a quarter of the screen), then shows inverted unless INVON; BGR,
34 columns in. Both drivers are `DcsPanel`s: the same calls.

D0 is RES here, so it can't be a BMX055's PS on the same bench: one of the
two moves to another line.

## A first read

```js
import { openCh341 } from 'atiic/adapters/ch341/node';
import { Mpu6050 } from 'atiic';

const bus = await openCh341(400000); // the MPU-6050 is rated to 400 kHz
console.log(await bus.scan()); // [ 104 ]: 0x68
const mpu = new Mpu6050(bus);
await mpu.init();
console.log(await mpu.measure());
await bus.close();
```
