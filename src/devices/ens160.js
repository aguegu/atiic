// ScioSense's ENS160: a metal-oxide gas sensor reporting air quality, at 0x52
// or 0x53 by its MISO/ADDR pin at power-up (low, high; 14). Adapter-free: any
// I2C bus with write(address, bytes) and writeRead(address, bytes, n).
// Registers 8 or 16 bits, the 16-bit ones LSB first.
//
// Per its datasheet (v1.3, SC-001224-DS-9, 2023-03-29, docs/ENS160-v1.3.pdf):
// PART_ID 0x0160 at 0x00 (how a bench knows it, chip.identify); OPMODE at 0x10
// (0x00 deep sleep, 0x01 idle, its power-up state, 0x02 standard gas sensing,
// 0xF0 reset); TEMP_IN at 0x13 and RH_IN at 0x15, the host's temperature and
// humidity for its compensation (Kelvin x 64, %RH x 512; the MSB written last);
// DEVICE_STATUS at 0x20 (bit 7 STATAS an OPMODE running, bit 6 STATER an error,
// bits 3-2 the validity flag, bit 1 NEWDAT, bit 0 NEWGPR); the results at
// 0x21-0x25: DATA_AQI (the UBA's index, 1-5, bits 2-0), DATA_TVOC (ppb) and
// DATA_ECO2 (ppm); DATA_T at 0x30 and DATA_RH at 0x32, the compensation it uses
// (TEMP_IN and RH_IN's formats). The validity flag (Table 10): 0 operating ok,
// 1 warm-up (its first 3 minutes after a power-on, 10.2), 2 initial start-up
// (its first hour ever, once in its life, 10.1), 3 no valid output. The
// readings are meant to be used from 0 only. CS high at power-up for I2C: a CS
// low once makes it SPI until the next power-on (14).
const REG_PART_ID = 0x00;
const REG_OPMODE = 0x10;
const REG_TEMP_IN = 0x13;
const REG_RH_IN = 0x15;
const REG_STATUS = 0x20;
const REG_DATA_AQI = 0x21;
const REG_DATA_T = 0x30;
export const PART_ID = 0x0160;
export const OPMODE = { deepSleep: 0x00, idle: 0x01, standard: 0x02 };
const STATER = 0x40;
const VALIDITY_SHIFT = 2;
const VALIDITY_MASK = 0x03;
const NEWDAT = 0x02;
const AQI_MASK = 0x07;
export const VALIDITY = ['ok', 'warm-up', 'initial start-up', 'invalid'];
const KELVIN = 273.15;
const T_SCALE = 64; // TEMP_IN and DATA_T: Kelvin x 64
const RH_SCALE = 512; // RH_IN and DATA_RH: %RH x 512
// its first results after the standard mode starts: waited for by NEWDAT, at
// most this long (no time for it in the datasheet; its response time 1 s, 10)
export const FIRST_DATA_MS = 5000;
const POLL_MS = 50;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const word = (lsb, msb) => lsb | (msb << 8);

// TEMP_IN's word from Celsius, RH_IN's from %RH (the datasheet's examples:
// 25 C 0x4A8A, 50 % 0x6400)
export const temperatureWord = (celsius) => Math.round((celsius + KELVIN) * T_SCALE);
export const humidityWord = (rh) => Math.round(rh * RH_SCALE);

class Ens160 {
  static chip = {
    name: 'ENS160',
    // PART_ID, 0x0160 LSB first
    async identify(bus, address) {
      try {
        const [l, h] = await bus.writeRead(address, [REG_PART_ID], 2);
        return word(l, h) === PART_ID;
      } catch {
        return false;
      }
    },
  };

  constructor(bus, address = 0x52) {
    this.bus = bus;
    this.address = address;
  }

  async status() {
    const [s] = await this.bus.writeRead(this.address, [REG_STATUS], 1);
    return s;
  }

  async opmode(mode) {
    await this.bus.write(this.address, [REG_OPMODE, mode]);
  }

  // the standard gas sensing mode; its first results waited for
  async init() {
    await this.opmode(OPMODE.idle);
    await this.opmode(OPMODE.standard);
    for (let waited = 0; waited < FIRST_DATA_MS; waited += POLL_MS) {
      await delay(POLL_MS);
      const s = await this.status();
      if (s & STATER) throw new Error(`ENS160 at 0x${this.address.toString(16)}: error (status 0x${s.toString(16)})`);
      if (s & NEWDAT) return;
    }
    throw new Error(`ENS160 at 0x${this.address.toString(16)}: no data after ${FIRST_DATA_MS} ms`);
  }

  // { aqi, tvoc, eco2, validity, fresh }: the last results; aqi the UBA's
  // 1-5, tvoc ppb, eco2 ppm, validity one of VALIDITY ('ok' or why not),
  // fresh: new since the last read (NEWDAT, cleared by this read)
  async measure() {
    const s = await this.status();
    const [aqi, tl, th, el, eh] = await this.bus.writeRead(this.address, [REG_DATA_AQI], 5);
    return {
      aqi: aqi & AQI_MASK,
      tvoc: word(tl, th),
      eco2: word(el, eh),
      validity: VALIDITY[(s >> VALIDITY_SHIFT) & VALIDITY_MASK],
      fresh: Boolean(s & NEWDAT),
    };
  }

  // the ambient temperature (C) and humidity (%RH) it compensates for, from
  // the host's own sensor; each one's MSB written last (16.2.5, 16.2.6)
  async compensate(celsius, rh) {
    const t = temperatureWord(celsius);
    const h = humidityWord(rh);
    await this.bus.write(this.address, [REG_TEMP_IN, t & 0xff, t >> 8]);
    await this.bus.write(this.address, [REG_RH_IN, h & 0xff, h >> 8]);
  }

  // { temperature, humidity }: what it compensates for now (DATA_T,
  // DATA_RH): TEMP_IN and RH_IN as written, else its defaults (25 C, 50 %)
  async compensation() {
    const [tl, th, hl, hh] = await this.bus.writeRead(this.address, [REG_DATA_T], 4);
    return { temperature: word(tl, th) / T_SCALE - KELVIN, humidity: word(hl, hh) / RH_SCALE };
  }

  // deep sleep (init() starts it again)
  async sleep() {
    await this.opmode(OPMODE.deepSleep);
  }
}

Ens160.addresses = [0x52, 0x53];
Ens160.VALIDITY = VALIDITY;

export default Ens160;
