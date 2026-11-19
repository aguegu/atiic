// Sensylink's CHT8305C: relative humidity and temperature, at 0x40, 0x44,
// 0x48 or 0x4C by its AD0 pin (GND or open, Vcc, SDA, SCL; 1.5.1 Table 7),
// an ALERT pin for high limits. Adapter-free: any I2C bus with
// write(address, bytes), read(address, n) and writeRead(address, bytes, n).
// Registers 16 bits, MSB first, by a pointer.
//
// Per its datasheet (Rev. 2.5, October 2021, docs/): temperature 0x00,
// humidity 0x01, configuration 0x02 (Table 4: SRST 15, CLKSTR 14, Heater 13,
// bit 12 reserved and 1, Vccs 11, T_RES 10, H_RES 9:8, ALTM 7:6, APS 5, HALT
// 4, TALT 3; bit 2 never written 1), the high limits 0x03, the manufacturer
// 0xFE (0x5959) and the identification 0xFF (0x8XXX; ours 0x8305): how a
// bench knows it (chip.identify). A measurement (1.4): the pointer written to
// 0x00, the conversion waited (the address NACKed until it's done), both
// read in one go, 4 bytes, T first:
//   T = 165 S / (2^16 - 1) - 40 (C),  RH = 100 S / (2^16 - 1) (%)
// No checksum, no serial number. The wait: its example code's ("delay time
// must greater than 20ms", 1.4.5), at every resolution (the 14-bit typical
// 11 ms is the only time given). The high limits (1.1.4): humidity the top 7
// bits of an RH reading's code, temperature the top 9 of a T reading's; the
// ALERT pin and HALT/TALT set at or over them, after each measurement. The
// soft reset (1.2): SRST written, bit 15 reads 0 again when done. At most
// one measurement a second against self-heating (2): periodMs().
// Measured on Dart-8346 at 100 kHz: ready after 9.4-9.9 ms at 14/14 bits,
// 5.1-5.5 at 11/11, 4.3-4.9 at 11/8 (polled); a reset done within 0.9 ms;
// 22.0 C, 61.1 %.

const REG_TEMPERATURE = 0x00;
const REG_CONFIG = 0x02;
const REG_LIMITS = 0x03;
const REG_MANUFACTURER = 0xfe;
const REG_ID = 0xff;
const SENSYLINK = 0x5959;
const ID_MASK = 0xf000;
const ID_FAMILY = 0x8000; // 0x8XXX
const SRST = 0x8000;
const HEATER = 0x2000;
const RESERVED_12 = 0x1000; // its default 1, kept
const VCCS = 0x0800;
const T_RES_11 = 0x0400;
const H_RES = { 14: 0x0000, 11: 0x0100, 8: 0x0200 };
const T_RESOLUTIONS = [14, 11];
// ALTM (bits 7:6): what drives ALERT low
export const ALERT_MODES = { either: 0x00, temperature: 0x40, humidity: 0x80, both: 0xc0 };
const APS = 0x0020;
const HALT = 0x0010;
const TALT = 0x0008;
const CONVERSION_MS = 20; // 1.4.5: "must greater than 20ms"
const RESET_TRIES = 20; // the configuration read back until SRST clears
const PERIOD_MS = 1000; // 2: at most one measurement (H + T) a second
const FULL_SCALE = 65535;
const LIMIT_RH_BITS = 7;
const LIMIT_T_BITS = 9;

// a value's 16-bit reading code (the formulas turned round), clamped
const codeOf = (v) => Math.max(0, Math.min(FULL_SCALE, Math.round(v)));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cht8305 {
  static chip = {
    name: 'CHT8305C',
    // Sensylink's manufacturer ID and an 0x8XXX identification
    async identify(bus, address) {
      try {
        const [mh, ml] = await bus.writeRead(address, [REG_MANUFACTURER], 2);
        const [ih, il] = await bus.writeRead(address, [REG_ID], 2);
        return ((mh << 8) | ml) === SENSYLINK && (((ih << 8) | il) & ID_MASK) === ID_FAMILY;
      } catch {
        return false;
      }
    },
  };

  constructor(bus, address = 0x40) {
    this.bus = bus;
    this.address = address;
    this.resolution = { temperature: 14, humidity: 14 };
    this.heater = false;
    this.alertMode = 'either';
  }

  async writeConfig() {
    const r = this.resolution;
    const c = RESERVED_12 | (this.heater ? HEATER : 0) | (r.temperature === 11 ? T_RES_11 : 0) | H_RES[r.humidity] | ALERT_MODES[this.alertMode];
    await this.bus.write(this.address, [REG_CONFIG, c >> 8, c & 0xff]);
  }

  // the configuration register (Table 4)
  async config() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_CONFIG], 2);
    return (h << 8) | l;
  }

  // a soft reset: every register its default (14 bits each, the heater off,
  // the limits 80 % and 60 C)
  async init() {
    await this.bus.write(this.address, [REG_CONFIG, SRST >> 8, SRST & 0xff]);
    for (let i = 0; i < RESET_TRIES; i++) {
      try {
        if (!((await this.config()) & SRST)) break;
      } catch {
        // busy resetting: asked again
      }
      await delay(1);
    }
    this.resolution = { temperature: 14, humidity: 14 };
    this.heater = false;
    this.alertMode = 'either';
  }

  // { temperature: 14 or 11, humidity: 14, 11 or 8 } bits
  async setResolution({ temperature = this.resolution.temperature, humidity = this.resolution.humidity } = {}) {
    if (!T_RESOLUTIONS.includes(temperature)) throw new Error(`CHT8305C: no temperature resolution ${temperature}: 14, 11`);
    if (H_RES[humidity] === undefined) throw new Error(`CHT8305C: no humidity resolution ${humidity}: 14, 11, 8`);
    this.resolution = { temperature, humidity };
    await this.writeConfig();
  }

  async setHeater(on) {
    this.heater = Boolean(on);
    await this.writeConfig();
  }

  // the supply under 2.8 V (Vccs)
  async lowBattery() {
    return Boolean((await this.config()) & VCCS);
  }

  // the high limits, { humidity: %, temperature: C }, as stored (0.78 % and
  // 0.32 C steps)
  async alertLimits() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_LIMITS], 2);
    const v = (h << 8) | l;
    const rh = (v >> LIMIT_T_BITS) << (16 - LIMIT_RH_BITS);
    const t = (v & ((1 << LIMIT_T_BITS) - 1)) << (16 - LIMIT_T_BITS);
    return { humidity: (100 * rh) / FULL_SCALE, temperature: (165 * t) / FULL_SCALE - 40 };
  }

  // set the high limits (either kept if not given), and which drives ALERT:
  // mode 'either', 'temperature', 'humidity' or 'both'
  async setAlert({ humidity, temperature, mode = this.alertMode } = {}) {
    if (ALERT_MODES[mode] === undefined) throw new Error(`CHT8305C: no alert mode ${mode}: ${Object.keys(ALERT_MODES).join(', ')}`);
    const now = await this.alertLimits();
    const rh = codeOf(((humidity ?? now.humidity) * FULL_SCALE) / 100) >> (16 - LIMIT_RH_BITS);
    const t = codeOf((((temperature ?? now.temperature) + 40) * FULL_SCALE) / 165) >> (16 - LIMIT_T_BITS);
    const v = (rh << LIMIT_T_BITS) | t;
    await this.bus.write(this.address, [REG_LIMITS, v >> 8, v & 0xff]);
    this.alertMode = mode;
    await this.writeConfig();
  }

  // after a measurement: { pending (APS), humidity (HALT), temperature (TALT) }
  async alertStatus() {
    const c = await this.config();
    return { pending: Boolean(c & APS), humidity: Boolean(c & HALT), temperature: Boolean(c & TALT) };
  }

  // the shortest period between measure()s the datasheet advises, ms
  periodMs() {
    return PERIOD_MS;
  }

  // { temperature: C, humidity: % }: both, temperature first
  async measure() {
    await this.bus.write(this.address, [REG_TEMPERATURE]);
    await delay(CONVERSION_MS);
    const d = await this.bus.read(this.address, 4);
    return {
      temperature: (165 * ((d[0] << 8) | d[1])) / FULL_SCALE - 40,
      humidity: (100 * ((d[2] << 8) | d[3])) / FULL_SCALE,
    };
  }
}

Cht8305.addresses = [0x40, 0x44, 0x48, 0x4c];
Cht8305.ALERT_MODES = ALERT_MODES;

export default Cht8305;
