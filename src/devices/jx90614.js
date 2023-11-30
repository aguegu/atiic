import { i2hex } from '../utils.js';

class Jx90614 {
  constructor(adapter, address = '7F') {
    this.adapter = adapter;
    this.address = address;
  }

  async init(mode = Jx90614.modes.dualChannel) {
    await this.adapter.transmit(`AT+TX=${this.address}30${i2hex(mode)}`);
    await this.adapter.transmit(`AT+TX=${this.address}30${i2hex(mode | 0x08)}`);
  }

  async setSlaveAddress(address) {
    if (!address.match(/^[0-7][0-9a-fA-F]$/)) {
      throw new Error('invalid slave address');
    }
    const adr = parseInt(address, 16);
    if (adr < 3 || adr > 0x77) {
      throw new Error('address out of range');
    }

    await this.adapter.transmit(`AT+TR=${this.address}9201`);
    await this.adapter.transmit(`AT+TX=${this.address}92${address}`);
    await this.adapter.transmit(`AT+TX=${this.address}4068`);
    await this.adapter.transmit(`AT+TR=${this.address}0401`);
    this.address = address;
  }

  async measure() {
    const raw = await this.adapter.transmit(`AT+TR=${this.address}1003`);
    if (raw.readInt8() >= 0) {
      return Promise.resolve({ temperature: ((raw.readInt16BE() << 8) + raw.readUInt8(2)) / 16384 });
    }
    return Promise.resolve({ temperature: ((raw.readInt16BE() << 8) + raw.readUInt8(2)) / 16384 });
  }

  async ready() {
    return this.adapter.transmit(`AT+TR=${this.address}0201`).then((code) => Buffer.from(code, 'hex').readUInt8());
  }
}

Jx90614.modes = {
  singleChannel: 0x00,
  dualChannel: 0x02,
  dualChannelFast: 0x03,
};

export default Jx90614;
