// Sensirion's SHT3x-DIS (SHT30, SHT31, SHT35): relative humidity and
// temperature, at 0x44 (ADDR low) or 0x45 (ADDR high). Adapter-free: any I2C
// bus with write(address, bytes), read(address, n) and writeRead(address,
// bytes, n).
//
// Per its datasheet (Version 7, December 2022): 16-bit commands, each data
// word followed by a CRC-8 (polynomial 0x31, from 0xFF, Table 20: CRC(0xBEEF)
// = 0x92). A single-shot measurement (Table 9) at a repeatability, high,
// medium or low, its duration up to 15.5, 6.5 and 4.5 ms (Table 5, the
// longer of Tables 4 and 5: any supply), then 6 bytes, temperature first:
//   T = -45 + 175 S / (2^16 - 1) (C),  RH = 100 S / (2^16 - 1) (%)
// Without clock stretching (0x24..) the sensor NACKs a read until it's done:
// the duration waited here, then read. With { hold: true } the clock-
// stretching commands (0x2C..): the read is acknowledged and SCL held low
// until the result is ready, for a bus that waits on it (dart: bus.speed(hz,
// STRETCH_MS); not the CH341, nor the CH347). No ID register: the status
// register (0xF32D) read back with a good CRC is how a bench knows it. Up to
// 1 MHz; 2.15 to 5.5 V. On r8845's dart: 19.96 C, 47.0 % RH.

const ADDRESS = 0x44;
const READ_STATUS = [0xf3, 0x2d];
const CLEAR_STATUS = [0x30, 0x41];
const SOFT_RESET = [0x30, 0xa2];
const RESET_MS = 2; // tSR, at most 1.5 ms (Table 4)
// Table 9's single-shot commands and Table 5's longest durations, ms
export const REPEATABILITIES = {
  high: { hold: [0x2c, 0x06], free: [0x24, 0x00], ms: 15.5 },
  medium: { hold: [0x2c, 0x0d], free: [0x24, 0x0b], ms: 6.5 },
  low: { hold: [0x2c, 0x10], free: [0x24, 0x16], ms: 4.5 },
};
// a bus's stretch limit for { hold: true }: the longest measurement and a
// margin
export const STRETCH_MS = 20;
const FULL_SCALE = 65535;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Table 20's CRC-8: 0x31, from 0xFF
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
  if (crc8(d.slice(i, i + 2)) !== d[i + 2]) throw new Error(`SHT3x ${what} CRC: 0x${d[i + 2].toString(16)}`);
  return (d[i] << 8) | d[i + 1];
}

class Sht3x {
  static chip = {
    name: 'SHT3x',
    // no ID register: its status register, a word and a good CRC
    async identify(bus, address) {
      const d = await bus.writeRead(address, READ_STATUS, 3);
      return crc8(d.slice(0, 2)) === d[2];
    },
  };

  // repeatability: 'high', 'medium' or 'low'; hold: clock stretching, for a
  // bus that waits on a held SCL for STRETCH_MS
  constructor(bus, address = ADDRESS, { repeatability = 'high', hold = false } = {}) {
    if (!REPEATABILITIES[repeatability]) throw new Error(`SHT3x: no repeatability ${repeatability}: ${Object.keys(REPEATABILITIES).join(', ')}`);
    this.bus = bus;
    this.address = address;
    this.repeatability = repeatability;
    this.hold = hold;
  }

  // a soft reset, its status cleared
  async init() {
    await this.bus.write(this.address, SOFT_RESET);
    await delay(RESET_MS);
    await this.bus.write(this.address, CLEAR_STATUS);
  }

  // the status register (Table 18): bit 15 an alert pending, 13 the
  // heater, 4 a reset detected, 1 the last command not processed, 0 the
  // last write's checksum failed
  async status() {
    return word(await this.bus.writeRead(this.address, READ_STATUS, 3), 0, 'status');
  }

  // { temperature: C, humidity: % }, one single-shot measurement
  async measure() {
    const r = REPEATABILITIES[this.repeatability];
    if (this.hold) {
      await this.bus.write(this.address, r.hold);
    } else {
      await this.bus.write(this.address, r.free);
      await delay(r.ms);
    }
    const d = await this.bus.read(this.address, 6);
    return {
      temperature: -45 + (175 * word(d, 0, 'temperature')) / FULL_SCALE,
      humidity: (100 * word(d, 3, 'humidity')) / FULL_SCALE,
    };
  }
}

Sht3x.addresses = [ADDRESS, 0x45];
Sht3x.REPEATABILITIES = REPEATABILITIES;
Sht3x.STRETCH_MS = STRETCH_MS;

export default Sht3x;
