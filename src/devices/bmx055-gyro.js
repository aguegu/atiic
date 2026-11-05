// Bosch BMX055's gyro: one of the BMX055's three chips, at 0x68 or 0x69 by
// its SDO pin (the accelerometer and the magnetometer have their own
// drivers). Adapter-free: any I2C bus with write(address, bytes) and
// writeRead(address, bytes, n). 16-bit, chip ID 0x0F (the BMG160's).
// Registers per Bosch's BMX055 datasheet, BST-BMX055-DS000-02 rev 1.1 (GYR
// registers), cross-checked with Linux's bmg160 driver. No temperature: on
// the BMX055 the gyro's 0x08 is reserved (the accelerometer has one). The
// PS pin must be tied to VDDIO for I2C.

const REG_CHIP_ID = 0x00;
const REG_RATE_X_LSB = 0x02; // x y z, each 16-bit two's complement, low byte first
const REG_RANGE = 0x0f;
const REG_BW = 0x10;
const REG_LPM1 = 0x11;
const REG_BGW_SOFTRESET = 0x14;
const SOFTRESET = 0xb6;
const SOFTRESET_MS = 30; // the wake-up time from suspend, twusm (the kernel waits 30 ms too)
const DATA_BYTES = 6;
const LPM1_NORMAL = 0x00;
const LPM1_SUSPEND = 0x80; // LPM1's suspend bit
// RANGE: Table 29, +/-2000 .. 125 deg/s, and their counts a deg/s
const RANGE_CODE = { 2000: 0x00, 1000: 0x01, 500: 0x02, 250: 0x03, 125: 0x04 };
const LSB_PER_DPS_2000 = 16.4; // doubled per range down: 32.8, 65.6, 131.2, 262.4
const BW_100_HZ = 0x07; // Table 30: 100 Hz output data rate, 32 Hz filter (none at 62.5 Hz)

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bmx055Gyro {
  static chip = {
    name: 'BMX055 gyro',
    idRegister: REG_CHIP_ID,
    whoAmI: 0x0f,
    // woken (normal mode after the soft reset), the wait before the rates are
    // settled: provisional, the kernel's 80 ms "safety margin"; to measure
    settleMs: 80,
  };

  constructor(bus, address = 0x68) {
    this.bus = bus;
    this.address = address;
  }

  async init(gyroscopeScale = '500') {
    if (!Bmx055Gyro.gyroscopeScales.includes(gyroscopeScale)) {
      throw new Error('invalid gyroscopeScale');
    }
    const range = Number(gyroscopeScale);
    const [id] = await this.bus.writeRead(this.address, [REG_CHIP_ID], 1);
    const { chip } = this.constructor;
    if (id !== chip.whoAmI) {
      throw new Error(`chip ID 0x${id.toString(16)}, not a ${chip.name}`);
    }
    await this.bus.write(this.address, [REG_BGW_SOFTRESET, SOFTRESET]);
    await delay(SOFTRESET_MS);
    await this.bus.write(this.address, [REG_RANGE, RANGE_CODE[range]]);
    await this.bus.write(this.address, [REG_BW, BW_100_HZ]);
    await this.bus.write(this.address, [REG_LPM1, LPM1_NORMAL]);
    this.gyroscopeSensitivity = LSB_PER_DPS_2000 * (2000 / range); // counts a deg/s
    await delay(chip.settleMs);
  }

  // deg/s about x, y, z, as the MPU drivers' measure() gives them
  async measure() {
    const d = await this.bus.writeRead(this.address, [REG_RATE_X_LSB], DATA_BYTES);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const axis = (o) => v.getInt16(o, true) / this.gyroscopeSensitivity;
    return { gyroscopes: { x: axis(0), y: axis(2), z: axis(4) } };
  }

  async sleep() {
    await this.bus.write(this.address, [REG_LPM1, LPM1_SUSPEND]);
  }
}

Bmx055Gyro.addresses = [0x68, 0x69];
Bmx055Gyro.gyroscopeScales = ['125', '250', '500', '1000', '2000'];

export default Bmx055Gyro;
