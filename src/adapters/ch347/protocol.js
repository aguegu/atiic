// WCH CH347 as an I2C bus: the CH347T in its mode 1 (1a86:55db, a serial
// port plus a vendor interface for I2C and SPI) or the CH347F (1a86:55de,
// no modes). The I2C stream commands it takes on the vendor interface's bulk
// endpoints, as packets. No transport here: the packets go out over WebUSB
// (a browser's navigator.usb, or the usb package's WebUSB in Node).
//
// WCH documents only its Windows DLL (CH347DLL_EN.H, CH347StreamI2C); the
// commands are the CH341's I2C stream (its mCH341A_CMD_I2C_STM_*), and how
// the CH347 answers them was measured on a CH347T in mode 1 on r8845 with an
// MPU-6050 on its bus (2026-11-07):
//  - every byte written by OUT n replies its ack, 0x01 acked, 0x00 not (the
//    CH341 replies only for OUT 0, and the other way round, 0x80 nacked);
//  - OUT 0 (one byte, its ack replied, on the CH341) breaks the transaction
//    on the CH347 (01 00 00 ff where 01 01 01 68 was due): never sent;
//  - IN n reads n bytes, each acked, IN 0 one byte nacked, as the CH341;
//  - a packet takes whole commands up to 512 bytes, the bulk endpoints' size
//    at high speed, and its reply must fit in 512 too (a 603-byte reply
//    faulted the read; 512 came back in one).

export const VENDOR_ID = 0x1a86;
export const PRODUCT_IDS = [0x55db, 0x55de]; // CH347T mode 1, CH347F
export const VENDOR_CLASS = 0xff; // the I2C/SPI interface, found by its class
export const PACKET_SIZE = 512;

export const CMD_I2C_STREAM = 0xaa; // each packet starts with it
export const STM_STA = 0x74; // start (or repeated start)
export const STM_STO = 0x75; // stop
export const STM_OUT = 0x80; // | n: write the n bytes after it, an ack replied for each
export const STM_IN = 0xc0; // | n: read n bytes, each acked; n = 0: read one, nacked
export const STM_SET = 0x60; // | speed
export const STM_END = 0x00; // ends the packet's commands
export const STM_LENGTH_MAX = 0x3f; // OUT's and IN's length field, bits 0-5
export const ACKED = 0x01; // an OUT byte's reply when it was acked

// SCL, Hz, to SET's two speed bits (CH347DLL_EN.H, CH347I2C_Set)
export const SPEEDS = { 20000: 0, 100000: 1, 400000: 2, 750000: 3 };

// the packet that sets the bus speed
export function speedPacket(hz) {
  const bits = SPEEDS[hz];
  if (bits === undefined) {
    throw new Error(`CH347 runs I2C at ${Object.keys(SPEEDS).join(', ')} Hz, not ${hz}`);
  }
  return Uint8Array.of(CMD_I2C_STREAM, STM_SET | bits, STM_END);
}

// One I2C transaction as commands, each a group of bytes that must stay in
// one packet, with how many reply bytes it brings back, how many of them are
// acks, and whether the first is an address's:
//  - the address and the bytes written by OUT n, at most 63 a command, each
//    byte's ack replied (a missing device, or a byte refused, shows up there)
//  - reads by IN n, the last byte alone by IN 0 (nacked, as I2C wants)
// writes: bytes to write after the address (none for a read alone)
// reads: bytes to read after a repeated start (0 for a write alone)
export function transaction(address, writes = [], reads = 0) {
  const commands = [];
  const out = (bytes) => { // bytes[0] the address
    for (let i = 0; i < bytes.length; i += STM_LENGTH_MAX) {
      const part = bytes.slice(i, i + STM_LENGTH_MAX);
      commands.push({ bytes: [STM_OUT | part.length, ...part], reply: part.length, acks: part.length, address: i === 0 });
    }
  };
  commands.push({ bytes: [STM_STA], reply: 0, acks: 0 });
  if (writes.length || !reads) out([address << 1, ...Array.from(writes)]);
  if (reads) {
    if (writes.length) commands.push({ bytes: [STM_STA], reply: 0, acks: 0 });
    out([(address << 1) | 1]);
    for (let left = reads - 1; left > 0;) {
      const n = Math.min(left, STM_LENGTH_MAX);
      commands.push({ bytes: [STM_IN | n], reply: n, acks: 0 });
      left -= n;
    }
    commands.push({ bytes: [STM_IN], reply: 1, acks: 0 });
  }
  commands.push({ bytes: [STM_STO], reply: 0, acks: 0 });
  return commands;
}

// The commands into packets: each starts with the stream byte and ends with
// END, holds whole commands only, and asks for no more reply than one bulk
// read brings back. Each packet: { data, reply, acks, addresses } (acks: the
// offsets in its reply that are ack bytes; addresses: those that are an
// address's)
export function packets(commands) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur) out.push({ data: Uint8Array.from([...cur.bytes, STM_END]), reply: cur.reply, acks: cur.acks, addresses: cur.addresses });
    cur = null;
  };
  for (const c of commands) {
    if (cur && (cur.bytes.length + c.bytes.length + 1 > PACKET_SIZE || cur.reply + c.reply > PACKET_SIZE)) flush();
    cur ??= { bytes: [CMD_I2C_STREAM], reply: 0, acks: [], addresses: [] };
    if (c.address) cur.addresses.push(cur.reply);
    for (let i = 0; i < c.acks; i++) cur.acks.push(cur.reply + i);
    cur.bytes.push(...c.bytes);
    cur.reply += c.reply;
  }
  flush();
  return out;
}

// a stop alone: the bus released after a transaction cut short
export const stopPacket = () => Uint8Array.of(CMD_I2C_STREAM, STM_STO, STM_END);

// SPI and GPIO, from the open drivers: flashrom's ch347_spi.c (0xC0, 0xC1,
// 0xC3, 0xC4, the 507-byte packets) and WCH's Linux ch34x_mphsi_master
// (0xC2 write-read, 0xCC GPIO, the CH347T's three GPIOs in mode 1). Each
// command: the byte, a 16-bit length (LSB first), the payload.
export const CMD_SPI_SET_CFG = 0xc0; // reply: c0 01 00 status (0 ok)
export const CMD_SPI_CS = 0xc1; // no reply
export const CMD_SPI_OUT_IN = 0xc2; // reply: c2 n n, the n bytes read
export const CMD_GPIO = 0xcc; // reply: cc 08 00, a status byte a GPIO
export const SPI_CHUNK = 507; // a write-read's bytes, so its reply fits one 512-byte packet (flashrom: 510 - 3)

// SCK: 60 MHz divided by 2^0..2^7 (the config's byte 15, bits 5:3)
export const SPI_CLOCKS = [60e6, 30e6, 15e6, 7.5e6, 3.75e6, 1.875e6, 937500, 468750];

// the config packet (flashrom's ch347_spi_config, the CH32V's SPI_CTLR1 as
// u16 fields): master (0x0104), 8-bit, mode 0-3 (CPOL byte 9 bit 1, CPHA
// byte 11 bit 0), chip selects by software (0x0200: CS by CMD_SPI_CS), the
// divisor, MSB first, CRC polynomial 7 as the vendor sets it, CS active low
export function spiConfigPacket(hz = 7.5e6, mode = 0) {
  const divisor = SPI_CLOCKS.indexOf(hz);
  if (divisor < 0) throw new Error(`CH347 runs SPI at ${SPI_CLOCKS.join(', ')} Hz, not ${hz}`);
  const p = new Uint8Array(29);
  p[0] = CMD_SPI_SET_CFG;
  p[1] = 26;
  p[5] = 0x04; p[6] = 0x01; // SPI_Mode: master
  p[9] = mode & 2; // CPOL
  p[11] = mode & 1; // CPHA
  p[14] = 0x02; // SPI_NSS: software
  p[15] = divisor << 3;
  p[19] = 0x07; // SPI_CRCPolynomial
  return p;
}

// the chip selects: CS0 in byte 3, CS1 in byte 8; bit 7 changes it, bit 6
// set deasserts (high, active low). levels: { CS0: true|false, CS1: ... },
// true high (deasserted), false low; one not named is left as it is
export const CS_PINS = ['CS0', 'CS1'];
export function csPacket(levels) {
  const p = new Uint8Array(13);
  p[0] = CMD_SPI_CS;
  p[1] = 10;
  for (const [name, at] of [['CS0', 3], ['CS1', 8]]) {
    if (levels[name] === undefined) continue;
    p[at] = 0x80 | (levels[name] ? 0x40 : 0);
  }
  return p;
}

// SPI out and in: a write-read command a chunk; all but the last full
export function spiPackets(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += SPI_CHUNK) {
    const part = bytes.slice(i, i + SPI_CHUNK);
    const p = new Uint8Array(3 + part.length);
    p[0] = CMD_SPI_OUT_IN;
    p[1] = part.length & 0xff;
    p[2] = part.length >> 8;
    p.set(part, 3);
    out.push(p);
  }
  return out;
}

// GPIO: the CH347T in mode 1 has three, GPIO4 (pin 15, ACT), GPIO6 (pin 2,
// CTS1) and GPIO7 (pin 13, RTS1) (WCH's ch347t_board_config); the CH347F
// eight. A byte a GPIO: bit 7 and 6 set it, bit 5 an output, bit 4 with an
// output's level in bit 3; 0 leaves it. The reply's bytes: bit 7 an output,
// bit 6 the level.
export const GPIO_PINS = ['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7'];
export function gpioPacket(lines) {
  const p = new Uint8Array(11);
  p[0] = CMD_GPIO;
  p[1] = 8;
  for (const [name, v] of Object.entries(lines)) {
    const i = GPIO_PINS.indexOf(name);
    if (i < 0) continue;
    p[3 + i] = 0xc0 | (v === null ? 0 : 0x30 | (v ? 0x08 : 0));
  }
  return p;
}
