// The CH341 as atiic's I2C bus, on a WebUSB USBDevice: a browser's
// (navigator.usb.requestDevice) or Node's (./node.js, the usb package's
// WebUSB). The bus the device drivers use:
//   scan()                         the 7-bit addresses that ack
//   write(address, bytes)
//   read(address, n)               -> Uint8Array
//   writeRead(address, bytes, n)   -> Uint8Array, a repeated start between
//   pins({ D0: true })             D0-D5 driven high or low, or released (null)
//   readPins()                     -> { D0: true, ... D7 }: the lines' levels
//   spi(bytes)                     -> Uint8Array: SPI, as many bytes back (chip
//                                     selects and other lines by pins())
//   spiSelected(cs, bytes)         -> the same, the line cs low around it, a
//                                     USB round trip less
// A device that doesn't ack its address throws; data bytes written aren't
// checked (the CH341 replies an ack only for bytes sent alone).
import {
  VENDOR_ID, PRODUCT_ID, INTERFACE, ENDPOINT, PACKET_SIZE, ACK_NACKED,
  speedPacket, stopPacket, transaction, packets, uioPacket, UIO_PINS,
  spiPackets, reverseBits, SPI_SCK, SPI_MOSI, CMD_STATUS, STATUS_BYTES, STATUS_PINS,
} from './protocol.js';

export const FILTERS = [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }];
export const SCAN_FIRST = 0x08; // 0x00-0x07 and 0x78-0x7f are reserved
export const SCAN_LAST = 0x77;
const SPI_GROUP = 16; // SPI packets a USB transfer: 512 bytes out, their 496 replies in

const hex = (a) => `0x${a.toString(16).padStart(2, '0')}`;

class Ch341 {
  constructor(device) {
    this.device = device;
    this.queue = Promise.resolve(); // one transaction on the wire at a time
    this.levels = 0; // D0-D5 as last driven: bit n is Dn
    this.outputs = 0;
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
      // as many whole packets as are still to come, in one request
      const r = await this.device.transferIn(ENDPOINT, Math.ceil((n - got.length) / PACKET_SIZE) * PACKET_SIZE);
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

  // D0-D5 driven or released: { D0: true } high, { D0: false } low,
  // { D0: null } back to an input (pulled up? DS1 says so only for D6, D7); lines not named keep
  // what they had. In the queue, so never in the middle of a transaction.
  // The CH341 forgets them when it resets (unplugged): drive them again
  // the levels on D0-D7, driven or not (D6 and D7 are inputs only; D0-D5
  // read as inputs once released by pins())
  readPins() {
    const job = this.queue.then(async () => {
      const reply = this.in(STATUS_BYTES);
      await this.out(Uint8Array.of(CMD_STATUS));
      const [levels] = await reply;
      return Object.fromEntries(STATUS_PINS.map((name, i) => [name, ((levels >> i) & 1) === 1]));
    });
    this.queue = job.catch(() => {});
    return job;
  }

  pins(lines) {
    for (const [name, v] of Object.entries(lines)) {
      const bit = 1 << UIO_PINS.indexOf(name);
      if (bit < 1) throw new Error(`no such pin ${name}: D0-D5 can be driven`);
      if (v === null) {
        this.outputs &= ~bit;
      } else {
        this.outputs |= bit;
        this.levels = v ? this.levels | bit : this.levels & ~bit;
      }
    }
    const data = uioPacket(this.levels, this.outputs);
    const job = this.queue.then(() => this.out(data));
    this.queue = job.catch(() => {});
    return job;
  }

  // SPI, full duplex: the bytes clocked out on MOSI (D5) with SCK (D3), as
  // many read from MISO (D7) and returned. No chip select: drive it with
  // pins() around this. SCK and MOSI made outputs on the first call (SCK
  // idling low). Packets go out SPI_GROUP at a time in one USB transfer, so
  // a long transfer isn't a round trip a packet (r8845: 25,600 bytes in
  // 230 ms, about 110 KB/s)
  spi(bytes) {
    return this.spiRun(bytes, null);
  }

  // spi() with a chip select: the line driven low in the same USB transfer
  // as the bytes (its command a 32-byte packet of its own, the CH341 taking
  // a packet a command, as flashrom sends its chip selects), then high in
  // the next: a round trip less than pins(), spi(), pins(). The high can't
  // ride along: an SPI packet is mostly short, and a short packet ends a
  // transfer (padding it would clock out bytes)
  spiSelected(cs, bytes) {
    if (UIO_PINS.indexOf(cs) < 0) throw new Error(`no such pin ${cs}: D0-D5 can be driven`);
    return this.spiRun(bytes, cs);
  }

  spiRun(bytes, cs) {
    const all = spiPackets(bytes);
    const job = this.queue.then(async () => {
      const sck = 1 << UIO_PINS.indexOf(SPI_SCK), mosi = 1 << UIO_PINS.indexOf(SPI_MOSI);
      let lead = null; // a UIO packet before the first group: SCK and MOSI outputs, the chip select low
      if ((this.outputs & (sck | mosi)) !== (sck | mosi)) {
        this.outputs |= sck | mosi;
        this.levels &= ~sck;
        lead = true;
      }
      const select = cs ? 1 << UIO_PINS.indexOf(cs) : 0;
      if (select) {
        this.outputs |= select;
        this.levels &= ~select;
        lead = true;
      }
      if (lead) {
        lead = new Uint8Array(PACKET_SIZE); // padded: the SPI's packets start on their own
        lead.set(uioPacket(this.levels, this.outputs));
        if (!select) { // as before: on its own
          await this.out(lead.subarray(0, uioPacket(0, 0).length));
          lead = null;
        }
      }
      const got = [];
      for (let g = 0; g < all.length; g += SPI_GROUP) {
        const group = all.slice(g, g + SPI_GROUP);
        if (lead) group.unshift(lead);
        const data = new Uint8Array(group.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of group) { data.set(p, o); o += p.length; }
        // the replies collected while the packets go out: the CH341 stops
        // taking packets once its replies aren't read (flashrom keeps reads
        // waiting too); one after the other, a 1000-byte transfer was cancelled
        const replies = this.in(group.reduce((n, p) => n + (p === lead ? 0 : p.length - 1), 0));
        lead = null;
        await this.out(data);
        got.push(...await replies);
      }
      if (select) {
        this.levels |= select;
        await this.out(uioPacket(this.levels, this.outputs));
      }
      return Uint8Array.from(got, reverseBits);
    });
    this.queue = job.catch(() => {});
    return job;
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
