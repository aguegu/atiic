// Analog Devices' ADXL345: a 3-axis accelerometer, at 0x53 (SDO/ALT ADDRESS
// grounded) or 0x1D. Adapter-free: any I2C bus with write(address, bytes)
// and writeRead(address, bytes, n).
//
// Per its datasheet (Rev. G, docs/adxl345.pdf): full resolution at +/-16 g
// (DATA_FORMAT 0x0B: 256 LSb/g at every range, the set-up its "Using
// Self-Test" recommends), 100 Hz (BW_RATE 0x0A, the default, normal power),
// then measurement mode (POWER_CTL 0x08; it powers up in standby). Data
// 0x32-0x37: X, Y, Z, each low byte first, two's complement, read in one
// block (as the datasheet recommends). DEVID 0x00 reads 0xE5.
//
// selfTest() is "Using Self-Test": 10 samples averaged (0.1 s at 100 Hz),
// SELF_TEST set, 4 samples to settle, 10 more averaged, the change against
// Table 15's limits (+/-2 g or full resolution, at VS 2.5 V) scaled by
// Table 14's factor for the supply (the force goes with VS squared).

const REG_DEVID = 0x00;
const REG_BW_RATE = 0x2c;
const REG_POWER_CTL = 0x2d;
const REG_DATA_FORMAT = 0x31;
const REG_DATAX0 = 0x32;
const DEVID = 0xe5;
const RATE_100HZ = 0x0a;
const POWER_STANDBY = 0x00;
const POWER_MEASURE = 0x08;
const FORMAT_FULL_RES_16G = 0x0b; // FULL_RES, right-justified, range 11
const SELF_TEST = 0x80;
const LSB_PER_G = 256; // full resolution, typical (Table 1)
const RATE_HZ = 100;
const SAMPLE_MS = 1000 / RATE_HZ;
const TURN_ON_MS = Math.ceil(SAMPLE_MS + 1.1); // Table 1, note 7: tau + 1.1 ms
const SELF_TEST_SAMPLES = 10;
const SELF_TEST_SETTLE = 4; // "about four samples"
// Table 15 (LSb, VS 2.5 V) and Table 14's scale for other supplies
const SELF_TEST_LIMITS = { x: [50, 540], y: [-540, -50], z: [75, 875] };
const SELF_TEST_SCALE = { 2.0: { xy: 0.64, z: 0.8 }, 2.5: { xy: 1, z: 1 }, 3.3: { xy: 1.77, z: 1.47 }, 3.6: { xy: 2.11, z: 1.69 } };

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the six data bytes as raw x, y, z (LSb)
export function parseData(d) {
  const s16 = (i) => ((d[i] | (d[i + 1] << 8)) << 16) >> 16;
  return { x: s16(0), y: s16(2), z: s16(4) };
}

// Table 15's limits for a supply in Table 14 (2.0, 2.5, 3.3 or 3.6 V)
export function selfTestLimits(supplyV) {
  const s = SELF_TEST_SCALE[supplyV];
  if (!s) throw new Error(`ADXL345 self test: no Table 14 factor for ${supplyV} V (2.0, 2.5, 3.3, 3.6)`);
  const scale = (k, f) => SELF_TEST_LIMITS[k].map((v) => v * f);
  return { x: scale('x', s.xy), y: scale('y', s.xy), z: scale('z', s.z) };
}

class Adxl345 {
  static chip = { name: 'ADXL345', idRegister: REG_DEVID, whoAmI: DEVID };

  constructor(bus, address = 0x53) {
    this.bus = bus;
    this.address = address;
  }

  async raw() {
    return parseData(await this.bus.writeRead(this.address, [REG_DATAX0], 6));
  }

  // full resolution, +/-16 g, 100 Hz, measuring; its first sample waited for
  async init() {
    const [id] = await this.bus.writeRead(this.address, [REG_DEVID], 1);
    if (id !== DEVID) throw new Error(`no ADXL345 at 0x${this.address.toString(16)} (DEVID 0x${id.toString(16)})`);
    await this.bus.write(this.address, [REG_POWER_CTL, POWER_STANDBY]);
    await this.bus.write(this.address, [REG_DATA_FORMAT, FORMAT_FULL_RES_16G]);
    await this.bus.write(this.address, [REG_BW_RATE, RATE_100HZ]);
    await this.bus.write(this.address, [REG_POWER_CTL, POWER_MEASURE]);
    await delay(TURN_ON_MS);
  }

  // the latest sample, g
  async measure() {
    const r = await this.raw();
    return { accelerometers: { x: r.x / LSB_PER_G, y: r.y / LSB_PER_G, z: r.z / LSB_PER_G } };
  }

  // n samples a sample period apart, averaged (LSb)
  async average(n) {
    const sum = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      await delay(SAMPLE_MS);
      const r = await this.raw();
      for (const k in sum) sum[k] += r[k];
    }
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
  }

  // the datasheet's self test, held still: the change in LSb on each axis,
  // the limits for the supply, and whether every axis is inside them
  async selfTest({ supplyV = 3.3 } = {}) {
    const limits = selfTestLimits(supplyV);
    const off = await this.average(SELF_TEST_SAMPLES);
    await this.bus.write(this.address, [REG_DATA_FORMAT, FORMAT_FULL_RES_16G | SELF_TEST]);
    try {
      await delay(SELF_TEST_SETTLE * SAMPLE_MS);
      const on = await this.average(SELF_TEST_SAMPLES);
      const change = { x: on.x - off.x, y: on.y - off.y, z: on.z - off.z };
      const pass = Object.keys(change).every((k) => change[k] >= limits[k][0] && change[k] <= limits[k][1]);
      return { change, limits, pass };
    } finally {
      await this.bus.write(this.address, [REG_DATA_FORMAT, FORMAT_FULL_RES_16G]);
      await delay(SELF_TEST_SETTLE * SAMPLE_MS);
    }
  }

  // standby: measuring stops (init() starts it again)
  async sleep() {
    await this.bus.write(this.address, [REG_POWER_CTL, POWER_STANDBY]);
  }
}

Adxl345.addresses = [0x53, 0x1d];

export default Adxl345;
