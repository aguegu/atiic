class Tcs37425 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '29';
  }

  async init() {
    const [id] = await this.adapter.transmit(`AT+TR=${this.address}9201`);

    if (id !== 0x4d) {
      throw new Error(`Device at adrress 0x${this.address} IS NOT TCS37425`);
    }
  }
}

export default Tcs37425;
