// TE Connectivity's (MEAS) HTU21D(F): relative humidity and temperature, at
// 0x40. Adapter-free: any I2C bus with write(address, bytes) and read(address, n).
//
// Per its datasheet (HPC199_3, October 2013, docs/): an SHT20's commands and
// formulas to the bit (Sht20, devices/sht20.js, which this extends): the
// triggers (T 0xF3, RH 0xF5 no hold; 0xE3, 0xE5 hold master), the user
// register (0xE7 read, 0xE6 write; resolution in bits 7 and 0, the same four
// codes; bit 6 end of battery, bit 2 heater, bit 1 OTP reload off), the soft
// reset (0xFE, under 15 ms), the CRC-8 (x8 + x5 + x4 + 1, from 0), the two
// status bits and
//   RH = -6 + 125 S / 2^16 (%),  T = -46.85 + 175.72 S / 2^16 (C)
// What differs: its measuring times, about half an SHT20's (pp. 3 and 5,
// their maxima, "applied for calculating waiting times"), and its
// electronic ID: no command for it in the datasheet ("can be read out by
// command"), but ours answers an SHT2x's second read (0xFC 0xC9) with good
// CRCs, its second word 0x4854, "HT", where r8845's SHT20 says 0x0080: how a
// bench tells the two apart at the same 0x40 (chip.identify).
// Its user register reads 0x02 (the datasheet's default: OTP reload off).
// No self-heating rule in its datasheet: periodMs() keeps the SHT20's 10 %
// active, the duty cycle its average power is given at (p. 3, "< 10 %").
// Measured on Dart-8346 at 100 kHz: T 14 bits ready after 38 ms, RH 12 bits
// after 13 (polled), inside 50 and 16.
import Sht20, { electronicId } from './sht20.js';

// the datasheet's maximum measuring times, ms, by RH/T bits (pp. 3, 5);
// the user register's codes, bit 7 then bit 0 (p. 13)
export const RESOLUTIONS = {
  '12/14': { rh: 12, t: 14, rhMs: 16, tMs: 50, code: 0x00 },
  '8/12': { rh: 8, t: 12, rhMs: 3, tMs: 13, code: 0x01 },
  '10/13': { rh: 10, t: 13, rhMs: 5, tMs: 25, code: 0x80 },
  '11/11': { rh: 11, t: 11, rhMs: 8, tMs: 7, code: 0x81 },
};
// the longest it holds SCL in hold master mode: T at 14 bits, 50 ms, and a
// margin; a bus's stretch limit for { hold: true }
export const STRETCH_MS = 60;
const HT = 0x4854; // "HT": the electronic ID's second word

class Htu21d extends Sht20 {
  static chip = {
    name: 'HTU21D',
    async identify(bus, address) {
      const id = await electronicId(bus, address);
      return id !== null && id[1] === HT;
    },
  };

  static RESOLUTIONS = RESOLUTIONS;
  static STRETCH_MS = STRETCH_MS;
}

Htu21d.addresses = [0x40];

export default Htu21d;
