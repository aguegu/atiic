// Sensirion's SGP30: a metal-oxide gas sensor that works out air quality on
// the chip: CO2eq (ppm) and TVOC (ppb), from its H2 and ethanol signals and a
// baseline it keeps itself; at 0x58. Adapter-free: any I2C bus with
// write(address, bytes) and read(address, n).
//
// Per its datasheet (Version 1.0, May 2020, docs/SGP30-v1.0.pdf): 16-bit
// commands (Table 10), each data word followed by a CRC-8 (0x31, from 0xFF:
// the SGP40's and SHTs'), each with its longest duration, ms:
//   iaq_init 0x2003 (10), measure_iaq 0x2008 (12: CO2eq, then TVOC),
//   get_iaq_baseline 0x2015 (10: CO2eq, TVOC), set_iaq_baseline 0x201E
//   (10: TVOC first, then CO2eq), set_absolute_humidity 0x2061 (10: g/m3 in
//   8.8 fixed point, 0 turns it off), measure_test 0x2032 (220: 0xD400
//   passed; before iaq_init only), get_feature_set 0x202F (10: bits 15-12
//   the product type, 0 the SGP30), measure_raw 0x2050 (25: H2, then
//   ethanol), get_serial_id 0x3682 (0.5, tIDLE: three words, 48 bits).
// After iaq_init, measure_iaq once a second (its baseline algorithm needs
// that pace); for the first 15 s it answers 400 ppm and 0 ppb. Its baseline
// is worth saving now and then and setting back after a power-up
// (baseline(), setBaseline()). No command stops it: only a power-down or the
// I2C general-call reset (0x00 0x06), which resets every chip on the bus
// that takes it; not sent here. No ID register: its feature set, read with a
// good CRC and product type 0, is how a bench knows it.
// On ours: serial 0x00000288867b, feature set 0x0022, its self test
// passed; 400 ppm and 0 ppb for 16 s, then 405 and 5 by the twentieth; raw
// H2 8666 and ethanol 13848 at the first second, about 11700 and 15900 by
// the twentieth.

const ADDRESS = 0x58;
const IAQ_INIT = [0x20, 0x03];
const MEASURE_IAQ = [0x20, 0x08];
const GET_BASELINE = [0x20, 0x15];
const SET_BASELINE = [0x20, 0x1e];
const SET_HUMIDITY = [0x20, 0x61];
const MEASURE_TEST = [0x20, 0x32];
const FEATURE_SET = [0x20, 0x2f];
const MEASURE_RAW = [0x20, 0x50];
const SERIAL = [0x36, 0x82];
// Table 10's longest durations, ms; tIDLE for the serial
const MS = { init: 10, iaq: 12, baseline: 10, humidity: 10, test: 220, feature: 10, raw: 25, serial: 1 };
const TEST_PASSED = 0xd400;
const PRODUCT_SHIFT = 12;
const PRODUCT_SGP30 = 0;
export const INIT_S = 15; // its first readings, fixed at 400 ppm and 0 ppb
const HUMIDITY_STEPS = 256; // 8.8 fixed point, g/m3
const HUMIDITY_MAX = 0xffff;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the CRC-8 after each word: 0x31, from 0xFF
export function crc8(bytes) {
  let c = 0xff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

const withCrc = (v) => [v >> 8, v & 0xff, crc8([v >> 8, v & 0xff])];

// n words from d, each CRC checked
function words(d, n, what) {
  const out = [];
  for (let i = 0; i < n * 3; i += 3) {
    if (crc8(d.slice(i, i + 2)) !== d[i + 2]) throw new Error(`SGP30 ${what} CRC: 0x${d[i + 2].toString(16)}`);
    out.push((d[i] << 8) | d[i + 1]);
  }
  return out;
}

// absolute humidity, g/m3, from a temperature (C) and relative humidity (%):
// the datasheet's formula. Its example says 25 C and 50 % give 11.8; the
// formula gives 11.48 (31.6 hPa saturated, half of it, x 216.7 / 298.15)
export function absoluteHumidity(celsius, rh) {
  return (216.7 * ((rh / 100) * 6.112 * Math.exp((17.62 * celsius) / (243.12 + celsius)))) / (273.15 + celsius);
}

class Sgp30 {
  static chip = {
    name: 'SGP30',
    // no ID register: its feature set, a good CRC and product type 0
    async identify(bus, address) {
      try {
        await bus.write(address, FEATURE_SET);
        await delay(MS.feature);
        const d = await bus.read(address, 3);
        return crc8(d.slice(0, 2)) === d[2] && ((d[0] << 8) | d[1]) >> PRODUCT_SHIFT === PRODUCT_SGP30;
      } catch {
        return false;
      }
    },
  };

  constructor(bus, address = ADDRESS) {
    this.bus = bus;
    this.address = address;
  }

  // a command, its longest duration, then n words read back (none: nothing read)
  async ask(command, ms, n, what) {
    await this.bus.write(this.address, command);
    await delay(ms);
    return n ? words(await this.bus.read(this.address, n * 3), n, what) : [];
  }

  // the 48-bit serial number (a Number: exact to 2^53)
  async serial() {
    const [a, b, c] = await this.ask(SERIAL, MS.serial, 3, 'serial');
    return a * 2 ** 32 + b * 2 ** 16 + c;
  }

  async featureSet() {
    return (await this.ask(FEATURE_SET, MS.feature, 1, 'feature set'))[0];
  }

  // { passed, result }: its on-chip test; before init() only (the datasheet)
  async selfTest() {
    const [result] = await this.ask(MEASURE_TEST, MS.test, 1, 'self test');
    return { passed: result === TEST_PASSED, result };
  }

  // starts its air quality measurement: measure() once a second from now on
  async init() {
    await this.ask(IAQ_INIT, MS.init, 0);
  }

  // { co2eq, tvoc }: ppm and ppb (400 and 0 for its first 15 s)
  async measure() {
    const [co2eq, tvoc] = await this.ask(MEASURE_IAQ, MS.iaq, 2, 'measurement');
    return { co2eq, tvoc };
  }

  // { h2, ethanol }: its raw signals, ticks (higher is less gas)
  async raw() {
    const [h2, ethanol] = await this.ask(MEASURE_RAW, MS.raw, 2, 'raw signals');
    return { h2, ethanol };
  }

  // { co2eq, tvoc }: its baseline now, to save and set back later
  async baseline() {
    const [co2eq, tvoc] = await this.ask(GET_BASELINE, MS.baseline, 2, 'baseline');
    return { co2eq, tvoc };
  }

  // a saved baseline back, after init() (TVOC's word first, the datasheet's order)
  async setBaseline({ co2eq, tvoc }) {
    await this.ask([...SET_BASELINE, ...withCrc(tvoc), ...withCrc(co2eq)], MS.baseline, 0);
  }

  // the air's absolute humidity, g/m3 (absoluteHumidity() from a T and RH),
  // for its compensation; 0 turns it off
  async setHumidity(gramsPerM3) {
    const v = Math.min(HUMIDITY_MAX, Math.max(0, Math.round(gramsPerM3 * HUMIDITY_STEPS)));
    await this.ask([...SET_HUMIDITY, ...withCrc(v)], MS.humidity, 0);
  }
}

Sgp30.addresses = [ADDRESS];
Sgp30.INIT_S = INIT_S;

export default Sgp30;
