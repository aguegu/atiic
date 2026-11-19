// Sensirion's SHT4x (SHT40, SHT41, SHT45): relative humidity and temperature,
// at 0x44 (the -AD1B parts) or 0x45 (-BD1B). Adapter-free: any I2C bus with
// write(address, bytes) and read(address, n).
//
// Per its datasheet (Version 2, July 2021, docs/): 8-bit commands (Table 7),
// each reply's 16-bit words followed by a CRC-8 (0x31, from 0xFF, Table 6:
// CRC(0xBEEF) = 0x92; the SHT3x's). A measurement at a repeatability, high
// (0xFD), medium (0xF6) or low (0xE0), lasting up to 8.2, 4.5 and 1.7 ms
// (Table 4), then 6 bytes, temperature first:
//   T = -45 + 175 S / (2^16 - 1) (C),  RH = -6 + 125 S / (2^16 - 1) (%)
// RH as it comes (4.5): below 0 or over 100 % is "non-physical", cropping
// advised, left to the caller. No clock stretching (4.1): until it's done
// the sensor NACKs a read; the duration waited here, then read. The heater
// (4.8): 200, 110 or 20 mW for 1 s or 0.1 s, then a high-repeatability
// measurement, the heater off; for at most 5 % of the time (its lifetime's
// duty cycle). No ID register: the serial number (0x89, two words with their
// CRCs) is how a bench knows it; ours answered the read at once, no time
// given for it. Up to 1 MHz; 1.08 to 3.6 V.
// Measured on Dart-8346 at 100 kHz: ready after 7.4, 4.4 and 2.0 ms
// (polled, the bus's own time included); 23.0 C, 55.4 % RH.

const ADDRESS = 0x44;
const SERIAL = 0x89;
const SOFT_RESET = 0x94;
const RESET_MS = 1; // tSR, at most 1 ms (Table 4)
// Table 7's commands and Table 4's longest durations, ms
export const REPEATABILITIES = {
  high: { command: 0xfd, ms: 8.2 },
  medium: { command: 0xf6, ms: 4.5 },
  low: { command: 0xe0, ms: 1.7 },
};
// the heater (Table 7), by power (mW) and pulse: its command; the pulse's
// longest (Table 4: 1.1 s, 0.11 s), then the high-repeatability measurement
export const HEATER = {
  200: { long: 0x39, short: 0x32 },
  110: { long: 0x2f, short: 0x24 },
  20: { long: 0x1e, short: 0x15 },
};
const PULSE_MS = { long: 1100, short: 110 };
const FULL_SCALE = 65535;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Table 6's CRC-8: 0x31, from 0xFF
export function crc8(bytes) {
  let c = 0xff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

// a 16-bit word at i, its CRC checked
function word(d, i, what) {
  if (crc8(d.slice(i, i + 2)) !== d[i + 2]) throw new Error(`SHT4x ${what} CRC: 0x${d[i + 2].toString(16)}`);
  return (d[i] << 8) | d[i + 1];
}

const convert = (d) => ({
  temperature: -45 + (175 * word(d, 0, 'temperature')) / FULL_SCALE,
  humidity: -6 + (125 * word(d, 3, 'humidity')) / FULL_SCALE,
});

class Sht4x {
  static chip = {
    name: 'SHT4x',
    // no ID register: its serial number, two words with good CRCs (an SHT3x
    // at the same addresses takes no 8-bit command: a refusal is a no)
    async identify(bus, address) {
      try {
        await bus.write(address, [SERIAL]);
        const d = await bus.read(address, 6);
        return crc8(d.slice(0, 2)) === d[2] && crc8(d.slice(3, 5)) === d[5];
      } catch {
        return false;
      }
    },
  };

  // repeatability: 'high', 'medium' or 'low'
  constructor(bus, address = ADDRESS, { repeatability = 'high' } = {}) {
    if (!REPEATABILITIES[repeatability]) throw new Error(`SHT4x: no repeatability ${repeatability}: ${Object.keys(REPEATABILITIES).join(', ')}`);
    this.bus = bus;
    this.address = address;
    this.repeatability = repeatability;
  }

  // a soft reset
  async init() {
    await this.bus.write(this.address, [SOFT_RESET]);
    await delay(RESET_MS);
  }

  // its serial number (4.6), 32 bits
  async serialNumber() {
    await this.bus.write(this.address, [SERIAL]);
    const d = await this.bus.read(this.address, 6);
    return ((word(d, 0, 'serial') << 16) | word(d, 3, 'serial')) >>> 0;
  }

  // { temperature: C, humidity: % }, one measurement
  async measure() {
    const r = REPEATABILITIES[this.repeatability];
    await this.bus.write(this.address, [r.command]);
    await delay(r.ms);
    return convert(await this.bus.read(this.address, 6));
  }

  // the heater on (mw: 200, 110 or 20; long: 1 s, else 0.1 s), then the
  // high-repeatability measurement it ends with, heated: { temperature,
  // humidity }. Keep it to 5 % of the time (4.8); not above 65 C ambient
  async heat(mw = 20, { long = false } = {}) {
    const h = HEATER[mw];
    if (!h) throw new Error(`SHT4x: no heater power ${mw} mW: ${Object.keys(HEATER).join(', ')}`);
    await this.bus.write(this.address, [long ? h.long : h.short]);
    await delay(PULSE_MS[long ? 'long' : 'short'] + REPEATABILITIES.high.ms);
    return convert(await this.bus.read(this.address, 6));
  }
}

Sht4x.addresses = [ADDRESS, 0x45];
Sht4x.REPEATABILITIES = REPEATABILITIES;
Sht4x.HEATER = HEATER;

export default Sht4x;
