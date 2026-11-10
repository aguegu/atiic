// Sensirion's SHT20: relative humidity and temperature, at 0x40.
// Adapter-free: any I2C bus with write(address, bytes) and read(address, n).
//
// Per its datasheet (Version 5, October 2022, docs/): commands, not
// registers. A measurement in "no hold master" mode: the trigger written
// (T 0xF3, RH 0xF5), the sensor left to measure (it doesn't acknowledge a
// read until done), then 3 bytes: the value's MSB and LSB (its 2 lowest
// bits status: bit 1 set for humidity) and a CRC-8 (x8 + x5 + x4 + 1, from
// 0). Waited here the datasheet's maximum (Table 7) for the resolution set
// rather than polled. Or, with { hold: true }, "hold master" mode (T 0xE3,
// RH 0xE5; Figure 15): the trigger and the read in one transaction, the
// sensor holding SCL low until it's done, so the reading comes at its own
// time, not the worst case; only on a bus that waits on a held SCL that long
// (dart, its stretch limit over the longest wait: STRETCH_MS), not the CH341
// or the CH347 (they don't wait). The resolution (user register bits 7 and 0,
// Table 8): RH 12 / T 14 bits by default, or 8/12, 10/13, 11/11, set by
// reading the register and changing only those bits (its reserved bits
// "must not be changed"). Self-heating stays under 0.1 C while it measures
// no more than 10 % of the time (2.3): periodMs() is that, for the
// resolution set.
//   RH = -6 + 125 S / 2^16 (%),  T = -46.85 + 175.72 S / 2^16 (C)
// r8845's module reads its user register 0x3A (the datasheet's example:
// 0x02): its reserved bits set. Its electronic ID (0xFC 0xC9) reads with
// good CRCs, which is how a bench knows it (chip.identify).

const TRIGGER_T = 0xf3;
const TRIGGER_RH = 0xf5;
const TRIGGER_T_HOLD = 0xe3;
const TRIGGER_RH_HOLD = 0xe5;
// the longest the sensor holds SCL in hold master mode: Table 7's longest
// (T, 14 bits, 85 ms) and a margin; a bus's stretch limit for { hold: true }
export const STRETCH_MS = 100;
const READ_USER = 0xe7;
const WRITE_USER = 0xe6;
const RESOLUTION_BITS = 0x81; // the user register's bits 7 and 0
// Table 7's maximum times, ms, and Table 8's codes ('00' 12/14 ... bit 7
// then bit 0), by RH/T bits
export const RESOLUTIONS = {
  '12/14': { rh: 12, t: 14, rhMs: 29, tMs: 85, code: 0x00 },
  '8/12': { rh: 8, t: 12, rhMs: 4, tMs: 22, code: 0x01 },
  '10/13': { rh: 10, t: 13, rhMs: 9, tMs: 43, code: 0x80 },
  '11/11': { rh: 11, t: 11, rhMs: 15, tMs: 11, code: 0x81 },
};
const DEFAULT_RESOLUTION = '12/14';
const MAX_ACTIVE = 0.1; // 2.3: active no more than 10 % of the time
const SOFT_RESET = 0xfe;
const READ_ID_2 = [0xfc, 0xc9]; // 6 bytes: two words, each with its CRC
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

  // hold: hold master mode, for a bus that waits on a held SCL for
  // STRETCH_MS (dart: bus.speed(hz, STRETCH_MS))
  constructor(bus, address = 0x40, { hold = false } = {}) {
    this.bus = bus;
    this.address = address;
    this.hold = hold;
    this.resolution = DEFAULT_RESOLUTION;
  }

  // a soft reset: the user register's defaults back (12-bit RH, 14-bit T)
  async init() {
    await this.bus.write(this.address, [SOFT_RESET]);
    await delay(RESET_MS);
    this.resolution = DEFAULT_RESOLUTION;
  }

  // the resolution, 'RH/T' bits: '12/14', '8/12', '10/13' or '11/11'; the
  // user register read and only its bits 7 and 0 changed
  async setResolution(name) {
    const r = RESOLUTIONS[name];
    if (!r) throw new Error(`SHT20: no resolution ${name}: ${Object.keys(RESOLUTIONS).join(', ')}`);
    const u = await this.userRegister();
    await this.bus.write(this.address, [WRITE_USER, (u & ~RESOLUTION_BITS) | r.code]);
    this.resolution = name;
  }

  // the shortest period between measure()s that keeps it active no more
  // than 10 % of the time, ms (12/14 bits: 1140; 11/11: 260)
  periodMs() {
    const r = RESOLUTIONS[this.resolution];
    return (r.rhMs + r.tMs) / MAX_ACTIVE;
  }

  async userRegister() {
    const [u] = await this.bus.writeRead(this.address, [READ_USER], 1);
    return u;
  }

  // one measurement's raw 16 bits (status cleared), its CRC and type checked
  async raw(humidity) {
    const r = RESOLUTIONS[this.resolution];
    let d;
    if (this.hold) {
      d = await this.bus.writeRead(this.address, [humidity ? TRIGGER_RH_HOLD : TRIGGER_T_HOLD], 3);
    } else {
      await this.bus.write(this.address, [humidity ? TRIGGER_RH : TRIGGER_T]);
      await delay(humidity ? r.rhMs : r.tMs);
      d = await this.bus.read(this.address, 3);
    }
    if (crc8(d.slice(0, 2)) !== d[2]) throw new Error(`SHT20 CRC: 0x${d[2].toString(16)} for ${d[0]}, ${d[1]}`);
    if (Boolean(d[1] & HUMIDITY_BIT) !== humidity) throw new Error(`SHT20 sent a ${humidity ? 'temperature' : 'humidity'} for a ${humidity ? 'humidity' : 'temperature'}`);
    return ((d[0] << 8) | d[1]) & ~STATUS_BITS;
  }

  async temperature() {
    return -46.85 + (175.72 * await this.raw(false)) / 65536;
  }

  async humidity() {
    return -6 + (125 * await this.raw(true)) / 65536;
  }

  // { temperature: C, humidity: % } (no hold: the two waits, 114 ms at
  // 12/14 bits, 26 ms at 11/11; hold: as long as the sensor takes)
  async measure() {
    return { temperature: await this.temperature(), humidity: await this.humidity() };
  }
}

Sht20.addresses = [0x40];
Sht20.RESOLUTIONS = RESOLUTIONS;
Sht20.STRETCH_MS = STRETCH_MS;

export default Sht20;
