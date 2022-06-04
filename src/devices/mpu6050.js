import { i2hex } from '../utils.js';

class Mpu6050 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '68';
  }

  async init() {
    await this.adapter.transmit(`AT+TX=${this.address}${[0x6b, 0x00].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x19, 0x07].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x1a, 0x04].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x1b, 0x08].map(i2hex).join('')}`);
    await this.adapter.transmit(`AT+TX=${this.address}${[0x1c, 0x08].map(i2hex).join('')}`);
  }

  async measure() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}3B0E`);
    return {
      accelerometers: {
        x: payload.readInt16BE(),
        y: payload.readInt16BE(2),
        z: payload.readInt16BE(4),
      },
      temperature: payload.readInt16BE(6),
      gyroscopes: {
        x: payload.readInt16BE(8),
        y: payload.readInt16BE(10),
        z: payload.readInt16BE(12),
      },
    };
  }
}

export default Mpu6050;
