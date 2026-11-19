// TI's HDC1080: relative humidity and temperature, at 0x40. Adapter-free:
// any I2C bus with write(address, bytes), read(address, n) and
// writeRead(address, bytes, n). Registers 16 bits, MSB first, by a pointer.
//
// Per its datasheet (SNAS672 / ZHCSET2A, revised January 2016, docs/):
// temperature 0x00, humidity 0x01, configuration 0x02 (Table 4: RST 15, HEAT
// 13, MODE 12 - both, temperature first -, BTST 11 read-only, TRES 10, HRES
// 9:8; bit 14 and 7:0 reserved, 0), the serial ID 0xFB-0xFD, the
// manufacturer 0xFE (0x5449, "TI") and the device 0xFF (0x1050): how a bench
// knows it (chip.identify). A measurement (8.5.1.3): the pointer written to
// 0x00, the conversion waited, both read in one go, 4 bytes, T first:
//   T = S / 2^16 x 165 - 40 (C),  RH = S / 2^16 x 100 (%)
// No checksum. The conversion times are typical only (7.5: T 6.35 / 3.65 ms
// at 14 / 11 bits; RH 6.5 / 3.85 / 2.5 at 14 / 11 / 8), no maximum: their sum
// waited, then a read NACKed while the result isn't ready (8.5.1.3, Figure
// 13) tried again every POLL_MS, at most as long again. TI's advice (9.2.1,
// not the specification): no more than one reading a second, against
// self-heating: periodMs(). The heater (HEAT) runs only while measuring
// (8.3.3). No soft-reset time given: tSTART's 15 ms (7.7) waited.
// At 0x40 an SHT20's or HTU21D's ID check writes 0xFC 0xC9: a read-only
// register here, its data byte refused; and an INA231's check reads 0xFE,
// TI's 0x5449 here too (devices/ina231.js tells them apart by 0xFF).
// Measured on Dart-8346 at 100 kHz: both at 14 bits ready after 12.3 to
// 13.1 ms (polled; their typical sum 12.85); 22.6 C, 59.6 %.

const REG_TEMPERATURE = 0x00;
const REG_CONFIG = 0x02;
const REG_SERIAL = [0xfb, 0xfc, 0xfd];
const REG_MANUFACTURER = 0xfe;
const REG_DEVICE = 0xff;
const TI = 0x5449;
export const DEVICE_ID = 0x1050;
const RST = 0x8000;
const HEAT = 0x2000;
const MODE_BOTH = 0x1000;
const BTST = 0x0800;
const TRES_11 = 0x0400;
const HRES = { 14: 0x0000, 11: 0x0100, 8: 0x0200 };
// 7.5's typical conversion times, ms, by resolution
export const CONVERSION_MS = { temperature: { 14: 6.35, 11: 3.65 }, humidity: { 14: 6.5, 11: 3.85, 8: 2.5 } };
const START_MS = 15; // tSTART at most (7.7); for a soft reset too
const POLL_MS = 1;
const PERIOD_MS = 1000; // 9.2.1: at most one reading (RH + T) a second

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Hdc1080 {
  static chip = {
    name: 'HDC1080',
    // TI's manufacturer ID and its device ID
    async identify(bus, address) {
      try {
        const [mh, ml] = await bus.writeRead(address, [REG_MANUFACTURER], 2);
        const [dh, dl] = await bus.writeRead(address, [REG_DEVICE], 2);
        return ((mh << 8) | ml) === TI && ((dh << 8) | dl) === DEVICE_ID;
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
  }

  async writeConfig() {
    const r = this.resolution;
    const c = MODE_BOTH | (this.heater ? HEAT : 0) | (r.temperature === 11 ? TRES_11 : 0) | HRES[r.humidity];
    await this.bus.write(this.address, [REG_CONFIG, c >> 8, c & 0xff]);
  }

  // a soft reset, then both in one go at 14 bits each, the heater off
  async init() {
    await this.bus.write(this.address, [REG_CONFIG, RST >> 8, RST & 0xff]);
    await delay(START_MS);
    this.resolution = { temperature: 14, humidity: 14 };
    this.heater = false;
    await this.writeConfig();
  }

  // the configuration register (Table 4)
  async config() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_CONFIG], 2);
    return (h << 8) | l;
  }

  // { temperature: 14 or 11, humidity: 14, 11 or 8 } bits
  async setResolution({ temperature = this.resolution.temperature, humidity = this.resolution.humidity } = {}) {
    if (!CONVERSION_MS.temperature[temperature]) throw new Error(`HDC1080: no temperature resolution ${temperature}: 14, 11`);
    if (!CONVERSION_MS.humidity[humidity]) throw new Error(`HDC1080: no humidity resolution ${humidity}: 14, 11, 8`);
    this.resolution = { temperature, humidity };
    await this.writeConfig();
  }

  // the heater on or off: it heats only while measuring (8.3.3), so measure
  // often to warm it
  async setHeater(on) {
    this.heater = Boolean(on);
    await this.writeConfig();
  }

  // the supply under 2.8 V at the last measurement (BTST)
  async lowBattery() {
    return Boolean((await this.config()) & BTST);
  }

  // its serial ID (Tables 5-7): 0xFB, 0xFC, then 0xFD's top 9 bits
  async serialNumber() {
    const w = [];
    for (const p of REG_SERIAL) {
      const [h, l] = await this.bus.writeRead(this.address, [p], 2);
      w.push((h << 8) | l);
    }
    return w[0] * 2 ** 25 + w[1] * 2 ** 9 + (w[2] >> 7);
  }

  // the shortest period between measure()s TI advises, ms
  periodMs() {
    return PERIOD_MS;
  }

  // { temperature: C, humidity: % }: both, temperature first
  async measure() {
    const r = this.resolution;
    const wait = CONVERSION_MS.temperature[r.temperature] + CONVERSION_MS.humidity[r.humidity];
    await this.bus.write(this.address, [REG_TEMPERATURE]);
    await delay(wait);
    let d;
    for (let tries = Math.ceil(wait / POLL_MS); ; tries--) {
      try {
        d = await this.bus.read(this.address, 4);
        break;
      } catch (e) {
        if (tries <= 0) throw e; // still not ready, twice the typical time on
        await delay(POLL_MS);
      }
    }
    return {
      temperature: (((d[0] << 8) | d[1]) / 65536) * 165 - 40,
      humidity: (((d[2] << 8) | d[3]) / 65536) * 100,
    };
  }
}

Hdc1080.addresses = [0x40];
Hdc1080.CONVERSION_MS = CONVERSION_MS;

export default Hdc1080;
