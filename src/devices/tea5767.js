import _ from 'lodash';
import { i2hex, delay } from '../utils.js';

class Tea5767 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '60';
    this.xtal = 32768;
    this.pplOffset = 225000;
    this.configs = {
      muted: false,
      searchMode: false,
      ppl: 11000,
      searchUp: true,
      searchStopLevel: 2,
      hlsi: false,
      mono: false,
      muteRight: false,
      muteLeft: false,

      standBy: false,
      bl: 0,
      xtal: true,
      softMute: false,
      highCutControl: false,
      stereoNoiseCancelling: false,
      pllref: false,
      dtc: false,
    };
  }

  get adjustables() {
    return _.omit(this.configs, 'ppl', 'searchMode', 'searchUp');
  }

  async adjust(configs) {
    _.assign(this.configs, configs);
    return this.setConfigs();
  }

  async searchNext(isSearchUp) {
    this.configs.searchMode = true;
    this.configs.searchUp = isSearchUp;
    this.configs.ppl += isSearchUp ? 10 : -10;
    await this.setConfigs();
    this.configs.searchMode = false;

    await delay(500);
    return this.getStates();
  }

  async setConfigs() {
    const tx = [0, 0, 0, 0, 0];
    tx[0] = (this.configs.ppl >> 8) & 0x3f;
    tx[1] = this.configs.ppl & 0xff;
    tx[0] |= this.configs.muted ? 0x80 : 0x00;
    tx[0] |= this.configs.searchMode ? 0x40 : 0x00;
    tx[2] |= this.configs.searchUp ? 0x80 : 0x00;
    tx[2] |= this.configs.searchStopLevel << 5;
    tx[2] |= this.configs.hlsi ? 0x10 : 0x00;
    tx[2] |= this.configs.mono ? 0x08 : 0x00;
    tx[2] |= this.configs.muteRight ? 0x04 : 0x00;
    tx[2] |= this.configs.muteLeft ? 0x02 : 0x00;

    tx[3] |= this.configs.standBy ? 0x40 : 0x00;
    tx[3] |= this.configs.bl ? 0x20 : 0x00;
    tx[3] |= this.configs.xtal ? 0x10 : 0x00;
    tx[3] |= this.configs.softMute ? 0x08 : 0x00;
    tx[3] |= this.configs.highCutControl ? 0x04 : 0x00;
    tx[3] |= this.configs.stereoNoiseCancelling ? 0x02 : 0x00;

    tx[4] |= this.configs.pllref ? 0x80 : 0x00;
    tx[4] |= this.configs.dtc ? 0x40 : 0x00;

    return this.adapter.transmit(`AT+TX=${this.address}${tx.map(i2hex).join('')}`);
  }

  get frequence() {
    return (this.configs.ppl * this.xtal) / 4 + this.pplOffset;
  }

  get frequenceRange() {
    return this.configs.bl ? [76000000, 91000000] : [87500000, 108000000];
  }

  async setFrequence(hz) {
    const [min, max] = this.frequenceRange;
    if (hz < min || hz > max) {
      throw new Error('frequence out of range');
    }
    this.configs.ppl = parseInt(((hz - this.pplOffset) * 4) / this.xtal, 10);
    return this.setConfigs();
  }

  async getStates() {
    const regs = await this.adapter.transmit(`AT+TR=${this.address}05`).then(Array.from);
    const ppl = ((regs[0] & 0x3f) << 8) + regs[1];
    this.configs.ppl = ppl;
    return {
      isReady: !!(regs[0] & 0x80),
      isBandLimitReached: !!(regs[0] & 0x40),
      ppl,
      isStereo: !!(regs[2] & 0x80),
      ifCounter: regs[2] & 0x7f,
      level: regs[3] >> 4,
    };
  }
}

export default Tea5767;
