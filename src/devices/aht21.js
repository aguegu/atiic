import { delay, crc8 } from '../utils.js';

class Aht21 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '38';
  }

  async init() {
    const [status] = await this.adapter.transmit(`AT+TR=${this.address}01`);

    if (!(status & 0x08)) {
      await this.adapter.transmit(`AT+TX=${this.address}be0800`); // initialize
      await delay(10);
    }
  }

  async measure() {
    await this.adapter.transmit(`AT+TX=${this.address}ac3308`); // measure
    await delay(80);
    const payload = await this.adapter.transmit(`AT+TR=${this.address}07`); // measure
    if (payload[0] & 0x80) {
      throw new Error('Measurement not completed');
    }

    const humidity = ((payload[1] << 12) + (payload[2] << 4) + ((payload[3] & 0xf0) >> 4))
      / (1 << 20);
    const temperature = ((((payload[3] & 0x0f) << 16) + (payload[4] << 8) + payload[5])
      / (1 << 20)) * 200 - 50;

    if (crc8(payload)) {
      throw new Error('crc8 mismatch');
    }
    return Promise.resolve({ humidity, temperature });
  }
}

export default Aht21;
