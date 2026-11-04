// The CH341 as atiic's I2C bus, on a WebUSB USBDevice: a browser's
// (navigator.usb.requestDevice) or Node's (./node.js, the usb package's
// WebUSB). The bus the device drivers use:
//   scan()                         the 7-bit addresses that ack
//   write(address, bytes)
//   read(address, n)               -> Uint8Array
//   writeRead(address, bytes, n)   -> Uint8Array, a repeated start between
// A device that doesn't ack its address throws; data bytes written aren't
// checked (the CH341 replies an ack only for bytes sent alone).
import {
  VENDOR_ID, PRODUCT_ID, INTERFACE, ENDPOINT, PACKET_SIZE, ACK_NACKED,
  speedPacket, stopPacket, transaction, packets,
} from './protocol.js';

export const FILTERS = [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }];
export const SCAN_FIRST = 0x08; // 0x00-0x07 and 0x78-0x7f are reserved
export const SCAN_LAST = 0x77;

const hex = (a) => `0x${a.toString(16).padStart(2, '0')}`;

class Ch341 {
  constructor(device) {
    this.device = device;
    this.queue = Promise.resolve(); // one transaction on the wire at a time
  }

  async open(speed = 100000) {
    if (!this.device.opened) await this.device.open();
    if (this.device.configuration === null) await this.device.selectConfiguration(1);
    await this.device.claimInterface(INTERFACE);
    await this.out(speedPacket(speed));
    return this;
  }

  async close() {
    await this.queue;
    await this.device.releaseInterface(INTERFACE);
    await this.device.close();
  }

  async out(data) {
    const r = await this.device.transferOut(ENDPOINT, data);
    if (r.status !== 'ok' || r.bytesWritten !== data.length) {
      throw new Error(`CH341 write: ${r.status}, ${r.bytesWritten} of ${data.length}`);
    }
  }

  async in(n) {
    const got = [];
    while (got.length < n) {
      const r = await this.device.transferIn(ENDPOINT, PACKET_SIZE);
      if (r.status !== 'ok') throw new Error(`CH341 read: ${r.status}`);
      got.push(...new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));
    }
    return got;
  }

  // a transaction's packets out, their replies in; the read bytes back
  run(address, writes, reads) {
    const job = this.queue.then(async () => {
      const data = [];
      const all = packets(transaction(address, writes, reads));
      for (const [k, p] of all.entries()) {
        await this.out(p.data);
        if (!p.reply) continue;
        const reply = await this.in(p.reply);
        if (p.acks.some((i) => reply[i] & ACK_NACKED)) {
          // the packet ran on to its end; the stop is still owed if it wasn't the last
          if (k < all.length - 1) await this.out(stopPacket());
          throw new Error(`no ack from ${hex(address)}`);
        }
        data.push(...reply.filter((_, i) => !p.acks.includes(i)));
      }
      return Uint8Array.from(data);
    });
    this.queue = job.catch(() => {});
    return job;
  }

  async write(address, bytes) {
    await this.run(address, bytes, 0);
  }

  read(address, n) {
    return this.run(address, [], n);
  }

  writeRead(address, bytes, n) {
    return this.run(address, bytes, n);
  }

  async acks(address) {
    try {
      await this.run(address, [], 0);
      return true;
    } catch (e) {
      if (e.message.startsWith('no ack')) return false;
      throw e;
    }
  }

  async scan(first = SCAN_FIRST, last = SCAN_LAST) {
    const found = [];
    for (let a = first; a <= last; a++) {
      if (await this.acks(a)) found.push(a);
    }
    return found;
  }
}

export default Ch341;
