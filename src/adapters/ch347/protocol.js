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
