class Jx90614 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '7F';
  }

  async init(mode) {
    await this.adapter.transmit(`AT+TX=${this.address}3002`);
    await this.adapter.transmit(`AT+TX=${this.address}300a`);
  }

  async setSlaveAddress(address) {
    await this.adapter.transmit(`AT+TR=${this.address}9201`);
    await this.adapter.transmit(`AT+TX=${this.address}92${address}`);
    await this.adapter.transmit(`AT+TX=${this.address}4068`);
    await this.adapter.transmit(`AT+TR=${this.address}0401`);
    this.address = address;
  }

  async measure() {
    await this.adapter.transmit(`AT+TR=${this.address}0201`);
    const raw = await this.adapter.transmit(`AT+TR=${this.address}1003`);
    if (raw.readInt8() >= 0) {
      return Promise.resolve({ temperature: Buffer.concat([Buffer.from([0x00]), raw]).readInt32BE() / 16384 });
    }
    return Promise.resolve({ temperature: Buffer.concat([Buffer.from([0xff]), raw]).readInt32BE() / 16384 });
  }
}

export default Jx90614;
