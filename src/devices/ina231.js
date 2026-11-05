// TI's INA231: a current, voltage and power monitor (a shunt resistor's
// voltage, the bus voltage, and from them current and power), at 0x40-0x4F
// by its A0/A1 pins. Adapter-free: any I2C bus with write(address, bytes)
// and writeRead(address, bytes, n). Registers 16 bits, MSB first.
//
// Per its datasheet (SBOS644D, revised July 2022, docs/): shunt voltage 2.5
// uV a count and bus voltage 1.25 mV a count, both fixed; current and power
// computed by the chip once its Calibration register holds
//   CAL = 0.00512 / (Current_LSB x R_SHUNT)   (Equation 1)
// with power at 25 x Current_LSB a count. Shunt voltage and current are
// signed (current both ways); bus voltage and power aren't. Defaults as
// pre-1.0 atiic's driver: a 0.1 ohm shunt, 0.1 mA a count (CAL 512, up to
// +/-3.2768 A).
//
// r8845's part answers FEh and FFh with 0x5449 and 0x2260: the INA226's
// manufacturer and die IDs (SBOS547C), registers the INA231's datasheet
// doesn't list. The two share this register map and these scales (the
// INA226's bus goes to 36 V, the INA231's 28 V). The bench knows the part by
// its FEh (chip.identify); an INA231 without it wouldn't be found there.

const REG_CONFIG = 0x00;
const REG_SHUNT = 0x01;
const REG_BUS = 0x02;
const REG_POWER = 0x03;
const REG_CURRENT = 0x04;
const REG_CALIBRATION = 0x05;
const REG_MANUFACTURER_ID = 0xfe; // not in the INA231's datasheet: the INA226's
const TI = 0x5449;
const RESET = 0x8000; // config bit 15, self-clearing
// the power-on configuration (Table 8-4): averaging 1, 1.1 ms conversions,
// shunt and bus continuously; written after the reset so an INA231B (powered
// down at reset, Table 8-8) runs too
const CONFIG_CONTINUOUS = 0x4127;
const SHUNT_V_PER_COUNT = 2.5e-6;
const BUS_V_PER_COUNT = 1.25e-3;
const CAL_CONSTANT = 0.00512; // Equation 1
const POWER_LSB_FACTOR = 25;
const CAL_MAX = 0x7fff;

const s16 = (h, l) => ((h << 24) >> 16) | l;

class Ina231 {
  static chip = {
    name: 'INA231',
    async identify(bus, address) {
      const [h, l] = await bus.writeRead(address, [REG_MANUFACTURER_ID], 2);
      return ((h << 8) | l) === TI;
    },
  };

  // shunt: ohms; currentLsb: amps a count of the Current register
  constructor(bus, address = 0x40, { shunt = 0.1, currentLsb = 0.0001 } = {}) {
    this.bus = bus;
    this.address = address;
    this.shunt = shunt;
    this.currentLsb = currentLsb;
    this.calibration = Math.round(CAL_CONSTANT / (currentLsb * shunt));
    if (this.calibration < 1 || this.calibration > CAL_MAX) {
      throw new Error(`calibration ${this.calibration} out of range: shunt ${shunt} ohm, ${currentLsb} A a count`);
    }
  }

  async word(reg) {
    return this.bus.writeRead(this.address, [reg], 2);
  }

  async init() {
    await this.bus.write(this.address, [REG_CONFIG, RESET >> 8, RESET & 0xff]);
    await this.bus.write(this.address, [REG_CONFIG, CONFIG_CONTINUOUS >> 8, CONFIG_CONTINUOUS & 0xff]);
    await this.bus.write(this.address, [REG_CALIBRATION, this.calibration >> 8, this.calibration & 0xff]);
  }

  // { shunt: V (signed), bus: V, current: A (signed), power: W }
  async measure() {
    const [sh, sl] = await this.word(REG_SHUNT);
    const [bh, bl] = await this.word(REG_BUS);
    const [ch, cl] = await this.word(REG_CURRENT);
    const [ph, pl] = await this.word(REG_POWER);
    return {
      shunt: s16(sh, sl) * SHUNT_V_PER_COUNT,
      bus: ((bh << 8) | bl) * BUS_V_PER_COUNT,
      current: s16(ch, cl) * this.currentLsb,
      power: ((ph << 8) | pl) * POWER_LSB_FACTOR * this.currentLsb,
    };
  }

  // power-down (mode 000)
  async sleep() {
    await this.bus.write(this.address, [REG_CONFIG, CONFIG_CONTINUOUS >> 8, CONFIG_CONTINUOUS & 0xf8]);
  }
}

Ina231.addresses = Array.from({ length: 16 }, (_, i) => 0x40 + i);

export default Ina231;
