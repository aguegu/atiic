// Atmel's (Microchip's) AT24C01A/02/04/08A/16A serial EEPROMs: 128 B to
// 2 KB. Adapter-free: any I2C bus with write(address, bytes),
// writeRead(address, bytes, n) and acks(address).
//
// Per its datasheet (0180Z1-SEEPR-5/07, docs/AT24C01A-16A.pdf): one byte
// of word address; the 4K, 8K and 16K take the address's high bits as
// "page address" bits in the device address, so each 256-byte block
// answers at its own address (the AT24C08A: 0x50-0x53, A2 picking
// 0x54-0x57). Reads are sequential across the whole memory ("roll over"
// only at its end); a page write takes 8 (1K, 2K) or 16 bytes and wraps
// within its page, so writes are split at page edges; each is followed by
// the self-timed write cycle (5 ms max), awaited by acknowledge polling
// (the device address answers again once it's done). No ID: a bench names
// it (BENCH_AT24C08).

const MODELS = {
  AT24C01A: { bytes: 128, pageBytes: 8 },
  AT24C02: { bytes: 256, pageBytes: 8 },
  AT24C04: { bytes: 512, pageBytes: 16 },
  AT24C08: { bytes: 1024, pageBytes: 16 },
  AT24C16: { bytes: 2048, pageBytes: 16 },
};
const BLOCK_BYTES = 256; // one byte of word address
const WRITE_CYCLE_MS = 5; // tWR, max
// how long the polling waits for the write cycle before giving up: tWR
// over again, for the bus's own time
const POLL_LIMIT_MS = 2 * WRITE_CYCLE_MS;

class At24c {
  static models = MODELS;

  constructor(bus, { model = 'AT24C08', address = 0x50 } = {}) {
    const m = MODELS[model];
    if (!m) throw new Error(`no ${model}: ${Object.keys(MODELS).join(', ')}`);
    this.bus = bus;
    this.address = address;
    this.model = model;
    this.bytes = m.bytes;
    this.pageBytes = m.pageBytes;
  }

  // the device address and word address of a byte
  where(offset) {
    return [this.address + Math.floor(offset / BLOCK_BYTES), offset % BLOCK_BYTES];
  }

  check(offset, n) {
    if (!(offset >= 0 && n >= 0 && offset + n <= this.bytes)) throw new Error(`${this.model}: ${n} bytes at ${offset} is outside its ${this.bytes}`);
  }

  // n bytes from offset: one random read, sequential across the blocks
  async read(offset, n) {
    this.check(offset, n);
    if (n === 0) return new Uint8Array(0);
    const [device, word] = this.where(offset);
    return this.bus.writeRead(device, [word], n);
  }

  // bytes written at offset, a page write at a time, each cycle awaited
  async write(offset, bytes) {
    const data = Uint8Array.from(bytes);
    this.check(offset, data.length);
    for (let i = 0; i < data.length;) {
      const at = offset + i;
      const n = Math.min(this.pageBytes - (at % this.pageBytes), data.length - i);
      const [device, word] = this.where(at);
      await this.bus.write(device, [word, ...data.subarray(i, i + n)]);
      await this.writeCycle(device);
      i += n;
    }
  }

  // acknowledge polling: the device answers once the write cycle is done
  async writeCycle(device) {
    const until = performance.now() + POLL_LIMIT_MS;
    while (!(await this.bus.acks(device))) {
      if (performance.now() > until) throw new Error(`${this.model} at 0x${device.toString(16)}: still writing after ${POLL_LIMIT_MS} ms (tWR max ${WRITE_CYCLE_MS})`);
    }
  }
}

export default At24c;
