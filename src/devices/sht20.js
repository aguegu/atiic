import { crc8 } from '../utils.js';

class Sht20 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '40';
  }

  async init() {
    return this.adapter.transmit(`AT+TX=${this.address}FE`);
  }

  async measure() {
    const payloadT = await this.adapter.transmit(`AT+TR=${this.address}e303`);
    const temperature = (((payloadT.readUInt16BE() * 17572) >> 16) - 4685) / 100;
    const payloadH = await this.adapter.transmit(`AT+TR=${this.address}e503`);
    const humidity = (((payloadH.readUInt16BE() * 125) >> 16) - 6);
    if (crc8(payloadT.slice(0, 2), 0x31, 0) != payloadT.readUInt8(2)
     || crc8(payloadH.slice(0, 2), 0x31, 0) != payloadH.readUInt8(2)) {
      throw new Error('checksum not match');
    }

    return Promise.resolve({ temperature, humidity });
  }
}

export default Sht20;
