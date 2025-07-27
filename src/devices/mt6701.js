class Mt6701 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '06';
  }

  async readAngle() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}0302`);
    return payload.readUInt16BE() >> 2;
  }
}

export default Mt6701;
