// ams's AS7341: an 11-channel spectral sensor, eight visible bands (F1 415,
// F2 445, F3 480, F4 515, F5 555, F6 590, F7 630, F8 680 nm), Clear, NIR
// (910 nm) and flicker, at 0x39. Adapter-free: any I2C bus with
// write(address, bytes) and writeRead(address, bytes, n).
//
// Per its datasheet (DS000504 v3-00, 2020-06-25, docs/AS7341-DS000504.pdf):
// ID at 0x92 (bits 7-2 001001: how a bench knows it); ENABLE 0x80 (PON bit
// 0, SP_EN bit 1, SMUXEN bit 4: cleared by the chip when its SMUX command is
// done); ATIME 0x81 and ASTEP 0xCA-0xCB (LSB first), an integration of
// (ATIME + 1) x (ASTEP + 1) x 2.78 us; AGAIN in CFG1 0xAA (0.5x to 512x);
// SMUX_CMD in CFG6 0xAF bits 4-3 (2: write its RAM's configuration to the
// SMUX chain); AVALID, STATUS2 0xA3 bit 6, a measurement done; ASTATUS 0x94
// (bit 7 ASAT, a channel saturated) and the six ADCs' data from 0x95, each
// LSB first (read in one burst: the low byte latches the high).
// Six ADCs for ten channels: the SMUX routes photodiodes to them, so a full
// reading is two measurements, F1-F4 then F5-F8, Clear and NIR in both. The
// datasheet leaves the SMUX's configuration (20 bytes at 0x00-0x13) to ams's
// application note AN000666 and reference code; SMUX_F1F4 and SMUX_F5F8 are
// taken from Adafruit's AS7341 library (BSD: Bryan Siepert for Adafruit
// Industries, setup_F1F4_Clear_NIR, setup_F5F8_Clear_NIR), built on ams's.
// On ours: ID 0x24; at power-up ASTEP 999, AGAIN 9 (256x); all ten channels
// read, in proportion to the gain (Clear 110 at 256x, 8 at 16x, a dim
// room), 134 ms for both halves. Not yet checked: that coloured light lands
// in its bands (the tables' routing), for i2c.ninja's page.
// Its board (the black "AS734x") wires its white LED to the chip's LED
// driver, pin LDR: off at power-up; REG_BANK (CFG0 0xA9 bit 4), LED_SEL
// (CONFIG 0x70 bit 3) and LED_ACT with its drive (LED 0x74: 4 mA + 2 mA
// a step, to 258) light it (tried at 4 mA). This driver leaves it off.

const REG_SMUX_RAM = 0x00;
const REG_ENABLE = 0x80;
const REG_ATIME = 0x81;
const REG_ID = 0x92;
const REG_ASTATUS = 0x94; // then CH0..CH5 data, LSB first
const REG_STATUS2 = 0xa3;
const REG_CFG1 = 0xaa; // AGAIN
const REG_CFG6 = 0xaf; // SMUX_CMD
const REG_ASTEP = 0xca;
export const ID = 0x24; // bits 7-2: 001001
const ID_MASK = 0xfc;
const PON = 0x01;
const SP_EN = 0x02;
const SMUXEN = 0x10;
const SMUX_CMD_WRITE = 2 << 3;
const AVALID = 0x40;
const ASAT = 0x80;
export const GAINS = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512]; // AGAIN's codes 0-10
const STEP_US = 2.78;
const POLL_MS = 2;
const SMUX_POLL_LIMIT = 100;
const MEASURE_MARGIN = 2; // AVALID waited for up to twice the integration, and a poll more

// the SMUX's 20 bytes for each half (Adafruit's AS7341 library): ADC0-3
// F1-F4 (then F5-F8), ADC4 Clear, ADC5 NIR
export const SMUX_F1F4 = [0x30, 0x01, 0x00, 0x00, 0x00, 0x42, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x20, 0x04, 0x00, 0x30, 0x01, 0x50, 0x00, 0x06];
export const SMUX_F5F8 = [0x00, 0x00, 0x00, 0x40, 0x02, 0x00, 0x10, 0x03, 0x50, 0x10, 0x03, 0x00, 0x00, 0x00, 0x24, 0x00, 0x00, 0x50, 0x00, 0x06];
export const BANDS = { f1: 415, f2: 445, f3: 480, f4: 515, f5: 555, f6: 590, f7: 630, f8: 680, nir: 910 }; // nm

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// six channels' counts from ASTATUS's burst (its 13 bytes)
export function channelsOf(d) {
  return Array.from({ length: 6 }, (_, i) => d[1 + 2 * i] | (d[2 + 2 * i] << 8));
}

class As7341 {
  static chip = {
    name: 'AS7341',
    // its ID, bits 7-2
    async identify(bus, address) {
      try {
        const [id] = await bus.writeRead(address, [REG_ID], 1);
        return (id & ID_MASK) === ID;
      } catch {
        return false;
      }
    },
  };

  // gain: one of GAINS (256 by default, its power-up's); atime and astep
  // its integration's (ams's typical 29 and 599: 50 ms)
  constructor(bus, address = 0x39, { gain = 256, atime = 29, astep = 599 } = {}) {
    if (!GAINS.includes(gain)) throw new Error(`AS7341: no gain ${gain}: ${GAINS.join(', ')}`);
    if (!(atime >= 0 && atime <= 0xff) || !(astep >= 0 && astep <= 0xfffe)) throw new Error(`AS7341: ATIME 0-255, ASTEP 0-65534, not ${atime} and ${astep}`);
    Object.assign(this, { bus, address, gain, atime, astep });
  }

  // its integration, ms
  get integrationMs() {
    return ((this.atime + 1) * (this.astep + 1) * STEP_US) / 1000;
  }

  async reg(reg) {
    const [v] = await this.bus.writeRead(this.address, [reg], 1);
    return v;
  }

  // powered on, the integration and gain set
  async init() {
    await this.bus.write(this.address, [REG_ENABLE, PON]);
    await this.bus.write(this.address, [REG_ATIME, this.atime]);
    await this.bus.write(this.address, [REG_ASTEP, this.astep & 0xff, this.astep >> 8]);
    await this.bus.write(this.address, [REG_CFG1, GAINS.indexOf(this.gain)]);
  }

  // one half's SMUX written, one measurement: its six ADCs and ASAT
  async half(smux) {
    await this.bus.write(this.address, [REG_ENABLE, PON]); // SP_EN off while the SMUX changes
    await this.bus.write(this.address, [REG_CFG6, SMUX_CMD_WRITE]);
    await this.bus.write(this.address, [REG_SMUX_RAM, ...smux]);
    await this.bus.write(this.address, [REG_ENABLE, PON | SMUXEN]);
    for (let i = 0; (await this.reg(REG_ENABLE)) & SMUXEN; i++) {
      if (i >= SMUX_POLL_LIMIT) throw new Error('AS7341: its SMUX command never finished');
      await delay(POLL_MS);
    }
    await this.bus.write(this.address, [REG_ENABLE, PON | SP_EN]);
    const limitMs = this.integrationMs * MEASURE_MARGIN + POLL_MS;
    for (let waited = 0; !((await this.reg(REG_STATUS2)) & AVALID); waited += POLL_MS) {
      if (waited > limitMs) throw new Error(`AS7341: no measurement after ${Math.round(limitMs)} ms`);
      await delay(POLL_MS);
    }
    const d = await this.bus.writeRead(this.address, [REG_ASTATUS], 13);
    return { ch: channelsOf(d), saturated: Boolean(d[0] & ASAT) };
  }

  // { f1..f8, clear, nir, saturated }: counts, two measurements (F1-F4,
  // then F5-F8; Clear and NIR from the second); saturated: a channel at its
  // top in either (lower the gain or the integration)
  async measure() {
    const a = await this.half(SMUX_F1F4);
    const b = await this.half(SMUX_F5F8);
    await this.bus.write(this.address, [REG_ENABLE, PON]);
    const [f1, f2, f3, f4] = a.ch;
    const [f5, f6, f7, f8, clear, nir] = b.ch;
    return { f1, f2, f3, f4, f5, f6, f7, f8, clear, nir, saturated: a.saturated || b.saturated };
  }

  // powered down
  async sleep() {
    await this.bus.write(this.address, [REG_ENABLE, 0]);
  }
}

As7341.addresses = [0x39];
As7341.GAINS = GAINS;
As7341.BANDS = BANDS;

export default As7341;
