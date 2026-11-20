// QST's QMC5883L: a 3-axis magnetometer (a compass), at 0x0D; what many
// "GY-271 / HMC5883L" modules carry now. Adapter-free: any I2C bus with
// write(address, bytes) and writeRead(address, bytes, n).
//
// Per its datasheet (QST-PD-B002-22 Rev. B, docs/QMC5883L-RevB.pdf; not the
// QMC5883P's, a different chip at 0x2C, docs/QMC5883P-RevE.pdf): X, Y, Z at
// 0x00-0x05, each LSB first, two's complement, saturating at -32768 and
// 32767 (null here, OVL set); status 0x06 (DRDY, OVL, DOR); a relative
// temperature at 0x07-0x08 (about 100 LSB/C, its offset not calibrated);
// control 1 at 0x09 (OSR, RNG, ODR, MODE), control 2 at 0x0A (SOFT_RST,
// ROL_PNT, INT_ENB), the set/reset period at 0x0B (its examples: 0x01). Set
// up as its continuous-mode example (7.1: 0x0B = 0x01, then OSR 512, the
// range, the rate, continuous), here at 50 Hz: ±8 G (3000 LSB/G) by default,
// or ±2 G (12000 LSB/G) for more resolution. All seven bytes read at once:
// a read of any data register locks them until 0x05 is read (6.2.1).
// Its only ID: register 0x0D reads 0xFF (Table 12) - a weak one, as an
// absent register often reads 0xFF too; no other chip here sits at 0x0D.
const REG_DATA = 0x00; // X, Y, Z LSB first, then status 0x06
const REG_TEMPERATURE = 0x07;
const REG_CONTROL1 = 0x09;
const REG_CONTROL2 = 0x0a;
const REG_PERIOD = 0x0b;
const REG_ID = 0x0d;
const ID = 0xff;
const SOFT_RST = 0x80;
const PERIOD = 0x01; // 7.1's set/reset period
const MODE_STANDBY = 0x00;
const MODE_CONTINUOUS = 0x01;
const OSR_512 = 0x00;
const DRDY = 0x01;
const OVL = 0x02;
// RNG: its bits (Table 16) and its sensitivity (Table 2)
export const RANGES = { '2G': { bits: 0x00, lsbPerGauss: 12000 }, '8G': { bits: 0x10, lsbPerGauss: 3000 } };
// ODR: its bits (Table 16)
export const RATES = { 10: 0x00, 50: 0x04, 100: 0x08, 200: 0x0c };
const UT_PER_GAUSS = 100;
const LSB_PER_C = 100; // its temperature sensor (Table 2)
const POR_MS = 1; // POR completion, 350 us (Table 3), after a soft reset too
const SATURATED = [-32768, 32767];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const s16 = (d, i) => ((d[i + 1] << 8 | d[i]) << 16) >> 16;

// the seven bytes (X, Y, Z LSB first; status) as raw x, y, z, null for an
// axis at its saturation; the status's flags
export function parseData(d) {
  const axis = (i) => (SATURATED.includes(s16(d, i)) ? null : s16(d, i));
  return { x: axis(0), y: axis(2), z: axis(4), ready: Boolean(d[6] & DRDY), overflow: Boolean(d[6] & OVL) };
}

class Qmc5883l {
  static chip = {
    name: 'QMC5883L',
    // its chip ID register 0x0D: 0xFF
    async identify(bus, address) {
      try {
        const [id] = await bus.writeRead(address, [REG_ID], 1);
        return id === ID;
      } catch {
        return false;
      }
    },
  };

  // range: '8G' (the default) or '2G'; rate: 10, 50 (the default), 100 or 200 Hz
  constructor(bus, address = 0x0d, { range = '8G', rate = 50 } = {}) {
    if (!RANGES[range]) throw new Error(`QMC5883L: no range ${range}: ${Object.keys(RANGES).join(', ')}`);
    if (RATES[rate] === undefined) throw new Error(`QMC5883L: no rate ${rate} Hz: ${Object.keys(RATES).join(', ')}`);
    this.bus = bus;
    this.address = address;
    this.range = range;
    this.rate = rate;
  }

  // a soft reset, then continuous measurement; the first set waited for by
  // its DRDY (7.2), at most a few periods
  async init() {
    await this.bus.write(this.address, [REG_CONTROL2, SOFT_RST]);
    await delay(POR_MS);
    await this.bus.write(this.address, [REG_PERIOD, PERIOD]);
    await this.bus.write(this.address, [REG_CONTROL1, OSR_512 | RANGES[this.range].bits | RATES[this.rate] | MODE_CONTINUOUS]);
    const periodMs = 1000 / this.rate;
    for (let i = 0; i < 4; i++) {
      await delay(periodMs);
      const [status] = await this.bus.writeRead(this.address, [0x06], 1);
      if (status & DRDY) return;
    }
    throw new Error(`QMC5883L at 0x${this.address.toString(16)}: no data ready after ${4 * periodMs} ms`);
  }

  async raw() {
    return parseData(await this.bus.writeRead(this.address, [REG_DATA], 7));
  }

  // the latest field, microtesla (null for an axis at its saturation)
  async measure() {
    const r = await this.raw();
    const k = UT_PER_GAUSS / RANGES[this.range].lsbPerGauss;
    const ut = (v) => (v === null ? null : v * k);
    return { magnetometers: { x: ut(r.x), y: ut(r.y), z: ut(r.z) } };
  }

  // its temperature, relative: C from an uncalibrated zero (only its changes mean anything)
  async temperature() {
    const d = await this.bus.writeRead(this.address, [REG_TEMPERATURE], 2);
    return s16(d, 0) / LSB_PER_C;
  }

  // standby: no measurement (init() starts it again)
  async sleep() {
    await this.bus.write(this.address, [REG_CONTROL1, MODE_STANDBY]);
  }
}

Qmc5883l.addresses = [0x0d];
Qmc5883l.RANGES = RANGES;
Qmc5883l.RATES = RATES;

export default Qmc5883l;
