// ST's VL6180X: proximity by time of flight (0 to 100 mm, its datasheet's
// specified range) and ambient light (lux), at 0x29. Adapter-free: any I2C bus
// with write(address, bytes) and writeRead(address, bytes, n). Registers at
// 16-bit addresses, MSB first; multi-byte registers MSB first too.
//
// Per its datasheet (DocID026171 Rev 7, docs/VL6180X-DocID026171-Rev7.pdf):
// MODEL_ID 0xB4 at 0x000 (how a bench knows it); SYSTEM__FRESH_OUT_OF_RESET
// 0x016, 1 after a power-up or a GPIO0 (SHDN) toggle; SYSRANGE__START 0x018
// and SYSALS__START 0x038 (bit 0: one measurement); SYSALS__ANALOGUE_GAIN
// 0x03F (bits 2-0: 20, 10, 5, 2.5, 1.67, 1.25, 1, 40; the upper nibble 4);
// SYSALS__INTEGRATION_PERIOD 0x040, 16 bits, 1 ms a code (0 = 1 ms);
// RESULT__RANGE_STATUS 0x04D (bits 7-4 its error code);
// RESULT__INTERRUPT_STATUS_GPIO 0x04F (bits 2-0 range, 5-3 ALS: 4 a new
// sample); RESULT__ALS_VAL 0x050, 16 bits; RESULT__RANGE_VAL 0x062, mm;
// SYSTEM__INTERRUPT_CLEAR 0x015 (7: all). Lux (2.10.4): 0.32 lux a count x
// count / gain x 100 ms / the integration (factory calibrated, without glass).
// The datasheet leaves its start-up to ST's API; the settings it loads are in
// ST's application note AN4545 (DocID026571 Rev 1, docs/VL6180X-AN4545-
// Rev1.pdf), section 9, "SR03 settings": 30 private registers (MANDATORY
// below), then recommended public ones, loaded when FRESH_OUT_OF_RESET is 1,
// which is then cleared (its example code). One departure: AN4545 Rev 1
// writes the ALS integration as one byte, 0x63 at 0x040, the high half of a
// 16-bit register by the datasheet (and ST's later revision is said to move
// it to 0x041); written here as 0x0063 from 0x040. And one it calls optional
// is needed by its own polling: SYSTEM__INTERRUPT_CONFIG_GPIO 0x014 resets to
// 0, disabled, and the status at 0x04F then never shows a new sample (ours:
// no range in 200 ms without it): 0x24, both on new sample, set always.
// At 0x29 sit the VL53L1X and the TCS3472 too: this one's check writes a
// 16-bit register address, whose first byte a TCS3472 would take as a
// command, so a bench asks the TCS3472 first.
// On ours (the black board, VIN, 2v8, GND, GPIO, SHDN, SCL, SDA): model
// revision 1.3, module 2.0; fresh out of reset at power-up; ranging 37-41 mm
// to a board above it, 97-98 mm to a phone, about 118 ms a measure(). Its ALS
// reads 0 in every mode (single-shot, continuous) and at every gain, under a
// phone's torch too, with no film over it and no ALS error code: perhaps a
// VL6180 (ranging only, the same MODEL_ID) on a board printed VL6180X; its
// chip carries no marking to tell. With nothing above it, ranges read 255 mm,
// 'max convergence' (not 'no target'): nothing in reach either way.

const REG_MODEL_ID = 0x000;
const REG_FRESH_OUT_OF_RESET = 0x016;
const REG_SYSRANGE_START = 0x018;
const REG_SYSALS_START = 0x038;
const REG_ALS_GAIN = 0x03f;
const REG_ALS_INTEGRATION = 0x040;
const REG_RANGE_STATUS = 0x04d;
const REG_INTERRUPT_STATUS = 0x04f;
const REG_ALS_VAL = 0x050;
const REG_RANGE_VAL = 0x062;
const REG_INTERRUPT_CLEAR = 0x015;
const REG_INTERRUPT_CONFIG = 0x014;
const NEW_SAMPLE_BOTH = (4 << 3) | 4; // ALS and range: a new sample
const MODEL_ID = 0xb4;
const NEW_SAMPLE = 4;
const CLEAR_ALL = 0x07;
const ALS_GAIN_UPPER = 0x40; // "Upper nibble should be set to 0x4"

// AN4545 section 9: mandatory private registers, as given
export const MANDATORY = [
  [0x0207, 0x01], [0x0208, 0x01], [0x0096, 0x00], [0x0097, 0xfd], [0x00e3, 0x00], [0x00e4, 0x04],
  [0x00e5, 0x02], [0x00e6, 0x01], [0x00e7, 0x03], [0x00f5, 0x02], [0x00d9, 0x05], [0x00db, 0xce],
  [0x00dc, 0x03], [0x00dd, 0xf8], [0x009f, 0x00], [0x00a3, 0x3c], [0x00b7, 0x00], [0x00bb, 0x3c],
  [0x00b2, 0x09], [0x00ca, 0x09], [0x0198, 0x01], [0x01b0, 0x17], [0x01ad, 0x00], [0x00ff, 0x05],
  [0x0100, 0x05], [0x0199, 0x05], [0x01a6, 0x1b], [0x01ac, 0x3e], [0x01a7, 0x1f], [0x0030, 0x00],
];
// AN4545 section 9: recommended public registers (the ALS gain and
// integration set by init() from its options instead)
export const RECOMMENDED = [
  [0x0011, 0x10], // GPIO1 polling for a new sample
  [0x010a, 0x30], // the averaging sample period
  [0x0031, 0xff], // range measurements between auto calibrations
  [0x002e, 0x01], // one temperature calibration of the ranging
];
// SYSALS__ANALOGUE_GAIN's codes 0-7
export const ALS_GAINS = [20, 10, 5, 2.5, 1.67, 1.25, 1, 40];
// RESULT__RANGE_STATUS's error codes (bits 7-4): 0 none
export const RANGE_ERRORS = [null, 'VCSEL continuity test', 'VCSEL watchdog test', 'VCSEL watchdog', 'PLL1 lock', 'PLL2 lock', 'early convergence estimate', 'max convergence', 'no target', null, null, 'max signal to noise ratio', 'raw ranging algo underflow', 'raw ranging algo overflow', 'ranging algo underflow', 'ranging algo overflow'];
// the error codes that mean nothing is in reach (7 max convergence: no
// return converged in time; 8 no target)
export const NOTHING_NEAR = ['max convergence', 'no target'];
const LUX_PER_COUNT = 0.32; // at gain 1 and 100 ms
const LUX_AT_MS = 100;
const POLL_MS = 2;
const RANGE_LIMIT_MS = 200; // its convergence 49 ms at most by default (SYSRANGE__MAX_CONVERGENCE_TIME), with room
const ALS_MARGIN_MS = 100; // past the integration

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (reg) => [reg >> 8, reg & 0xff];

class Vl6180x {
  static chip = {
    name: 'VL6180X',
    // MODEL_ID at the 16-bit address 0x000
    async identify(bus, address) {
      try {
        const [id] = await bus.writeRead(address, at(REG_MODEL_ID), 1);
        return id === MODEL_ID;
      } catch {
        return false;
      }
    },
  };

  // alsGain: one of ALS_GAINS (1 by default); alsMs: the ALS integration,
  // 1-512 ms (100 by default: the datasheet's recommendation)
  constructor(bus, address = 0x29, { alsGain = 1, alsMs = 100 } = {}) {
    if (!ALS_GAINS.includes(alsGain)) throw new Error(`VL6180X: no ALS gain ${alsGain}: ${ALS_GAINS.join(', ')}`);
    if (!(Number.isInteger(alsMs) && alsMs >= 1 && alsMs <= 512)) throw new Error(`VL6180X: ALS integration 1-512 ms, not ${alsMs}`);
    Object.assign(this, { bus, address, alsGain, alsMs });
  }

  async read(reg, n = 1) {
    return this.bus.writeRead(this.address, at(reg), n);
  }

  async write(reg, ...bytes) {
    await this.bus.write(this.address, [...at(reg), ...bytes]);
  }

  // AN4545's settings when fresh out of reset (then the flag cleared); the
  // new-sample status, the ALS gain and integration either way. Returns whether it loaded them
  async init() {
    const [fresh] = await this.read(REG_FRESH_OUT_OF_RESET);
    if (fresh & 0x01) {
      for (const [reg, v] of [...MANDATORY, ...RECOMMENDED]) await this.write(reg, v);
      await this.write(REG_FRESH_OUT_OF_RESET, 0x00);
    }
    await this.write(REG_INTERRUPT_CONFIG, NEW_SAMPLE_BOTH);
    await this.write(REG_ALS_GAIN, ALS_GAIN_UPPER | ALS_GAINS.indexOf(this.alsGain));
    await this.write(REG_ALS_INTEGRATION, (this.alsMs - 1) >> 8, (this.alsMs - 1) & 0xff);
    return Boolean(fresh & 0x01);
  }

  // until RESULT__INTERRUPT_STATUS_GPIO shows a new sample at its shift
  async until(shift, limitMs, what) {
    for (let waited = 0; ; waited += POLL_MS) {
      const [s] = await this.read(REG_INTERRUPT_STATUS);
      if (((s >> shift) & 0x07) === NEW_SAMPLE) return;
      if (waited > limitMs) throw new Error(`VL6180X: no ${what} after ${limitMs} ms`);
      await delay(POLL_MS);
    }
  }

  // { mm, error, near }: one range, single-shot; error null, or why its
  // value isn't a distance (RANGE_ERRORS); near: a distance (no error).
  // Nothing in reach reads 'max convergence' or 'no target' (NOTHING_NEAR)
  async range() {
    await this.write(REG_SYSRANGE_START, 0x01);
    await this.until(0, RANGE_LIMIT_MS, 'range');
    const [mm] = await this.read(REG_RANGE_VAL);
    const [status] = await this.read(REG_RANGE_STATUS);
    await this.write(REG_INTERRUPT_CLEAR, CLEAR_ALL);
    const code = status >> 4;
    return { mm, error: code ? (RANGE_ERRORS[code] ?? `error ${code}`) : null, near: !code };
  }

  // { lux, count }: one ALS measurement, single-shot
  async als() {
    await this.write(REG_SYSALS_START, 0x01);
    await this.until(3, this.alsMs + ALS_MARGIN_MS, 'ALS reading');
    const [h, l] = await this.read(REG_ALS_VAL, 2);
    await this.write(REG_INTERRUPT_CLEAR, CLEAR_ALL);
    const count = (h << 8) | l;
    return { lux: (LUX_PER_COUNT * count * LUX_AT_MS) / (this.alsGain * this.alsMs), count };
  }

  // { mm, error, near, lux }: a range, then an ALS measurement
  async measure() {
    const { mm, error, near } = await this.range();
    const { lux } = await this.als();
    return { mm, error, near, lux };
  }
}

Vl6180x.addresses = [0x29];
Vl6180x.ALS_GAINS = ALS_GAINS;
Vl6180x.NOTHING_NEAR = NOTHING_NEAR;

export default Vl6180x;
