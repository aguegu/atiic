// Sensirion's SHT20: relative humidity and temperature, at 0x40.
// Adapter-free: any I2C bus with write(address, bytes) and read(address, n).
//
// Per its datasheet (Version 5, October 2022, docs/): commands, not
// registers. A measurement in "no hold master" mode: the trigger written
// (T 0xF3, RH 0xF5), the sensor left to measure (it doesn't acknowledge a
// read until done), then 3 bytes: the value's MSB and LSB (its 2 lowest
// bits status: bit 1 set for humidity) and a CRC-8 (x8 + x5 + x4 + 1, from
// 0). Waited here the datasheet's maximum (Table 7) for the default
// resolution (RH 12 bits, T 14 bits) rather than polled: hold master mode
// would need the CH341 to wait on a held-low SCL, not counted on.
//   RH = -6 + 125 S / 2^16 (%),  T = -46.85 + 175.72 S / 2^16 (C)
// r8845's module reads its user register 0x3A (the datasheet's example:
// 0x02): its reserved bits set. Its electronic ID (0xFC 0xC9) reads with
// good CRCs, which is how a bench knows it (chip.identify).

const TRIGGER_T = 0xf3;
const TRIGGER_RH = 0xf5;
const READ_USER = 0xe7;
const SOFT_RESET = 0xfe;
const READ_ID_2 = [0xfc, 0xc9]; // 6 bytes: two words, each with its CRC
const T_MAX_MS = 85; // Table 7: 14 bits
const RH_MAX_MS = 29; // Table 7: 12 bits
const RESET_MS = 15; // "the soft reset takes less than 15 ms"
const STATUS_BITS = 0x03;
const HUMIDITY_BIT = 0x02;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the datasheet's CRC-8: x8 + x5 + x4 + 1, from 0
export function crc8(bytes) {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

class Sht20 {
  static chip = {
    name: 'SHT20',
    // no ID register: an SHT2x answers its electronic ID's second read with
    // two words and their CRCs
    async identify(bus, address) {
      const d = await bus.writeRead(address, READ_ID_2, 6);
      return crc8(d.slice(0, 2)) === d[2] && crc8(d.slice(3, 5)) === d[5];
    },
  };

  constructor(bus, address = 0x40) {
    this.bus = bus;
    this.address = address;
  }

  // a soft reset: the user register's defaults back (12-bit RH, 14-bit T)
  async init() {
    await this.bus.write(this.address, [SOFT_RESET]);
    await delay(RESET_MS);
  }

  async userRegister() {
    const [u] = await this.bus.writeRead(this.address, [READ_USER], 1);
    return u;
  }

  // one measurement's raw 16 bits (status cleared), its CRC and type checked
  async raw(trigger, waitMs, humidity) {
    await this.bus.write(this.address, [trigger]);
    await delay(waitMs);
    const d = await this.bus.read(this.address, 3);
    if (crc8(d.slice(0, 2)) !== d[2]) throw new Error(`SHT20 CRC: 0x${d[2].toString(16)} for ${d[0]}, ${d[1]}`);
    if (Boolean(d[1] & HUMIDITY_BIT) !== humidity) throw new Error(`SHT20 sent a ${humidity ? 'temperature' : 'humidity'} for a ${humidity ? 'humidity' : 'temperature'}`);
    return ((d[0] << 8) | d[1]) & ~STATUS_BITS;
  }

  async temperature() {
    return -46.85 + (175.72 * await this.raw(TRIGGER_T, T_MAX_MS, false)) / 65536;
  }

  async humidity() {
    return -6 + (125 * await this.raw(TRIGGER_RH, RH_MAX_MS, true)) / 65536;
  }

  // { temperature: C, humidity: % } (~115 ms: the two waits)
  async measure() {
    return { temperature: await this.temperature(), humidity: await this.humidity() };
  }
}

Sht20.addresses = [0x40];

export default Sht20;
