# The I2C adapters side by side: CH341 and CH347

atiic drives I2C through two WCH chips. The device drivers don't know
which one is under them (both are a bus with `scan`, `write`, `read`,
`writeRead`); this is where the two differ. Each adapter's own doc has the
details: [ch341.md](ch341.md), [ch347.md](ch347.md).

| | CH341 (A/B/F/T) | CH347 (T in mode 1, F) |
|---|---|---|
| USB ID | `1a86:5512`, its I2C/SPI mode | `1a86:55db` (CH347T, mode 1), `1a86:55de` (CH347F) |
| USB speed | full speed (12 Mbit/s) | high speed (480 Mbit/s) |
| The I2C interface | interface 0, the device's only one | a vendor-class interface beside the serial port's (2 on the CH347T in mode 1), found by its class |
| Bulk endpoints | 2 out and in, 32 bytes | 6 out and in on the CH347T, 512 bytes |
| Commands | the I2C stream: 0xAA, then STA 0x74, STO 0x75, OUT 0x80\|n, IN 0xC0\|n, SET 0x60\|speed, END 0x00 | the same commands |
| A packet | up to 32 bytes, its reply up to 32 | up to 512 bytes, its reply up to 512 (603 faulted) |
| The longest read in one packet | under 32 bytes (the acks share the reply) | 509 bytes with a read's 3 acks |
| Acks replied | only for OUT 0's single byte: 0x80 set when not acked | for every byte written by OUT n: 0x01 acked, 0x00 not |
| OUT 0 | writes one byte and replies its ack: atiic sends each address this way | breaks the transaction: never sent |
| Reads | IN n acked, IN 0 for the last byte (nacked) | the same |
| SCL | 20, 100, 400, 750 kHz | the same four (`CH347I2C_Set`) |
| A missing device | throws `no ack from 0x..` (its address's ack) | the same |
| A data byte refused | not seen: data bytes aren't acked back | throws `no ack from 0x.. for byte n` |
| Open in Node | detaches the kernel's `spi-ch341`, then a USB reset (a run cut short left it refusing every command) | detaches whatever holds the vendor interface (nothing on r8845; `cdc_acm` has only the serial port) |
| Linux access | a udev rule for `5512` ([ch341.md](ch341.md#linux)) | a udev rule for `55db` and `55de` ([ch347.md](ch347.md#setup-on-linux)) |
| WCH's docs | the Windows DLL (`CH341DLL.H` names the stream commands) | the Windows DLL (`CH347DLL_EN.H`, the same command names); the EVT has no USB packets |
| Where the packets come from | the open drivers (flashrom, `i2c-ch341`), checked on a CH341T | measured on r8845's CH347T with an MPU-6050 |
| Board-tested on r8845 | every I2C chip in the README | the MPU-6050 (`ch347.test.js`, `mpu6050.test.js`) |
| SPI, GPIO in atiic | yes: SPI mode 0, D0-D5 driven, D0-D7 read | yes: SPI modes 0-3 at 0.47-60 MHz, CS0/CS1 and three GPIOs (CH347T mode 1) driven |

## What it means

- **Errors.** On the CH347 every written byte comes back acked or not, so a
  device that refuses a register write is caught. On the CH341 only a
  missing device is.
- **Long transfers.** A 1,200-byte read is three packets on the CH347 and
  about forty on the CH341, each packet a USB round trip. Neither adapter's
  timing has been compared on the same transactions yet: the CH347's full
  scan of 0x08-0x77 took about 27 ms on r8845; the CH341's isn't measured.
- **Drivers.** Nothing changes for them: the same tests pass on either bus,
  picked on the bench by `BENCH_ADAPTER` (`ch341`, the default, or `ch347`).
- **SPI.** Both have it. The CH347's runs to 60 MHz: a 240x240 GC9A01
  screen in ~25 ms there, ~1 s on the CH341 ([ch347.md](ch347.md#speed)).
  On the CH347 the ST7735S and GC9A01 have run so far; the e-papers and
  SPI IMUs untried.
