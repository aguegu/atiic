// InvenSense MPU-6050: a 3-axis gyro and accelerometer. Adapter-free: it
// takes any I2C bus with write(address, bytes) and writeRead(address,
// bytes, n) (src/adapters/ch341 is one). Rated to 400 kHz.
// Registers per the MPU-6000/6050 Register Map, RM-MPU-6000A-00 rev 4.2.

const REG_SMPLRT_DIV = 0x19; // then CONFIG, GYRO_CONFIG, ACCEL_CONFIG
const REG_ACCEL_XOUT_H = 0x3b; // accel x y z, temp, gyro x y z: 14 bytes, big-endian
const REG_PWR_MGMT_1 = 0x6b;
const REG_WHO_AM_I = 0x75;
const MEASURE_BYTES = 14;
const PWR_AWAKE = 0x00; // the internal 8 MHz oscillator, not asleep
const PWR_SLEEP = 0x40;
const SAMPLE_DIV = 0x0f; // sample rate: 1 kHz / (1 + 15) = 62.5 Hz with the DLPF on
const DLPF_20HZ = 0x04; // CONFIG's DLPF_CFG: accel 21 Hz, gyro 20 Hz
const FS_SEL_SHIFT = 3; // GYRO_CONFIG's FS_SEL and ACCEL_CONFIG's AFS_SEL, bits 3-4
const GYRO_LSB_250 = 131; // LSB per deg/s at +/-250, halved per range up
const ACCEL_LSB_2G = 16384; // LSB per g at +/-2 g, halved per range up
// the FIFO: samples queued in register order (accel, temp, gyro), read in blocks
const REG_FIFO_EN = 0x23;
const REG_USER_CTRL = 0x6a;
const REG_FIFO_COUNT_H = 0x72; // then FIFO_COUNT_L, big-endian
const REG_FIFO_R_W = 0x74; // a burst read here pops the FIFO
const FIFO_EN_TEMP = 0x80;
const FIFO_EN_GYRO = 0x70; // XG, YG, ZG
const FIFO_EN_ACCEL = 0x08;
const USER_CTRL_FIFO_EN = 0x40;
const USER_CTRL_FIFO_RESET = 0x04;
const DLPF_OFF = 0x00; // DLPF_CFG 0: the gyro sampled at 8 kHz, the accel still at 1 kHz
const GYRO_RATE_DLPF_OFF = 8000; // Hz, the sample rate before SMPLRT_DIV
const GYRO_RATE_DLPF_ON = 1000;
const AXES = ['x', 'y', 'z'];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Mpu6050 {
  // what differs between the chips of the family (Mpu6500 has its own)
  static chip = {
    name: 'MPU-6050',
    idRegister: REG_WHO_AM_I,
    whoAmI: 0x68, // whatever AD0 is
    tempLsb: 340, // LSB per degree C
    tempOffset: 36.53, // degrees C at a reading of 0
    fifoSize: 1024, // bytes; full, it overwrites its oldest: frames lost, the rest misaligned
    // woken from sleep, the gyro's readings settle well after its 30 ms
    // typical start-up (PS-MPU-6000A rev 3.4, 6.1). Through the 20 Hz
    // filter, on r8845's GY-521, within 0.5 deg/s of rest: 80 ms after the
    // wake-up when it slept 10 ms or more, 110 ms when woken within 5 ms of
    // going to sleep (the worst)
    settleMs: 150,
    dividerWithFilterOff: true, // SMPLRT_DIV divides the gyro's 8 kHz too
  };

  // the config written after SMPLRT_DIV, in one burst: CONFIG, GYRO_CONFIG,
  // ACCEL_CONFIG (and on the MPU-6500, ACCEL_CONFIG2 after them)
  configBytes(gfs, afs) {
    return [DLPF_20HZ, gfs << FS_SEL_SHIFT, afs << FS_SEL_SHIFT];
  }

  constructor(bus, address = 0x68) {
    this.bus = bus;
    this.address = address;
  }

  async init(gyroscopeScale = '500', accelerometerScale = '4') {
    const gfs = Mpu6050.gyroscopeScales.indexOf(gyroscopeScale);
    if (gfs < 0) {
      throw new Error('invalid gyroscopeScale');
    }

    const afs = Mpu6050.accelerometerScales.indexOf(accelerometerScale);
    if (afs < 0) {
      throw new Error('invalid accelerometerScale');
    }

    const [who] = await this.bus.writeRead(this.address, [REG_WHO_AM_I], 1);
    const { chip } = this.constructor;
    if (who !== chip.whoAmI) {
      throw new Error(`WHO_AM_I 0x${who.toString(16)}, not an ${chip.name}`);
    }

    this.gyroscopeSensitivity = GYRO_LSB_250 / (1 << gfs);
    this.accelerometerSensitivity = ACCEL_LSB_2G >> afs;

    await this.bus.write(this.address, [REG_PWR_MGMT_1, PWR_AWAKE]);
    await this.bus.write(this.address, [REG_SMPLRT_DIV, SAMPLE_DIV, ...this.configBytes(gfs, afs)]);
    // the data registers keep the sample taken before (asleep, or at the old
    // scale) until the next one, and a gyro just woken reads off until it
    // settles: wait for settled samples at the new settings
    await delay(chip.settleMs);
  }

  async measure() {
    const d = await this.bus.writeRead(this.address, [REG_ACCEL_XOUT_H], MEASURE_BYTES);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    return {
      accelerometers: {
        x: v.getInt16(0) / this.accelerometerSensitivity,
        y: v.getInt16(2) / this.accelerometerSensitivity,
        z: v.getInt16(4) / this.accelerometerSensitivity,
      },
      temperature: this.temperature(v.getInt16(6)),
      gyroscopes: {
        x: v.getInt16(8) / this.gyroscopeSensitivity,
        y: v.getInt16(10) / this.gyroscopeSensitivity,
        z: v.getInt16(12) / this.gyroscopeSensitivity,
      },
    };
  }

  // FIFO mode: the chip queues each sample, readFifo() takes them in blocks.
  // divider: SMPLRT_DIV, the sample rate (8 kHz with filter off, 1 kHz on)
  // over (1 + divider); filter: the 20 Hz low-pass init() sets, or none
  async startFifo({
    accelerometers = true, temperature = false, gyroscopes = true, divider = 0, filter = true,
  } = {}) {
    this.fifo = { accelerometers, temperature, gyroscopes };
    this.fifoFrame = (accelerometers ? 6 : 0) + (temperature ? 2 : 0) + (gyroscopes ? 6 : 0);
    if (!this.fifoFrame) throw new Error('nothing to queue');
    const { chip } = this.constructor;
    if (!filter && divider && !chip.dividerWithFilterOff) {
      throw new Error(`the ${chip.name} ignores SMPLRT_DIV with the filter off: 8 kHz only`);
    }
    this.sampleRate = (filter ? GYRO_RATE_DLPF_ON : GYRO_RATE_DLPF_OFF) / (1 + divider);
    const enable = (accelerometers ? FIFO_EN_ACCEL : 0) | (temperature ? FIFO_EN_TEMP : 0) | (gyroscopes ? FIFO_EN_GYRO : 0);
    await this.bus.write(this.address, [REG_SMPLRT_DIV, divider, filter ? DLPF_20HZ : DLPF_OFF]);
    await this.bus.write(this.address, [REG_FIFO_EN, enable]);
    await this.resetFifo();
  }

  async resetFifo() {
    await this.bus.write(this.address, [REG_USER_CTRL, USER_CTRL_FIFO_RESET]);
    await this.bus.write(this.address, [REG_USER_CTRL, USER_CTRL_FIFO_EN]);
  }

  // the whole frames queued, parsed; throws (and restarts the FIFO) when it
  // filled up, frames lost
  async readFifo() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_FIFO_COUNT_H], 2);
    const count = (h << 8) | l;
    if (count >= this.constructor.chip.fifoSize) {
      await this.resetFifo();
      throw new Error(`${this.constructor.chip.name} FIFO overflowed: samples lost`);
    }
    const n = count - (count % this.fifoFrame);
    if (!n) return [];
    const d = await this.bus.writeRead(this.address, [REG_FIFO_R_W], n);
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const samples = [];
    for (let o = 0; o < n; o += this.fifoFrame) {
      const sample = {};
      let k = o;
      const triple = (sensitivity) => Object.fromEntries(AXES.map((a, i) => [a, v.getInt16(k + 2 * i) / sensitivity]));
      if (this.fifo.accelerometers) { sample.accelerometers = triple(this.accelerometerSensitivity); k += 6; }
      if (this.fifo.temperature) { sample.temperature = this.temperature(v.getInt16(k)); k += 2; }
      if (this.fifo.gyroscopes) { sample.gyroscopes = triple(this.gyroscopeSensitivity); }
      samples.push(sample);
    }
    return samples;
  }

  async stopFifo() {
    await this.bus.write(this.address, [REG_USER_CTRL, 0]);
    await this.bus.write(this.address, [REG_FIFO_EN, 0]);
    await this.bus.write(this.address, [REG_SMPLRT_DIV, SAMPLE_DIV, DLPF_20HZ]);
  }

  // a raw temperature reading in degrees C
  temperature(raw) {
    const { chip } = this.constructor;
    return raw / chip.tempLsb + chip.tempOffset;
  }

  async sleep() {
    await this.bus.write(this.address, [REG_PWR_MGMT_1, PWR_SLEEP]);
  }
}

Mpu6050.addresses = [0x68, 0x69];
Mpu6050.accelerometerScales = ['2', '4', '8', '16'];
Mpu6050.gyroscopeScales = ['250', '500', '1000', '2000'];

export default Mpu6050;
