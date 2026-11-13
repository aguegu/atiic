// dart, the user's USB-to-I2C bridge (docs/dart.md), as
// atiic's I2C bus, on a WebUSB USBDevice: a browser's
// (navigator.usb.requestDevice) or Node's (./node.js, the usb package's
// WebUSB); or over Bluetooth LE (firmware dart-ble) on a Web Bluetooth
// BluetoothDevice (navigator.bluetooth.requestDevice, ./ble.js). Its command
// set: one request, one reply (on USB the vendor interface's bulk pair, EP1;
// on Bluetooth a written and a notified characteristic), each reply with a status that tells a
// missing device (no ack from 0x..) from a refused data byte (0x.. refused
// byte k), which the CH341 can't. The bus the device drivers use, as the
// CH341's and CH347's: scan(), write(), read(), writeRead(), acks(); and
// info(), speed(hz, stretchMs).
import { BleLink } from './ble.js';

export { SERVICE as BLE_SERVICE, BLE_REQUEST, BLE_FILTERS, NAME_PREFIX } from './ble.js';
export const VENDOR_ID = 0xffff;
export const PRODUCT_ID = 0xda92;
export const FILTERS = [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }];
// how long open() waits for INFO's reply: a dart answers in a few ms; a
// device that isn't one (0xffff is nobody's vendor ID) may never answer
export const IDENTIFY_MS = 1000;

// the command set's version this adapter speaks: a dart with another major
// is refused at open; a minor only adds, so any minor is taken
export const PROTOCOL_MAJOR = 1;
// 1.1: SPEED takes any Hz from SPEED_MIN to SPEED_MAX (1.0: 100000 and
// 400000 only); BUS_BUSY's count carries the lines; SCAN reports a bus
// error instead of an empty bus
export const PROTOCOL_LINES = 0x0101;
// 1.2: the FIFO pump (FIFO_START, FIFO_TAKE, FIFO_STOP): dart reads a
// sensor's FIFO itself every period into its RAM; INFO adds its buffer size
export const PROTOCOL_FIFO = 0x0102;
export const SPEED_MIN = 7327; // dart's slowest SCL: its divider's largest
export const SPEED_MAX = 400000;
// BUS_BUSY's count (1.1): the lines as dart reads them, a bit set when high
const LINE_SCL = 0x01;
const LINE_SDA = 0x02;

const INTERFACE = 0;
const ENDPOINT = 1;
const HEADER = 4; // a request's
const REPLY_HEADER = 6;
const PACKET = 64;
const READ_MAX = 1024;
// every read asks room for the largest reply and one packet more, so it ends
// at the reply's short (or zero-length) packet, never before it
const REPLY_ROOM = Math.ceil((REPLY_HEADER + READ_MAX) / PACKET) * PACKET + PACKET;

export const OP = { INFO: 0x01, SPEED: 0x02, I2C: 0x10, SCAN: 0x11, FIFO_START: 0x13, FIFO_TAKE: 0x14, FIFO_STOP: 0x15 };
// FIFO_TAKE's flags
const FIFO_RUNNING = 0x01;
const FIFO_FULL = 0x02;
const FIFO_ERROR = 0x04;
export const STATUS = {
  0: 'OK', [-1]: 'NO_DEVICE', [-2]: 'TIMEOUT', [-3]: 'BUS_ERROR', [-4]: 'BUS_BUSY', [-5]: 'REFUSED',
  [-16]: 'UNKNOWN_OP', [-17]: 'BAD_LENGTH', [-18]: 'BAD_SPEED',
};
export const SCAN_FIRST = 0x08;
export const SCAN_LAST = 0x77;

const hex = (a) => `0x${a.toString(16).padStart(2, '0')}`;

// a bus held low (BUS_BUSY from a 1.1 dart): the lines held, by name
const held = (count) => ['SCL', 'SDA'].filter((_, i) => !(count & [LINE_SCL, LINE_SDA][i]));

export class DartError extends Error {
  // lines: BUS_BUSY's count is the lines (a 1.1 dart), not 0
  constructor(status, address, count, { lines = false } = {}) {
    const name = STATUS[status] ?? `status ${status}`;
    const low = name === 'BUS_BUSY' && lines ? held(count) : null;
    const message = name === 'NO_DEVICE' ? `no ack from ${hex(address)}`
      : name === 'REFUSED' ? `${hex(address)} refused byte ${count}`
        : low?.length ? `bus held low: ${low.join(' and ')}${address === undefined ? '' : ` (at ${hex(address)})`}`
          : `${name}${address === undefined ? '' : ` at ${hex(address)}`}`;
    super(message);
    Object.assign(this, { status: name, code: status, address, count });
    if (low) this.held = low;
  }
}

export class Dart {
  // device: a WebUSB USBDevice, or a Web Bluetooth BluetoothDevice (it has
  // gatt)
  constructor(device) {
    this.device = device;
    this.ble = device.gatt ? new BleLink(device) : null;
    this.queue = Promise.resolve(); // one request on the wire at a time
    this.tag = 0;
  }

  async linkOpen() {
    if (this.ble) return this.ble.open();
    if (!this.device.opened) await this.device.open();
    if (this.device.configuration === null) await this.device.selectConfiguration(1);
    await this.device.claimInterface(INTERFACE);
  }

  async send(frame) {
    if (this.ble) return this.ble.send(frame);
    const w = await this.device.transferOut(ENDPOINT, frame);
    if (w.status !== 'ok') throw new Error(`dart write: ${w.status}`);
  }

  // the next reply's bytes
  async receive() {
    if (this.ble) return this.ble.receive();
    const r = await this.device.transferIn(ENDPOINT, REPLY_ROOM);
    if (r.status !== 'ok') throw new Error(`dart read: ${r.status}`);
    return new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
  }

  // speed: I2C's SCL, Hz (100000 or 400000; a 1.1 dart any from SPEED_MIN
  // to SPEED_MAX). A dart is told by its answer to
  // INFO, not by its name (0xffff is nobody's vendor ID, and a name can
  // change): the op and tag echoed, the reply whole, a command set this
  // speaks; nothing within identifyMs, or anything else, isn't a dart
  async open(speed = 100000, { identifyMs = IDENTIFY_MS } = {}) {
    await this.linkOpen();
    let timer;
    const silent = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer to INFO in ${identifyMs} ms: not a dart`)), identifyMs);
    });
    let protocol;
    try {
      ({ protocol } = await Promise.race([this.info(), silent]));
    } catch (e) {
      // the read left waiting ends with the device closed
      this.queue = Promise.resolve();
      await (this.ble ? this.ble.close() : this.device.close()).catch(() => {});
      throw e.message.startsWith('no answer') ? e : new Error(`not a dart: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
    if (protocol >> 8 !== PROTOCOL_MAJOR) {
      throw new Error(`dart's command set ${protocol >> 8}.${protocol & 0xff}, this atiic speaks ${PROTOCOL_MAJOR}.x`);
    }
    this.protocol = protocol;
    await this.speed(speed);
    return this;
  }

  async close() {
    await this.queue;
    if (this.ble) return this.ble.close();
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
      await this.send(out);
      for (;;) {
        const b = await this.receive();
        if (b.length < REPLY_HEADER) throw new Error(`dart read: ${b.length} bytes`);
        if (b[1] !== tag) continue; // a reply to a request cut short before
        if (b[0] !== op) throw new Error(`a reply to op ${b[0]}, not ${op}`);
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
      ...(data.length >= 24 && { fifoBuffer: v.getUint16(22, true) }), // 1.2
    };
  }

  // hz: SCL (100000 or 400000; a 1.1 dart any from SPEED_MIN to SPEED_MAX,
  // e.g. 10000 for a device that wants 15 kHz or under); stretchMs: how
  // long a device may hold SCL, past a byte's own time
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
    if (status) throw new DartError(status, address, count, { lines: this.protocol >= PROTOCOL_LINES });
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
    const { status, count, data } = await this.request(OP.SCAN, [first, last]);
    if (status) throw new DartError(status, undefined, count, { lines: this.protocol >= PROTOCOL_LINES });
    return [...data];
  }

  // a FIFO pump (1.2): a device driver with a FIFO (Mpu6050's startFifo())
  // hands it its reads when the bus has one
  get fifoPump() {
    return this.protocol >= PROTOCOL_FIFO;
  }

  // dart reads the FIFO at address every periodMs: its count (2 bytes,
  // big-endian) at register count, then the whole frames (frame bytes) it
  // holds from register data, into dart's buffer; a count at full or over
  // stops it (full: true from fifoTake())
  async fifoStart(address, { count, data, frame, full, periodMs }) {
    const { status } = await this.request(OP.FIFO_START, [address, count, data, frame, full & 0xff, full >> 8, periodMs & 0xff, periodMs >> 8]);
    if (status) throw new DartError(status, address);
    this.fifoAddress = address;
  }

  // the frames gathered (up to most bytes), oldest first: { running, full,
  // error, data }; error a DartError when an I2C error stopped the pump
  async fifoTake(most = READ_MAX) {
    const { status, data } = await this.request(OP.FIFO_TAKE, [most & 0xff, most >> 8]);
    if (status) throw new DartError(status);
    const [flags, code] = data;
    return {
      running: !!(flags & FIFO_RUNNING),
      full: !!(flags & FIFO_FULL),
      error: flags & FIFO_ERROR ? new DartError((code << 24) >> 24, this.fifoAddress) : null,
      data: data.slice(2),
    };
  }

  async fifoStop() {
    const { status } = await this.request(OP.FIFO_STOP);
    if (status) throw new DartError(status);
  }
}

export default Dart;
