# dart as the I2C bus

dart is a USB-to-I2C bridge, reached over WebUSB as atiic reaches the CH341
and CH347. It enumerates as `ffff:da92`, "Sourcekit" "Dart" (a browser's chooser
shows "Dart"), one
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
- On Windows the device binds WinUSB by itself (Microsoft OS 2.0
  descriptors), no driver to install.

Not faster: its I2C is 100 and 400 kHz only, its USB full speed.

```js
import { openDart } from 'atiic/adapters/dart/node';

const bus = await openDart(400000); // 100 kHz by default
console.log(await bus.scan()); // e.g. [ 104 ]: 0x68
const [whoAmI] = await bus.writeRead(0x68, [0x75], 1);
await bus.speed(100000, 90); // a sensor holding SCL up to 90 ms
console.log(await bus.info()); // { protocol, version, speed, stretchMs, payloadMax, readMax, uniqueId }
await bus.close();
```

In a browser (Chromium; WebUSB):

```js
import Dart, { FILTERS } from 'atiic/adapters/dart';

const device = await navigator.usb.requestDevice({ filters: FILTERS });
const bus = await new Dart(device).open(400000);
```

`0xffff` is nobody's vendor ID, so `open()` tells a dart by its answer to
INFO (the op and tag echoed, a command set it speaks), not by its name: a
device that doesn't answer within a second, or answers something else, is
refused, and closed. The command set is dart's, the same whatever chip a dart is
built on; `open()` reads its version from INFO and refuses a major it
doesn't speak (this adapter: 1.x; a minor only adds).

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
| 0x01 INFO | none | the command set's version (uint16: major high byte, minor low; 1.0), the firmware's version, speed (Hz), stretch limit (ms), largest payload and read, the chip's unique ID |
| 0x02 SPEED | Hz (uint32: 100000 or 400000), stretch limit (uint16 ms, optional) | none |
| 0x10 I2C | address, read length (uint16), the bytes to write | the bytes read |
| 0x11 SCAN | first, last address | the addresses that acknowledge |

| Status | | |
|---|---|---|
| `OK` | 0 | |
| `NO_DEVICE` | -1 | nobody acknowledged the address |
| `TIMEOUT` | -2 | a flag not reached, or SCL held past the stretch limit |
| `BUS_ERROR` | -3 | a bus error, or arbitration lost |
| `BUS_BUSY` | -4 | the bus busy before the start |
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
fake dart, no hardware. On a bench, `BENCH_ADAPTER=dart` runs the board
tests (`test/board/bench.js`) on it. The firmware's own bench test (dart and
an I2C slave that stretches SCL, at 100 and 400 kHz: writes, register reads
over several USB packets, a refused write) passed 19/19, and this adapter
on dart (scan, a write read back at 400 kHz, a refused write, a missing
device, a speed and stretch limit set) did too (2026-11-10).
