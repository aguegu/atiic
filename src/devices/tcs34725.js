// ams's TCS3472 colour sensor, the TCS34725 (its I2C at VDD) and the
// TCS34727 (its I2C at 1.8 V, VIH 1.25 V): clear, red, green and blue light,
// four photodiodes integrated together, an IR-blocking filter on the chip; at
// 0x29. Adapter-free: any I2C bus with write(address, bytes) and
// writeRead(address, bytes, n).
//
// Per its datasheet (TCS3472 DS000390, docs/TCS3472-DS000390.pdf): every
// access starts with a command byte, bit 7 set, bits 6-5 the type (01:
// auto-increment), bits 4-0 the register. ENABLE 0x00 (PON bit 0, AEN bit 1:
// at least 2.4 ms between them, note 2); ATIME 0x01, an integration of
// 2.4 ms x (256 - ATIME), its count up to (256 - ATIME) x 1024, 65535 at
// most; CONTROL 0x0F, AGAIN 1x, 4x, 16x, 60x; ID 0x12 (0x44 the TCS34725,
// 0x4D the TCS34727: how a bench knows it); STATUS 0x13 (AVALID bit 0, an
// integration done); the data at 0x14-0x1B, clear, red, green, blue, each LSB
// first (read in one burst: the low byte holds the high in a shadow). At
// 0x29 the VL53L1X sits too: its check reads a 16-bit register address,
// so this one's is asked first.
// On ours: ID 0x4D, a TCS34727 on the 3.3 V Dart; ENABLE 0x0F and ATIME 0x00
// at power-up, not the datasheet's 0x00 and 0xFF (written here either way);
// a dim room 73 clear, 23 red, 26 green, 26 blue at 101 ms and 4x; clear
// 1119 at 60x (15.3 times: the gains' 15).

const CMD = 0x80;
const AUTO = 0x20;
const REG_ENABLE = 0x00;
const REG_ATIME = 0x01;
const REG_CONTROL = 0x0f;
const REG_ID = 0x12;
const REG_STATUS = 0x13;
const REG_CDATAL = 0x14;
export const IDS = { 0x44: 'TCS34725', 0x4d: 'TCS34727' };
const PON = 0x01;
const AEN = 0x02;
const AVALID = 0x01;
export const GAINS = [1, 4, 16, 60]; // AGAIN 0-3
const STEP_MS = 2.4;
const COUNTS_PER_STEP = 1024;
const FULL = 65535;
const PON_MS = 3; // 2.4 ms at least between PON and AEN
const POLL_MS = 5;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Tcs34725 {
  static chip = {
    name: 'TCS34725 / TCS34727',
    // its ID: 0x44 or 0x4D
    async identify(bus, address) {
      try {
        const [id] = await bus.writeRead(address, [CMD | REG_ID], 1);
        return id in IDS;
      } catch {
        return false;
      }
    },
  };

  // gain: one of GAINS (4 by default); steps: the integration in 2.4 ms
  // steps, 1-256 (42, 101 ms by default: the datasheet's 0xD5)
  constructor(bus, address = 0x29, { gain = 4, steps = 42 } = {}) {
    if (!GAINS.includes(gain)) throw new Error(`TCS3472: no gain ${gain}: ${GAINS.join(', ')}`);
    if (!(Number.isInteger(steps) && steps >= 1 && steps <= 256)) throw new Error(`TCS3472: integration steps 1-256, not ${steps}`);
    Object.assign(this, { bus, address, gain, steps });
  }

  get integrationMs() {
    return this.steps * STEP_MS;
  }

  // the most a channel can count at this integration
  get fullScale() {
    return Math.min(FULL, this.steps * COUNTS_PER_STEP);
  }

  async reg(reg) {
    const [v] = await this.bus.writeRead(this.address, [CMD | reg], 1);
    return v;
  }

  // 'TCS34725' or 'TCS34727', by its ID
  async part() {
    return IDS[await this.reg(REG_ID)] ?? null;
  }

  // powered on, the integration and gain set, integrating; the first
  // integration waited for
  async init() {
    await this.bus.write(this.address, [CMD | REG_ENABLE, PON]);
    await delay(PON_MS);
    await this.bus.write(this.address, [CMD | REG_ATIME, 256 - this.steps]);
    await this.bus.write(this.address, [CMD | REG_CONTROL, GAINS.indexOf(this.gain)]);
    await this.bus.write(this.address, [CMD | REG_ENABLE, PON | AEN]);
    await this.ready();
  }

  // until AVALID: an integration done
  async ready() {
    const limitMs = 2 * this.integrationMs + STEP_MS + POLL_MS;
    for (let waited = 0; !((await this.reg(REG_STATUS)) & AVALID); waited += POLL_MS) {
      if (waited > limitMs) throw new Error(`TCS3472: no integration after ${Math.round(limitMs)} ms`);
      await delay(POLL_MS);
    }
  }

  // { clear, red, green, blue, saturated }: the last integration's counts;
  // saturated: clear at its full scale (lower the gain or the integration)
  async measure() {
    const d = await this.bus.writeRead(this.address, [CMD | AUTO | REG_CDATAL], 8);
    const w = (o) => d[o] | (d[o + 1] << 8);
    const clear = w(0);
    return { clear, red: w(2), green: w(4), blue: w(6), saturated: clear >= this.fullScale };
  }

  // powered down
  async sleep() {
    await this.bus.write(this.address, [CMD | REG_ENABLE, 0]);
  }
}

Tcs34725.addresses = [0x29];
Tcs34725.GAINS = GAINS;

export default Tcs34725;
