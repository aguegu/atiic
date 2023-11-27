import { i2hex } from '../utils.js';

class Mpu6050 {
  constructor(adapter, address = '68') {
    this.adapter = adapter;
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

    this.gyroscopeSensitivity = (131072 >> gfs) / 1000;
    this.accelerometerSensitivity = 16384 >> afs;
    await this.adapter.transmit(`AT+TX=${this.address}${[0x6b, 0x00].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x19, 0x0f].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x1a, 0x04].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x1b, Mpu6050.gyroscopeScales.indexOf(gyroscopeScale) << 3].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x1c, Mpu6050.accelerometerScales.indexOf(accelerometerScale) << 3].map(i2hex).join('')}`);
  }

  async measure() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}3B0E`);
    return {
      accelerometers: {
        x: payload.readInt16BE() / this.accelerometerSensitivity,
        y: payload.readInt16BE(2) / this.accelerometerSensitivity,
        z: payload.readInt16BE(4) / this.accelerometerSensitivity,
      },
      temperature: payload.readInt16BE(6) / 340 + 36.53,
      gyroscopes: {
        x: payload.readInt16BE(8) / this.gyroscopeSensitivity,
        y: payload.readInt16BE(10) / this.gyroscopeSensitivity,
        z: payload.readInt16BE(12) / this.gyroscopeSensitivity,
      },
    };
  }
}

Mpu6050.addresses = ['68', '69'];
Mpu6050.accelerometerScales = ['2', '4', '8', '16'];
Mpu6050.gyroscopeScales = ['250', '500', '1000', '2000'];

export default Mpu6050;
