// WCH CH341 (CH341A/B/F/T) in its I2C mode, 1a86:5512: the I2C stream
// commands it takes on its bulk endpoint, as packets. No transport here: the
// packets go out over WebUSB (a browser's navigator.usb, or the usb
// package's WebUSB in Node).
//
// CH341DS2 documents only WCH's Windows DLL (CH341StreamI2C, CH341SetStream);
// the commands below are the ones the open drivers send (flashrom's ch341a,
// the Linux out-of-tree i2c-ch341), checked against a CH341T on r8845.

export const VENDOR_ID = 0x1a86;
export const PRODUCT_ID = 0x5512;
export const INTERFACE = 0;
export const ENDPOINT = 2; // bulk, out 0x02 and in 0x82
export const PACKET_SIZE = 32; // the bulk endpoints' max packet size

export const CMD_I2C_STREAM = 0xaa; // each packet starts with it
export const STM_STA = 0x74; // start (or repeated start)
export const STM_STO = 0x75; // stop
export const STM_OUT = 0x80; // | n: write the n bytes after it; n = 0: write one, reply its ack
export const STM_IN = 0xc0; // | n: read n bytes, each acked; n = 0: read one, nacked
export const STM_SET = 0x60; // | speed
export const STM_END = 0x00; // ends the packet's commands
export const STM_LENGTH_MAX = 0x3f; // OUT's and IN's length field, bits 0-5 (a packet's room binds first)
export const ACK_NACKED = 0x80; // in OUT 0's reply: set when the byte wasn't acked

// SCL, Hz, to SET's two speed bits (CH341DS2, CH341SetStream)
export const SPEEDS = { 20000: 0, 100000: 1, 400000: 2, 750000: 3 };

// the packet that sets the bus speed
export function speedPacket(hz) {
  const bits = SPEEDS[hz];
  if (bits === undefined) {
    throw new Error(`CH341 runs I2C at ${Object.keys(SPEEDS).join(', ')} Hz, not ${hz}`);
  }
  return Uint8Array.of(CMD_I2C_STREAM, STM_SET | bits, STM_END);
}

// One I2C transaction as commands, each a group of bytes that must stay in
// one packet, with how many reply bytes it brings back:
//  - each address byte by OUT 0, so its ack comes back (a missing device
//    shows up there; data bytes are written without a reply)
//  - writes by OUT n, at most what fits in a packet
//  - reads by IN n, the last byte alone by IN 0 (nacked, as I2C wants)
// writes: bytes to write after the address (none for a read alone)
// reads: bytes to read after a repeated start (0 for a write alone)
export function transaction(address, writes = [], reads = 0) {
  const commands = [];
  const room = PACKET_SIZE - 3; // the stream byte, the OUT/IN command, END
  commands.push({ bytes: [STM_STA], reply: 0 });
  if (writes.length || !reads) {
    commands.push({ bytes: [STM_OUT, address << 1], reply: 1, ack: true });
    for (let i = 0; i < writes.length; i += Math.min(room, STM_LENGTH_MAX)) {
      const part = Array.from(writes.slice(i, i + Math.min(room, STM_LENGTH_MAX)));
      commands.push({ bytes: [STM_OUT | part.length, ...part], reply: 0 });
    }
  }
  if (reads) {
    if (writes.length) commands.push({ bytes: [STM_STA], reply: 0 });
    commands.push({ bytes: [STM_OUT, (address << 1) | 1], reply: 1, ack: true });
    for (let left = reads - 1; left > 0;) {
      const n = Math.min(left, STM_LENGTH_MAX, PACKET_SIZE - 1);
      commands.push({ bytes: [STM_IN | n], reply: n });
      left -= n;
    }
    commands.push({ bytes: [STM_IN], reply: 1 });
  }
  commands.push({ bytes: [STM_STO], reply: 0 });
  return commands;
}

// The commands into packets: each starts with the stream byte and ends with
// END, holds whole commands only, and asks for no more reply than one bulk
// read brings back. Each packet: { data, reply, acks } (acks: the offsets in
// its reply that are ack bytes)
export function packets(commands) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur) out.push({ data: Uint8Array.from([...cur.bytes, STM_END]), reply: cur.reply, acks: cur.acks });
    cur = null;
  };
  for (const c of commands) {
    if (cur && (cur.bytes.length + c.bytes.length + 1 > PACKET_SIZE || cur.reply + c.reply > PACKET_SIZE)) flush();
    cur ??= { bytes: [CMD_I2C_STREAM], reply: 0, acks: [] };
    if (c.ack) cur.acks.push(cur.reply);
    cur.bytes.push(...c.bytes);
    cur.reply += c.reply;
  }
  flush();
  return out;
}

// a stop alone: the bus released after a transaction cut short
export const stopPacket = () => Uint8Array.of(CMD_I2C_STREAM, STM_STO, STM_END);

// D0-D5, the CH341's parallel data lines 0-5 (chip pins 15-20; D0-D2 are
// also SPI's CS0-CS2), driven or released by its UIO stream: the levels and
// the directions (1 an output) of all six at once. D6 and D7 are inputs
// only (SPI's DIN2 and DIN). As flashrom's ch341a_spi.c drives its pins.
export const CMD_UIO_STREAM = 0xab;
export const UIO_STM_OUT = 0x80; // | the six lines' levels
export const UIO_STM_DIR = 0x40; // | the six lines' directions
export const UIO_STM_END = 0x20;
export const UIO_PINS = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5'];
export const UIO_MASK = 0x3f;

export function uioPacket(levels, outputs) {
  return Uint8Array.of(CMD_UIO_STREAM, UIO_STM_OUT | (levels & UIO_MASK), UIO_STM_DIR | (outputs & UIO_MASK), UIO_STM_END);
}
