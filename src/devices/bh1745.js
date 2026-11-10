// ROHM's BH1745NUC: a colour sensor, red, green, blue and clear light as
// 16-bit counts, at 0x38 (ADDR low) or 0x39 (ADDR high). Adapter-free: any
// I2C bus with write(address, bytes) and writeRead(address, bytes, n).
//
// Per its datasheet (Rev.002, 23 May 2016): SYSTEM_CONTROL (40h) bits 5:0
// the part ID 0x0B, MANUFACTURER ID (92h) 0xE0; MODE_CONTROL1 (41h) the
// measurement time (160 ms to 5120 ms), MODE_CONTROL2 (42h) RGBC_EN (bit 4),
// the gain (1x, 2x, 16x) and VALID (bit 7: the data updated since the last
// write of 41h-44h or read of 42h), MODE_CONTROL3 (44h) to be written 02h;
// the data at 50h-57h, red, green, blue, clear, low byte first. A software
// reset (40h bit 7) resets every register and powers it down. Up to 400 kHz.
//
// Counts, not lux: the datasheet plots the illuminance and the colour
// temperature calculated from RGBC but gives no formula (ROHM's application
// note does; not read here). Its electrical table gives typical counts at
// 16x, 160 ms, under LEDs at 20 uW/cm2: red 4000 (a red LED), green 3350
// and clear 160 (a green LED), blue 2370 (a blue LED).

const ADDRESS = 0x38;
const REG_SYSTEM_CONTROL = 0x40;
const REG_MODE_CONTROL1 = 0x41;
const REG_MODE_CONTROL2 = 0x42;
const REG_MODE_CONTROL3 = 0x44;
const REG_RED_LSB = 0x50; // red, green, blue, clear: 8 bytes, low byte first
const REG_MANUFACTURER_ID = 0x92;
const PART_ID = 0x0b;
const PART_ID_MASK = 0x3f;
const MANUFACTURER_ID = 0xe0;
const SW_RESET = 0x80;
const RGBC_EN = 0x10;
const VALID = 0x80;
const MODE_CONTROL3_VALUE = 0x02; // the datasheet: "Write 02h."
const DATA_BYTES = 8;
// MODE_CONTROL1's measurement time codes, ms
const TIMES_MS = { 160: 0, 320: 1, 640: 2, 1280: 3, 2560: 4, 5120: 5 };
// MODE_CONTROL2's gain codes
const GAINS = { 1: 0, 2: 1, 16: 2 };
// a measurement's update period: up to 225 ms at 160 ms (TINT's max), so
// the time's 1.41 and a margin; VALID polled
const READY_FACTOR = 2;
const POLL_MS = 10;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bh1745 {
  static chip = {
    name: 'BH1745NUC',
    // its part ID (40h bits 5:0) and ROHM's manufacturer ID (92h)
    async identify(bus, address) {
      const [s] = await bus.writeRead(address, [REG_SYSTEM_CONTROL], 1);
      if ((s & PART_ID_MASK) !== PART_ID) return false;
      const [m] = await bus.writeRead(address, [REG_MANUFACTURER_ID], 1);
      return m === MANUFACTURER_ID;
    },
  };

  constructor(bus, address = ADDRESS) {
    this.bus = bus;
    this.address = address;
  }

  // reset, then measuring: timeMs (160, 320, 640, 1280, 2560, 5120), gain (1,
  // 2, 16)
  async init({ timeMs = 160, gain = 1 } = {}) {
    if (!(await Bh1745.chip.identify(this.bus, this.address))) throw new Error('not a BH1745NUC: part or manufacturer ID');
    await this.bus.write(this.address, [REG_SYSTEM_CONTROL, SW_RESET]);
    await this.configure({ timeMs, gain });
  }

  // the measurement time and gain; the measurement restarts
  async configure({ timeMs = 160, gain = 1 } = {}) {
    if (TIMES_MS[timeMs] === undefined) throw new Error(`BH1745NUC: no ${timeMs} ms: ${Object.keys(TIMES_MS).join(', ')}`);
    if (GAINS[gain] === undefined) throw new Error(`BH1745NUC: no gain ${gain}: ${Object.keys(GAINS).join(', ')}`);
    await this.bus.write(this.address, [REG_MODE_CONTROL1, TIMES_MS[timeMs], RGBC_EN | GAINS[gain]]);
    await this.bus.write(this.address, [REG_MODE_CONTROL3, MODE_CONTROL3_VALUE]);
    Object.assign(this, { timeMs, gain });
  }

  // the next measurement: { red, green, blue, clear } counts, its gain and
  // time
  async measure() {
    const limit = this.timeMs * READY_FACTOR;
    const t0 = Date.now();
    for (;;) {
      const [m] = await this.bus.writeRead(this.address, [REG_MODE_CONTROL2], 1);
      if (m & VALID) break;
      if (Date.now() - t0 > limit) throw new Error(`BH1745NUC: no measurement in ${limit} ms`);
      await delay(POLL_MS);
    }
    const d = await this.bus.writeRead(this.address, [REG_RED_LSB], DATA_BYTES);
    const u16 = (i) => d[i] | (d[i + 1] << 8);
    return { red: u16(0), green: u16(2), blue: u16(4), clear: u16(6), gain: this.gain, timeMs: this.timeMs };
  }

  // measuring stopped (RGBC_EN off)
  async sleep() {
    await this.bus.write(this.address, [REG_MODE_CONTROL2, GAINS[this.gain ?? 1]]);
  }
}

Bh1745.addresses = [0x38, 0x39];

export default Bh1745;
