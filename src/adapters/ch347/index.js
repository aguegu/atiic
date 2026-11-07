// The CH347 as atiic's I2C bus, on a WebUSB USBDevice: a browser's
// (navigator.usb.requestDevice) or Node's (./node.js, the usb package's
// WebUSB). The bus the device drivers use:
//   scan()                         the 7-bit addresses that ack
//   write(address, bytes)
//   read(address, n)               -> Uint8Array
//   writeRead(address, bytes, n)   -> Uint8Array, a repeated start between
//   acks(address)                  -> whether a device answers there
//   spi(bytes)                     -> Uint8Array: SPI, as many bytes back
//   pins({ GPIO6: true, CS1: false }) GPIOs driven high or low (null: an
//                                     input), the chip selects high or low
// A device that doesn't ack its address throws "no ack from 0x..": so does a
// written byte it refuses (the CH347 replies every byte's ack).
import {
  VENDOR_ID, PRODUCT_IDS, VENDOR_CLASS, PACKET_SIZE, ACKED,
  speedPacket, stopPacket, transaction, packets,
  spiConfigPacket, CMD_SPI_SET_CFG, CMD_SPI_OUT_IN, csPacket, CS_PINS, spiPackets, gpioPacket, GPIO_PINS, CMD_GPIO,
} from './protocol.js';

export const FILTERS = PRODUCT_IDS.map((productId) => ({ vendorId: VENDOR_ID, productId }));
export const SCAN_FIRST = 0x08; // 0x00-0x07 and 0x78-0x7f are reserved
export const SCAN_LAST = 0x77;

const hex = (a) => `0x${a.toString(16).padStart(2, '0')}`;

// the vendor-class interface and its bulk endpoints: interface 2 on a CH347T
// in mode 1 (0 and 1 its serial port), another number on the CH347F
export function findInterface(configuration) {
  for (const iface of configuration.interfaces) {
    const alt = iface.alternate ?? iface.alternates[0];
    if (alt.interfaceClass !== VENDOR_CLASS) continue;
    const bulk = (direction) => alt.endpoints.find((e) => e.type === 'bulk' && e.direction === direction)?.endpointNumber;
    const out = bulk('out'), inn = bulk('in');
    if (out !== undefined && inn !== undefined) return { number: iface.interfaceNumber, out, in: inn };
  }
  throw new Error('CH347: no vendor interface with bulk endpoints (a CH347T in mode 1, or a CH347F?)');
}

class Ch347 {
  constructor(device) {
    this.device = device;
    this.queue = Promise.resolve(); // one transaction on the wire at a time
  }

  // speed: I2C's SCL; spiHz, spiMode: SPI's, set on the first spi() or pins()
  async open(speed = 100000, { spiHz = 7.5e6, spiMode = 0 } = {}) {
    this.spiHz = spiHz;
    this.spiMode = spiMode;
    this.spiReady = false;
    if (!this.device.opened) await this.device.open();
    if (this.device.configuration === null) await this.device.selectConfiguration(1);
    this.iface = findInterface(this.device.configuration);
    await this.device.claimInterface(this.iface.number);
    await this.out(speedPacket(speed));
    return this;
  }

  async close() {
    await this.queue;
    await this.device.releaseInterface(this.iface.number);
    await this.device.close();
  }

  async out(data) {
    const r = await this.device.transferOut(this.iface.out, data);
    if (r.status !== 'ok' || r.bytesWritten !== data.length) {
      throw new Error(`CH347 write: ${r.status}, ${r.bytesWritten} of ${data.length}`);
    }
  }

  async in(n) {
    const got = [];
    while (got.length < n) {
      // as many whole packets as are still to come, in one request
      const r = await this.device.transferIn(this.iface.in, Math.ceil((n - got.length) / PACKET_SIZE) * PACKET_SIZE);
      if (r.status !== 'ok') throw new Error(`CH347 read: ${r.status}`);
      got.push(...new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));
    }
    return got;
  }

  // a transaction's packets out, their replies in; the read bytes back
  run(address, writes, reads) {
    const job = this.queue.then(async () => {
      const data = [];
      const all = packets(transaction(address, writes, reads));
      let written = 0; // the data bytes acked so far, to name the one refused
      for (const [k, p] of all.entries()) {
        await this.out(p.data);
        if (!p.reply) continue;
        const reply = await this.in(p.reply);
        const refused = p.acks.find((i) => reply[i] !== ACKED);
        if (refused !== undefined) {
          // the packet ran on to its end; the stop is still owed if it wasn't the last
          if (k < all.length - 1) await this.out(stopPacket());
          if (p.addresses.includes(refused)) throw new Error(`no ack from ${hex(address)}`);
          const before = p.acks.filter((i) => i < refused && !p.addresses.includes(i)).length;
          throw new Error(`no ack from ${hex(address)} for byte ${written + before}`);
        }
        written += p.acks.length - p.addresses.length;
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
      if (e.message === `no ack from ${hex(address)}`) return false;
      throw e;
    }
  }

  // SPI set up once (master, the mode and clock asked at open, chip selects
  // by software), its status checked
  async spiSetup() {
    if (this.spiReady) return;
    await this.out(spiConfigPacket(this.spiHz, this.spiMode));
    const r = await this.in(4);
    if (r[0] !== CMD_SPI_SET_CFG || r[3] !== 0) throw new Error(`CH347 SPI config refused: ${r.map((b) => b.toString(16)).join(' ')}`);
    this.spiReady = true;
  }

  // SPI, full duplex: the bytes out on MOSI, as many read from MISO. No chip
  // select: drive CS0/CS1 (or a GPIO) with pins() around it. Each command
  // goes out before the last one's reply is read (two in flight), so the
  // wire isn't left idle for a USB round trip between commands
  spi(bytes) {
    const job = this.queue.then(async () => {
      await this.spiSetup();
      const got = new Uint8Array(bytes.length);
      let at = 0;
      let reading = Promise.resolve();
      for (const p of spiPackets(Uint8Array.from(bytes))) {
        const n = p.length - 3;
        const sent = this.out(p);
        await reading;
        await sent;
        reading = this.in(n + 3).then((r) => {
          if (r[0] !== CMD_SPI_OUT_IN) throw new Error(`CH347 SPI reply 0x${r[0].toString(16)}`);
          got.set(r.slice(3, 3 + n), at);
          at += n;
        });
      }
      await reading;
      return got;
    });
    this.queue = job.catch(() => {});
    return job;
  }

  // GPIOn (the CH347T in mode 1: GPIO4, GPIO6, GPIO7, and GPIO2, GPIO5 on
  // CS0's and CS1's pins, taken from them) high (true), low (false) or an
  // input (null); CS0 and CS1 high or low. Lines not named keep what they had
  pins(lines) {
    for (const name of Object.keys(lines)) {
      if (!CS_PINS.includes(name) && !GPIO_PINS.includes(name)) throw new Error(`no such pin ${name}: ${[...GPIO_PINS, ...CS_PINS].join(', ')}`);
      if (CS_PINS.includes(name) && lines[name] === null) throw new Error(`${name} can't be released`);
    }
    const job = this.queue.then(async () => {
      await this.spiSetup();
      const cs = Object.fromEntries(Object.entries(lines).filter(([n]) => CS_PINS.includes(n)));
      const gpio = Object.fromEntries(Object.entries(lines).filter(([n]) => GPIO_PINS.includes(n)));
      if (Object.keys(gpio).length) {
        await this.out(gpioPacket(gpio));
        const r = await this.in(11);
        if (r[0] !== CMD_GPIO) throw new Error(`CH347 GPIO reply 0x${r[0].toString(16)}`);
      }
      if (Object.keys(cs).length) await this.out(csPacket(cs));
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

export default Ch347;
