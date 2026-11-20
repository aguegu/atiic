// Maxim's (Analog Devices') MAX30100: a pulse oximeter and heart-rate sensor,
// a red and an IR LED and a photodiode, at 0x57; the MAX30102's elder, its
// registers laid out differently. Adapter-free: any I2C bus with
// write(address, bytes) and writeRead(address, bytes, n).
//
// Per its datasheet (19-7065 Rev 0, 9/14, docs/MAX30100-19-7065.pdf): the
// LEDs pulse, the ADC integrates the light that comes back, and samples (IR
// then red, 16 bits each, MSB first, left-justified: 13 to 16 bits by the
// pulse width, Table 5) queue in a 16-sample FIFO at 0x05 (a burst there
// reads on through the samples, Figure 2). Interrupt status 0x00 (bit 6
// TEMP_RDY, bit 0 PWR_RDY; cleared by its read), enable 0x01; FIFO_WR_PTR
// 0x02, OVF_COUNTER 0x03, FIFO_RD_PTR 0x04; mode 0x06 (SHDN, RESET,
// TEMP_EN, MODE: 2 heart rate, IR only; 3 SpO2, IR and red); SpO2 config
// 0x07 (SPO2_HI_RES_EN, "set this bit high"; the sample rate, Table 4; the
// pulse width, Table 5), LED currents 0x09 (red in bits 7-4, IR in 3-0,
// Table 6's steps); the die temperature 0x16 (integer, two's complement)
// and 0x17 (sixteenths, added even to a negative integer), 29 ms a reading;
// its revision 0xFE and part ID 0x11 at 0xFF. Not every sample rate goes
// with every pulse width (Tables 8, 9): init() refuses the rest, as the
// chip would quietly pick another. This driver gives the samples; heart
// rate and SpO2 are what a page makes of them.
// On ours: revision 0x05.

const REG_INT_STATUS = 0x00;
const REG_INT_ENABLE = 0x01;
const TEMP_RDY = 0x40; // in both
const REG_FIFO_WR_PTR = 0x02; // then OVF_COUNTER 0x03, FIFO_RD_PTR 0x04
const REG_FIFO_DATA = 0x05;
const REG_MODE_CONFIG = 0x06;
const REG_SPO2_CONFIG = 0x07;
const REG_LED_CONFIG = 0x09;
const REG_TEMP_INT = 0x16; // then TEMP_FRAC 0x17
const REG_PART_ID = 0xff;
export const PART_ID = 0x11;

const SHDN = 0x80;
const RESET = 0x40;
const TEMP_EN = 0x08;
const SPO2_HI_RES_EN = 0x40;
const MODES = { hr: 0x02, spo2: 0x03 }; // Table 3: IR only; IR and red
export const SAMPLE_RATES = [50, 100, 167, 200, 400, 600, 800, 1000]; // Table 4
export const PULSE_WIDTHS = [200, 400, 800, 1600]; // Table 5, us: 13-16 bits
// Tables 8 and 9: the fastest sample rate each pulse width allows, by mode
const FASTEST = {
  spo2: { 200: 1000, 400: 400, 800: 200, 1600: 100 },
  hr: { 200: 1000, 400: 1000, 800: 200, 1600: 100 },
};
export const LED_MA = [0, 4.4, 7.6, 11.0, 14.2, 17.4, 20.8, 24.0, 27.1, 30.6, 33.8, 37.0, 40.2, 43.6, 46.8, 50.0]; // Table 6
const FIFO_DEPTH = 16;
const SAMPLE_BYTES = 4;
const RESET_POLL_MS = 1;
const TEMP_POLL_MS = 2; // a reading takes 29 ms (Figure 3)
const POLL_LIMIT = 100;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the nearest of Table 6's currents to mA: its code
function ledCode(mA, what) {
  if (!(mA >= 0 && mA <= LED_MA.at(-1))) throw new Error(`${what} LED ${mA} mA: 0-${LED_MA.at(-1)}`);
  let best = 0;
  LED_MA.forEach((v, i) => { if (Math.abs(v - mA) < Math.abs(LED_MA[best] - mA)) best = i; });
  return best;
}

class Max30100 {
  static chip = { name: 'MAX30100', idRegister: REG_PART_ID, whoAmI: PART_ID };

  constructor(bus, address = 0x57) {
    this.bus = bus;
    this.address = address;
  }

  // a reset, then: mode 'spo2' (IR and red) or 'hr' (IR); sampleRate a
  // second; pulseWidth us (16 bits at 1600); red and ir the LEDs' currents,
  // mA (Table 6's nearest). Defaults: 100 a second, 16 bits, 7.6 mA each
  async init({ mode = 'spo2', sampleRate = 100, pulseWidth = 1600, red = 7.6, ir = 7.6 } = {}) {
    if (!(mode in MODES)) throw new Error(`mode ${mode}: spo2 or hr`);
    const sr = SAMPLE_RATES.indexOf(sampleRate), pw = PULSE_WIDTHS.indexOf(pulseWidth);
    if (sr < 0) throw new Error(`sample rate ${sampleRate}: one of ${SAMPLE_RATES.join(', ')}`);
    if (pw < 0) throw new Error(`pulse width ${pulseWidth}: one of ${PULSE_WIDTHS.join(', ')}`);
    if (sampleRate > FASTEST[mode][pulseWidth]) throw new Error(`${sampleRate} a second with ${pulseWidth} us: ${FASTEST[mode][pulseWidth]} at most in ${mode} mode`);
    const leds = (ledCode(red, 'red') << 4) | ledCode(ir, 'IR');
    const [id] = await this.bus.writeRead(this.address, [REG_PART_ID], 1);
    if (id !== PART_ID) throw new Error(`part ID 0x${id.toString(16)}, not a MAX30100`);
    await this.bus.write(this.address, [REG_MODE_CONFIG, RESET]);
    await this.until(REG_MODE_CONFIG, RESET, RESET_POLL_MS);
    await this.bus.write(this.address, [REG_SPO2_CONFIG, SPO2_HI_RES_EN | (sr << 2) | pw]);
    await this.bus.write(this.address, [REG_LED_CONFIG, leds]);
    await this.bus.write(this.address, [REG_INT_ENABLE, TEMP_RDY]); // temperature() waits on its flag
    await this.bus.write(this.address, [REG_FIFO_WR_PTR, 0, 0, 0]);
    await this.bus.write(this.address, [REG_MODE_CONFIG, MODES[mode]]);
    this.mode = mode;
    this.rate = sampleRate;
  }

  // until a register's bits clear (set: until they're set)
  async until(reg, bits, pollMs, set = false) {
    for (let i = 0; i < POLL_LIMIT; i++) {
      const [v] = await this.bus.writeRead(this.address, [reg], 1);
      if (set ? v & bits : !(v & bits)) return;
      await delay(pollMs);
    }
    throw new Error(`register 0x${reg.toString(16)} bits 0x${bits.toString(16)} never ${set ? 'set' : 'cleared'}`);
  }

  // the samples queued, oldest first: { ir, red } (spo2) or { ir } (hr),
  // ADC counts (16 bits, left-justified). Throws when the FIFO filled and
  // samples were lost (read it more often than every 16 samples)
  async readFifo() {
    const [wr, ovf, rd] = await this.bus.writeRead(this.address, [REG_FIFO_WR_PTR], 3);
    if (ovf) {
      await this.bus.write(this.address, [REG_FIFO_WR_PTR, 0, 0, 0]);
      throw new Error(`MAX30100 FIFO overflowed: ${ovf} samples lost`);
    }
    const n = (wr - rd) & (FIFO_DEPTH - 1);
    if (!n) return [];
    const d = await this.bus.writeRead(this.address, [REG_FIFO_DATA], n * SAMPLE_BYTES);
    return Array.from({ length: n }, (_, i) => {
      const o = i * SAMPLE_BYTES;
      const ir = (d[o] << 8) | d[o + 1];
      return this.mode === 'spo2' ? { ir, red: (d[o + 2] << 8) | d[o + 3] } : { ir };
    });
  }

  // the die's temperature, C: one reading (29 ms), done when TEMP_RDY sets
  // (init() enables it); the mode kept
  async temperature() {
    await this.bus.writeRead(this.address, [REG_INT_STATUS], 1); // an old flag cleared
    const [m] = await this.bus.writeRead(this.address, [REG_MODE_CONFIG], 1);
    await this.bus.write(this.address, [REG_MODE_CONFIG, m | TEMP_EN]);
    await this.until(REG_INT_STATUS, TEMP_RDY, TEMP_POLL_MS, true);
    const [whole, frac] = await this.bus.writeRead(this.address, [REG_TEMP_INT], 2);
    return ((whole << 24) >> 24) + (frac & 0x0f) * 0.0625;
  }

  // power-save: the LEDs off, the registers kept
  async sleep() {
    const [m] = await this.bus.writeRead(this.address, [REG_MODE_CONFIG], 1);
    await this.bus.write(this.address, [REG_MODE_CONFIG, m | SHDN]);
  }
}

Max30100.addresses = [0x57];

export default Max30100;
