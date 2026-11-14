// ASAIR's (Aosong's) AGR12 / AGN12 / AGP12: a gauge pressure sensor, its
// I2C version (part codes ending in C, e.g. AGP12-040C), at 0x50.
// Adapter-free: any I2C bus with write(address, bytes) and read(address, n).
//
// Per its manual (AGR12\AGN12\AGP12 series, 2026-05, section 7): a
// command, not registers. A measurement: 0xAC 0x12
// written, 80 ms waited, 3 bytes read: DATA0 and DATA1, the pressure in 0.1
// kPa, high byte first, signed (two's complement: 0xFEDD is -29.1 kPa), then
// a check byte, DATA0 XOR DATA1. AGR: positive gauge pressure, AGN: vacuum,
// AGP: both (0-40 kPa to 0-1000 kPa; -40/-100 kPa; +-40/+-100 kPa); dry,
// non-corrosive gas only; the die is light-sensitive (manual, notes).
//
// The bus at 30 kHz at most (the manual: "通信速率最大为30kHz"): the CH341's
// and CH347's 20 kHz, dart's 30 kHz or under.
//
// No identify(): nothing tells it from an AT24C EEPROM at 0x50 without the
// measurement command, and that command is a write of 0x12 at 0xAC to an
// 8-bit-address EEPROM (the AT24C01-16). Read alone, the AGR12 answers 0xFF
// (r8845's AGP12, 2026-11-14), as an erased EEPROM does. So it's never
// looked for; a page or a bench names it.
//
// r8845's AGP12 (+-40 kPa, on the CH347F at 20 kHz, 2026-11-14): 0.0 or
// -0.1 kPa open to the room, the check good. A result reads once: a second
// read gives 0xFF 0xFF 0xFF (8 of 8). It was ready as soon as it could be
// read (5-8 ms after the command, 24 of 24 up to 68 ms): the manual's 80 ms
// kept, the bound it gives. Once, the first measurement of a board run read
// 0xFF 0xFF 0xFF after 80 ms; not seen again (unexplained).

const MEASURE = [0xac, 0x12];
export const MEASURE_MS = 80; // the manual, 7.2.1: "等待80ms"
const COUNTS_PER_KPA = 10; // the manual, 7.2.2: the pressure x 10, in kPa
export const MAX_SCL_HZ = 30000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Agr12 {
  static chip = {
    name: 'AGR12',
    maxSclHz: MAX_SCL_HZ,
  };

  constructor(bus, address = 0x50) {
    this.bus = bus;
    this.address = address;
  }

  // one measurement's raw count, signed, its check byte checked: an all-0xFF
  // answer (nothing measured: a read too soon, or not an AGR12) fails it
  async raw() {
    await this.bus.write(this.address, MEASURE);
    await delay(MEASURE_MS);
    const [d0, d1, check] = await this.bus.read(this.address, 3);
    if ((d0 ^ d1) !== check) {
      throw new Error(`AGR12 check: 0x${check.toString(16)} for 0x${d0.toString(16)} 0x${d1.toString(16)} (their XOR 0x${(d0 ^ d1).toString(16)})`);
    }
    return (((d0 << 8) | d1) << 16) >> 16;
  }

  // the gauge pressure, kPa (0.1 kPa steps; negative below the room's)
  async pressure() {
    return (await this.raw()) / COUNTS_PER_KPA;
  }

  // { pressure: kPa }, as the other sensors' measure()
  async measure() {
    return { pressure: await this.pressure() };
  }
}

Agr12.addresses = [0x50];

export default Agr12;
