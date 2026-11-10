// dart, the user's USB-to-I2C bridge (docs/dart.md), as
// atiic's I2C bus, on a WebUSB USBDevice: a browser's
// (navigator.usb.requestDevice) or Node's (./node.js, the usb package's
// WebUSB). Its command set: one request, one reply on the vendor
// interface's bulk pair (EP1), each reply with a status that tells a
// missing device (no ack from 0x..) from a refused data byte (0x.. refused
// byte k), which the CH341 can't. The bus the device drivers use, as the
// CH341's and CH347's: scan(), write(), read(), writeRead(), acks(); and
// info(), speed(hz, stretchMs).
export const VENDOR_ID = 0xffff;
export const PRODUCT_ID = 0xda92;
export const FILTERS = [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }];
// its product string ends in "dart", any case (it's "Dart", the manufacturer
// "Sourcekit")
export const PRODUCT_NAME = /\bdart$/i;
// the command set's version this adapter speaks: a dart with another major
// is refused at open; a minor only adds, so any minor is taken
export const PROTOCOL_MAJOR = 1;

const INTERFACE = 0;
const ENDPOINT = 1;
const HEADER = 4; // a request's
const REPLY_HEADER = 6;
const PACKET = 64;
const READ_MAX = 1024;
// every read asks room for the largest reply and one packet more, so it ends
// at the reply's short (or zero-length) packet, never before it
const REPLY_ROOM = Math.ceil((REPLY_HEADER + READ_MAX) / PACKET) * PACKET + PACKET;

export const OP = { INFO: 0x01, SPEED: 0x02, I2C: 0x10, SCAN: 0x11 };
export const STATUS = {
  0: 'OK', [-1]: 'NO_DEVICE', [-2]: 'TIMEOUT', [-3]: 'BUS_ERROR', [-4]: 'BUS_BUSY', [-5]: 'REFUSED',
  [-16]: 'UNKNOWN_OP', [-17]: 'BAD_LENGTH', [-18]: 'BAD_SPEED',
};
export const SCAN_FIRST = 0x08;
export const SCAN_LAST = 0x77;

const hex = (a) => `0x${a.toString(16).padStart(2, '0')}`;

export class DartError extends Error {
  constructor(status, address, count) {
    const name = STATUS[status] ?? `status ${status}`;
    const message = name === 'NO_DEVICE' ? `no ack from ${hex(address)}`
      : name === 'REFUSED' ? `${hex(address)} refused byte ${count}`
        : `${name}${address === undefined ? '' : ` at ${hex(address)}`}`;
    super(message);
    Object.assign(this, { status: name, code: status, address, count });
  }
}

export class Dart {
  constructor(device) {
    this.device = device;
    this.queue = Promise.resolve(); // one request on the wire at a time
    this.tag = 0;
  }

  // speed: I2C's SCL, 100000 or 400000. 0xffff is nobody's vendor ID, so
  // the product string says it's a dart
  async open(speed = 100000) {
    if (!this.device.opened) await this.device.open();
    if (!PRODUCT_NAME.test(this.device.productName ?? '')) {
      throw new Error(`ffff:da92 is "${this.device.productName}", not a dart`);
    }
    if (this.device.configuration === null) await this.device.selectConfiguration(1);
    await this.device.claimInterface(INTERFACE);
    const { protocol } = await this.info();
    if (protocol >> 8 !== PROTOCOL_MAJOR) {
      throw new Error(`dart's command set ${protocol >> 8}.${protocol & 0xff}, this atiic speaks ${PROTOCOL_MAJOR}.x`);
    }
    await this.speed(speed);
    return this;
  }

  async close() {
    await this.queue;
    await this.device.releaseInterface(INTERFACE);
    await this.device.close();
  }

  // a request out, its reply in: { status, count, data }
  request(op, payload = []) {
    const job = this.queue.then(async () => {
      const tag = this.tag = (this.tag + 1) & 0xff;
      const out = new Uint8Array(HEADER + payload.length);
      out.set([op, tag, payload.length & 0xff, payload.length >> 8]);
      out.set(payload, HEADER);
      const w = await this.device.transferOut(ENDPOINT, out);
      if (w.status !== 'ok') throw new Error(`dart write: ${w.status}`);
      for (;;) {
        const r = await this.device.transferIn(ENDPOINT, REPLY_ROOM);
        if (r.status !== 'ok') throw new Error(`dart read: ${r.status}`);
        const b = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
        if (b.length < REPLY_HEADER) throw new Error(`dart read: ${b.length} bytes`);
        if (b[1] !== tag) continue; // a reply to a request cut short before
        const status = (b[2] << 24) >> 24;
        const count = b[4] | (b[5] << 8);
        return { status, count, data: b.slice(REPLY_HEADER) };
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }

  async info() {
    const { status, data } = await this.request(OP.INFO);
    if (status) throw new DartError(status);
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
      protocol: v.getUint16(0, true), version: v.getUint16(2, true), speed: v.getUint32(4, true),
      stretchMs: v.getUint16(8, true), payloadMax: v.getUint16(10, true), readMax: v.getUint16(12, true),
      uniqueId: [...data.slice(14, 22)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(),
    };
  }

  // hz: 100000 or 400000; stretchMs: how long a device may hold SCL
  async speed(hz, stretchMs) {
    const p = [hz & 0xff, (hz >> 8) & 0xff, (hz >> 16) & 0xff, hz >>> 24];
    if (stretchMs !== undefined) p.push(stretchMs & 0xff, stretchMs >> 8);
    const { status } = await this.request(OP.SPEED, p);
    if (status) throw new DartError(status);
  }

  // one transaction: the bytes written, then (if n) a repeated start and n
  // bytes read
  async transfer(address, bytes = [], n = 0) {
    const { status, count, data } = await this.request(OP.I2C, [address, n & 0xff, n >> 8, ...bytes]);
    if (status) throw new DartError(status, address, count);
    return data;
  }

  async write(address, bytes) {
    await this.transfer(address, bytes, 0);
  }

  read(address, n) {
    return this.transfer(address, [], n);
  }

  writeRead(address, bytes, n) {
    return this.transfer(address, bytes, n);
  }

  async acks(address) {
    try {
      await this.transfer(address);
      return true;
    } catch (e) {
      if (e.status === 'NO_DEVICE') return false;
      throw e;
    }
  }

  async scan(first = SCAN_FIRST, last = SCAN_LAST) {
    const { status, data } = await this.request(OP.SCAN, [first, last]);
    if (status) throw new DartError(status);
    return [...data];
  }
}

export default Dart;
