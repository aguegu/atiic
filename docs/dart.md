# dart as the I2C bus

dart is a USB-to-I2C bridge, reached over WebUSB as atiic reaches the CH341
and CH347. It enumerates as `ffff:da92`, "MeshMass" "Dart" (a browser's chooser
shows "Dart"; firmware 0.02 and before said "Sourcekit"), one
vendor interface with a bulk pair. Its firmware isn't published yet.

What it does that WCH's adapters don't:

- **It waits for a held SCL** (clock stretching). The CH341 and the CH347 (by
  default) never read SCL back, so a device that holds it, an MCU as a slave
  or a sensor holding it while it measures, reads wrong through them at
  400 kHz (docs/ch341.md, What it can't do). dart's I2C controller waits, up
  to a stretch limit `speed()` sets (2 ms by default).
- **Every byte's acknowledge checked**: a missing device throws `no ack from
  0x..`, as with the CH341; a device that answers its address but refuses a
  data byte throws `0x.. refused byte k`, k the bytes it took before it. The
  CH341 sees only the address's acknowledge.
- **A transaction is one request**: write, a repeated start and read, then a
  stop, in one USB round trip, its result in one reply; a scan of the whole
  bus is one request too.
- **Slower, too** (command set 1.1): any SCL from 7327 Hz to 400 kHz, for
  a device that wants it slow (Aosong's AGS10: 15 kHz or under; the CH341
  goes no lower than 20 kHz, the CH347 no lower than its 20 kHz mode).
- **A bus held low is told apart.** `BUS_BUSY` from a 1.1 dart names the
  line, `bus held low: SCL (at 0x1a)`, read with its controller off, so
  only what's outside pulls on it (`e.held`: `['SCL']`); a scan reports it
  instead of an empty bus; and every `speed()` runs the I2C spec's bus
  clear (nine clocks, then a STOP) for a device stuck mid-byte.
- On Windows the device binds WinUSB by itself (Microsoft OS 2.0
  descriptors), no driver to install.

Not faster: its I2C tops at 400 kHz, its USB is full speed.

**Or without a cable**: dart-ble, the same command set over Bluetooth LE
(firmware 0.03 on), for a page's Web Bluetooth. The same `Dart`, given a
`BluetoothDevice` instead of a `USBDevice`; see [Over Bluetooth](#over-bluetooth).

```js
import { openDart } from 'atiic/adapters/dart/node';

const bus = await openDart(400000); // 100 kHz by default
console.log(await bus.scan()); // e.g. [ 104 ]: 0x68
const [whoAmI] = await bus.writeRead(0x68, [0x75], 1);
await bus.speed(100000, 90); // a sensor holding SCL up to 90 ms
await bus.speed(10000); // a device that wants 15 kHz or under (1.1)
console.log(await bus.info()); // { protocol, version, speed, stretchMs, payloadMax, readMax, uniqueId }
await bus.close();
```

In a browser (Chromium; WebUSB):

```js
import Dart, { FILTERS } from 'atiic/adapters/dart';

const device = await navigator.usb.requestDevice({ filters: FILTERS });
const bus = await new Dart(device).open(400000);
```

## Over Bluetooth

dart-ble advertises as `Dart-XXXX` (the last two bytes of its unique ID)
with its service's UUID, connectable, one browser at a time, no pairing. In
a browser with Web Bluetooth (Chrome or Edge; on Linux behind
`chrome://flags/#enable-experimental-web-platform-features`; not Firefox or
Safari):

```js
import Dart, { BLE_FILTERS } from 'atiic/adapters/dart';

const device = await navigator.bluetooth.requestDevice({ filters: BLE_FILTERS });
const bus = await new Dart(device).open(400000); // connects, then as over USB
const [whoAmI] = await bus.writeRead(0x68, [0x75], 1);
await bus.close(); // disconnects
```

The service: `76600001-dace-4d07-9686-48b0186b7cd7`; a request's frame is
written to `...0002` (Write Without Response, 20 bytes at a time: ATT's
least MTU, since Web Bluetooth doesn't tell a page the link's), its reply
notified on `...0003`, put together by the header's count. Everything else,
INFO's check at `open()`, tags, statuses and errors, is the USB adapter's.
A link lost mid-request rejects it (`dart disconnected`).

Each request waits a Bluetooth round trip, about two connection intervals:
dart-ble asks for 7.5-15 ms, and the centrals tried take 15. Measured in
Chromium on Linux (2026-11-12, firmware 0.03): `open()`
839 ms with the connection, a 14-byte register read 31.9 ms (median of 20), a
200-byte write 56 ms (ten writes, sent back to back), a 200-byte read 32 ms.
The I2C itself takes under a millisecond of that, so fewer, larger
transactions go faster: a sensor's FIFO read in blocks (`Mpu6050`'s
`startFifo()`/`readFifo()`) kept 250 samples a second without a loss.

`0xffff` is nobody's vendor ID, so `open()` tells a dart by its answer to
INFO (the op and tag echoed, a command set it speaks), not by its name: a
device that doesn't answer within a second, or answers something else, is
refused, and closed. The command set is dart's, the same whatever chip a dart is
built on; `open()` reads its version from INFO and refuses a major it
doesn't speak (this adapter: 1.x; a minor only adds). 1.1 added the speeds
between 100 and 400 kHz and under 100 kHz, the lines in `BUS_BUSY`, and a
scan's bus errors; a 1.0 dart takes 100 and 400 kHz only.

## The command set

Requests on bulk OUT (EP1), replies on bulk IN; one request on the wire at a
time; numbers little-endian.

- A request: op, tag (the host's, echoed), payload length (uint16), the
  payload.
- A reply: op, tag, status (int8), 0, count (uint16), then the data on
  success; it ends with a short packet (a zero-length one when it fills its
  last 64 bytes exactly). A reply with another tag (to a request cut short)
  is skipped.

| Op | Payload | Reply data |
|---|---|---|
| 0x01 INFO | none | the command set's version (uint16: major high byte, minor low; 1.1 = 0x0101), the firmware's version, speed (Hz), stretch limit (ms), largest payload and read, the chip's unique ID |
| 0x02 SPEED | Hz (uint32: 7327 to 400000; 1.0: 100000 or 400000), stretch limit (uint16 ms, past a byte's own time; optional) | none |
| 0x10 I2C | address, read length (uint16), the bytes to write | the bytes read |
| 0x11 SCAN | first, last address | the addresses that acknowledge; a bus error ends it with that status (1.1) |

| Status | | |
|---|---|---|
| `OK` | 0 | |
| `NO_DEVICE` | -1 | nobody acknowledged the address |
| `TIMEOUT` | -2 | a flag not reached, or SCL held past the stretch limit |
| `BUS_ERROR` | -3 | a bus error, or arbitration lost |
| `BUS_BUSY` | -4 | the bus busy before the start; count (1.1): the lines, bit 0 SCL, bit 1 SDA, set when high |
| `REFUSED` | -5 | a data byte refused; count: the bytes taken before it |
| `UNKNOWN_OP` | -16 | |
| `BAD_LENGTH` | -17 | over 1024 bytes, or not as the header says |
| `BAD_SPEED` | -18 | |

## Setup on Linux

No kernel driver binds a vendor interface, so nothing to detach; the user
needs the device node. Its own rule, for the user at the computer (a file
named to sort before `73-seat-late.rules`, which turns `uaccess` into the
user's access; as i2c.ninja's Get started gives it):

```
# /etc/udev/rules.d/70-dart.rules
SUBSYSTEM=="usb", ATTRS{idVendor}=="ffff", ATTRS{idProduct}=="da92", TAG+="uaccess"
```

For a headless bench, a group instead (`GROUP="plugdev", MODE="0660"`).

## Tests

`test/host/dart-protocol.test.js`: the framing, tags and statuses against a
fake dart, no hardware; `test/host/dart-ble.test.js`: the same over a fake
Web Bluetooth device (writes in pieces, replies in notifications of an MTU
of 23 or 247, the link lost, close). On a bench, `BENCH_ADAPTER=dart` runs the board
tests (`test/board/bench.js`) on it. The firmware's own bench test (dart and
an I2C slave that stretches SCL, at 100 and 400 kHz: writes, register reads
over several USB packets, a refused write) passed 19/19, and this adapter
on dart (scan, a write read back at 400 kHz, a refused write, a missing
device, a speed and stretch limit set) did too (2026-11-10). Command set
1.1, the same day: its own bench test at 10, 100 and 400 kHz, 24/24; a
VL53L1X through this adapter at 10, 100 and 400 kHz, the same distance
within 4 mm (its start-up and first reading 494, 155 and 181 ms: the 91
bytes of configuration take longer at 10 kHz). An AGS10 module held SCL
low from its power-up: `bus held low: SCL`, the bus free with its SCL
unplugged.
