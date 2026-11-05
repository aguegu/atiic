// Honeywell's HMC5883L: a 3-axis magnetometer (a compass), at 0x1E.
// Adapter-free: any I2C bus with write(address, bytes) and
// writeRead(address, bytes, n).
//
// Per its datasheet (Form #900405 Rev E, docs/HMC5883L.pdf): set up as its
// "continuous-measurement mode" example (CRA 0x70: 8 samples averaged, 15 Hz,
// normal measurement; the mode register 0x00), at the default gain (CRB
// 0x20: 1090 LSb/gauss, +/-1.3 Ga, Table 9: Earth's field is 0.25-0.65 Ga).
// The data registers 0x03-0x08 hold X, Z, Y (that order), each MSB first,
// two's complement, -2048..2047; -4096 when the axis overflowed (null
// here). All six are read at once: a partial read locks them (LOCK, SR1).
// Its ID registers 0x0A-0x0C read "H43", how a bench knows it.
//
// selfTest() follows the datasheet's "positive self test" at gain 5 (CRB
// 0xA0, 390 LSb/gauss): an internal ~1.1 Ga field on all three axes, the
// external field subtracted, each axis 243-575 LSb (and -575..-243 with the
// negative bias); the normal set-up is written back after.

const REG_CRA = 0x00;
const REG_MODE = 0x02;
const REG_DATA = 0x03; // X MSB, X LSB, Z MSB, Z LSB, Y MSB, Y LSB
const REG_ID = 0x0a;
const ID = [0x48, 0x34, 0x33]; // "H43"
const CRA_NORMAL = 0x70; // 8-average, 15 Hz, normal measurement
const CRA_POSITIVE_BIAS = 0x71;
const CRA_NEGATIVE_BIAS = 0x72;
const CRB_GAIN_1 = 0x20; // the default: 1090 LSb/gauss
const CRB_GAIN_5 = 0xa0; // the self test's: 390 LSb/gauss
const MODE_CONTINUOUS = 0x00;
const MODE_IDLE = 0x02;
const OVERFLOW = -4096;
const LSB_PER_GAUSS = 1090; // gain 1, Table 9
const UT_PER_GAUSS = 100;
const RATE_HZ = 15; // CRA's DO bits 100 (Table 5)
// "the first measurement set is available ... after a period of 2/fDO" (Table 12)
const FIRST_MS = Math.ceil((2 * 1000) / RATE_HZ);
const PERIOD_MS = Math.ceil(1000 / RATE_HZ);
const SELF_TEST_MIN = 243; // gain 5, the specification table
const SELF_TEST_MAX = 575;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the six data bytes (X, Z, Y, MSB first) as raw x, y, z; null for an axis
// that overflowed
export function parseData(d) {
  const s16 = (i) => (((d[i] << 8) | d[i + 1]) << 16) >> 16;
  const axis = (i) => (s16(i) === OVERFLOW ? null : s16(i));
  return { x: axis(0), y: axis(4), z: axis(2) };
}

class Hmc5883l {
  static chip = {
    name: 'HMC5883L',
    // its ID registers A-C: "H43"
    async identify(bus, address) {
      const id = await bus.writeRead(address, [REG_ID], 3);
      return ID.every((b, i) => id[i] === b);
    },
  };

  constructor(bus, address = 0x1e) {
    this.bus = bus;
    this.address = address;
  }

  async writeRegs(cra, crb, mode) {
    await this.bus.write(this.address, [REG_CRA, cra, crb, mode]); // the pointer moves on by itself
  }

  async raw() {
    return parseData(await this.bus.writeRead(this.address, [REG_DATA], 6));
  }

  // continuous measurement, 15 Hz, gain 1; the first set waited for
  async init() {
    if (!(await Hmc5883l.chip.identify(this.bus, this.address))) throw new Error(`no HMC5883L at 0x${this.address.toString(16)} (its ID isn't "H43")`);
    await this.writeRegs(CRA_NORMAL, CRB_GAIN_1, MODE_CONTINUOUS);
    await delay(FIRST_MS);
  }

  // the latest field, microtesla (null for an axis that overflowed)
  async measure() {
    const r = await this.raw();
    const ut = (v) => (v === null ? null : (v * UT_PER_GAUSS) / LSB_PER_GAUSS);
    return { magnetometers: { x: ut(r.x), y: ut(r.y), z: ut(r.z) } };
  }

  // one bias's reading at gain 5: the first set after the change skipped
  // (it keeps the previous gain, Table 9's note)
  async biased(cra) {
    await this.writeRegs(cra, CRB_GAIN_5, MODE_CONTINUOUS);
    await delay(FIRST_MS);
    await this.raw();
    await delay(PERIOD_MS * 2);
    return this.raw();
  }

  // the datasheet's self test, both biases; init()'s set-up back after
  async selfTest() {
    try {
      const positive = await this.biased(CRA_POSITIVE_BIAS);
      const negative = await this.biased(CRA_NEGATIVE_BIAS);
      const axes = ['x', 'y', 'z'];
      const pass = axes.every((k) => positive[k] >= SELF_TEST_MIN && positive[k] <= SELF_TEST_MAX
        && negative[k] <= -SELF_TEST_MIN && negative[k] >= -SELF_TEST_MAX);
      return { positive, negative, pass };
    } finally {
      await this.writeRegs(CRA_NORMAL, CRB_GAIN_1, MODE_CONTINUOUS);
      await delay(FIRST_MS * 2); // the first set after a gain change keeps the old gain
    }
  }

  // idle: the ADC and the sensor's bias off (init() wakes it)
  async sleep() {
    await this.bus.write(this.address, [REG_MODE, MODE_IDLE]);
  }
}

Hmc5883l.addresses = [0x1e];

export default Hmc5883l;
