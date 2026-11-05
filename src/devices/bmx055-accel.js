// Bosch BMX055's accelerometer: one of the BMX055's three chips, each at its
// own I2C address (this one 0x18 or 0x19 by its SDO pin; the gyro and the
// magnetometer have their own drivers). Adapter-free: any I2C bus with
// write(address, bytes) and writeRead(address, bytes, n). 12-bit, the
// family whose chip ID is 0xFA (BMA253/254/255, BMC150, BMI055 too).
// Registers per Bosch's BMX055 datasheet, BST-BMX055-DS000-02 rev 1.1
// (2014-11; not in this repo: Bosch's notice), cross-checked with Linux's
// bmc150-accel driver. The PS pin must be tied to VDDIO for I2C (the
// datasheet; floating, the module on r8845 answered nothing).

const REG_CHIP_ID = 0x00;
const REG_ACCD_X_LSB = 0x02; // x y z, each low byte first: 12 bits at the top of 16, then temp
const REG_PMU_RANGE = 0x0f;
const REG_PMU_BW = 0x10;
const REG_PMU_LPW = 0x11;
const REG_BGW_SOFTRESET = 0x14;
const SOFTRESET = 0xb6;
const SOFTRESET_MS = 3; // after a soft reset, the wake-up time tw,up1 (1.3 ms typical; the kernel waits 1.8-2.5)
const DATA_BYTES = 7; // x, y, z (2 bytes each) and the temperature
const DATA_SHIFT = 4; // the 12 bits stand in the top of each 16
const PMU_NORMAL = 0x00;
const PMU_SUSPEND = 0x80; // PMU_LPW's mode bits 7-5: 100
const RANGE_CODE = { 2: 0x03, 4: 0x05, 8: 0x08, 16: 0x0c }; // PMU_RANGE for +/-2 .. 16 g
const LSB_PER_G_2G = 1024; // 12 bits over +/-2 g; halved per range up
const BW_62_5_HZ = 0x0a; // PMU_BW: bandwidth 31.25 Hz, a new sample every 16 ms (update time tut), as the MPU drivers' 62.5 Hz
const SAMPLE_PERIOD_MS = 16;
const TEMP_LSB = 2; // counts a degree C (0.5 C a count)
const TEMP_OFFSET = 23; // degrees C at a reading of 0

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bmx055Accel {
  static chip = {
    name: 'BMX055 accelerometer',
    idRegister: REG_CHIP_ID,
    whoAmI: 0xfa,
  };

  constructor(bus, address = 0x18) {
    this.bus = bus;
    this.address = address;
  }

  async init(accelerometerScale = '4') {
    const range = Number(accelerometerScale);
    if (!Bmx055Accel.accelerometerScales.includes(accelerometerScale)) {
      throw new Error('invalid accelerometerScale');
    }
    const [id] = await this.bus.writeRead(this.address, [REG_CHIP_ID], 1);
    const { chip } = this.constructor;
    if (id !== chip.whoAmI) {
      throw new Error(`chip ID 0x${id.toString(16)}, not a ${chip.name}`);
    }
    await this.bus.write(this.address, [REG_BGW_SOFTRESET, SOFTRESET]);
    await delay(SOFTRESET_MS);
    await this.bus.write(this.address, [REG_PMU_RANGE, RANGE_CODE[range]]);
    await this.bus.write(this.address, [REG_PMU_BW, BW_62_5_HZ]);
    await this.bus.write(this.address, [REG_PMU_LPW, PMU_NORMAL]);
    this.accelerometerSensitivity = LSB_PER_G_2G / (range / 2); // counts a g
    // the data registers keep the sample before until the next one
    await delay(SAMPLE_PERIOD_MS * 2);
  }

  // the counts as the MPU drivers' measure() gives them, g and degrees C
  async measure() {
    const d = await this.bus.writeRead(this.address, [REG_ACCD_X_LSB], DATA_BYTES);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const axis = (o) => (v.getInt16(o, true) >> DATA_SHIFT) / this.accelerometerSensitivity;
    return {
      accelerometers: { x: axis(0), y: axis(2), z: axis(4) },
      temperature: v.getInt8(6) / TEMP_LSB + TEMP_OFFSET,
    };
  }

  async sleep() {
    await this.bus.write(this.address, [REG_PMU_LPW, PMU_SUSPEND]);
  }
}

Bmx055Accel.addresses = [0x18, 0x19];
Bmx055Accel.accelerometerScales = ['2', '4', '8', '16'];

export default Bmx055Accel;
