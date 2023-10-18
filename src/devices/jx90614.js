import assert from 'node:assert/strict';

class Jx90614 {
  constructor(adapter, address = '7F') {
    this.adapter = adapter;
    this.address = address;
  }

  async init(mode) {
    await this.adapter.transmit(`AT+TX=${this.address}3002`);
    await this.adapter.transmit(`AT+TX=${this.address}300a`);
  }

  async setSlaveAddress(address) {
    assert.match(address, /[0-7][0-9a-fA-F]/);
    const adr = Buffer.from(address, 'hex').readUInt8();
    assert(adr > 2 && adr < 0x78, 'address out of range');
    await this.adapter.transmit(`AT+TR=${this.address}9201`);
    await this.adapter.transmit(`AT+TX=${this.address}92${address}`);
    await this.adapter.transmit(`AT+TX=${this.address}4068`);
    await this.adapter.transmit(`AT+TR=${this.address}0401`);
    this.address = address;
  }

  async measure() {
    const raw = await this.adapter.transmit(`AT+TR=${this.address}1003`);
    if (raw.readInt8() >= 0) {
      return Promise.resolve({ temperature: Buffer.concat([Buffer.from([0x00]), raw]).readInt32BE() / 16384 });
    }
    return Promise.resolve({ temperature: Buffer.concat([Buffer.from([0xff]), raw]).readInt32BE() / 16384 });
  }

  async ready() {
     return this.adapter.transmit(`AT+TR=${this.address}0201`).then(code => Buffer.from(code, 'hex').readUInt8());
  }
}

export default Jx90614;
