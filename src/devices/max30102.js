// Maxim's (Analog Devices') MAX30102: a pulse oximeter and heart-rate
// sensor, a red and an IR LED and a photodiode, at 0x57. Adapter-free: any
// I2C bus with write(address, bytes) and writeRead(address, bytes, n).
//
// Registers and tables per its datasheet (19-7740 Rev 1, 10/18, docs/): the
// LEDs pulse, the ADC integrates the light that comes back, and samples (red
// and IR, 3 bytes each, 18 bits left-justified) queue in a 32-sample FIFO.
// A finger on it: the light the blood absorbs pulses with the heartbeat.
// This driver gives the samples; heart rate and SpO2 are what a page makes
// of them.

const REG_FIFO_WR_PTR = 0x04; // then OVF_COUNTER 0x05, FIFO_RD_PTR 0x06
const REG_FIFO_DATA = 0x07; // reading it doesn't advance the address: a burst reads samples on
const REG_FIFO_CONFIG = 0x08; // SMP_AVE[7:5], FIFO_ROLLOVER_EN[4], FIFO_A_FULL[3:0]
const REG_MODE_CONFIG = 0x09; // SHDN[7], RESET[6], MODE[2:0]
const REG_SPO2_CONFIG = 0x0a; // SPO2_ADC_RGE[6:5], SPO2_SR[4:2], LED_PW[1:0]
const REG_LED1_PA = 0x0c; // red, then IR at 0x0d: 0.2 mA a step (Table 8)
const REG_TEMP_INT = 0x1f; // then TEMP_FRAC 0x20 (0.0625 C steps, bits 3:0)
const REG_TEMP_CONFIG = 0x21; // TEMP_EN[0]: a reading, self-clearing
const REG_PART_ID = 0xff;

const SHDN = 0x80;
const RESET = 0x40;
const MODES = { hr: 0x02, spo2: 0x03 }; // Table 4: red only; red and IR
const SAMPLE_RATES = [50, 100, 200, 400, 800, 1000, 1600, 3200]; // Table 6: SPO2_SR, a sample a second
const PULSE_WIDTHS = [69, 118, 215, 411]; // Table 7: LED_PW, us (15-18 bits)
const ADC_RANGES = [2048, 4096, 8192, 16384]; // Table 5: SPO2_ADC_RGE, nA full scale
const AVERAGES = [1, 2, 4, 8, 16, 32]; // Table 3: SMP_AVE
const MA_PER_STEP = 0.2; // Table 8
const FIFO_DEPTH = 32;
const SAMPLE_MASK = 0x3ffff; // 18 bits, left-justified
const RESET_POLL_MS = 1;
const TEMP_POLL_MS = 5; // a reading takes 29 ms (TT)
const POLL_LIMIT = 100;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Max30102 {
  static chip = { name: 'MAX30102', idRegister: REG_PART_ID, whoAmI: 0x15 };

  constructor(bus, address = 0x57) {
    this.bus = bus;
    this.address = address;
  }

  // a reset, then: mode 'spo2' (red and IR) or 'hr' (red); sampleRate the
  // ADC's, averaged by average into the FIFO (so sampleRate / average
  // samples a second); pulseWidth us (18 bits at 411); adcRange nA full
  // scale; red and ir the LEDs' currents, mA. Defaults: 100 samples a
  // second, 18 bits, about 7 mA each
  async init({ mode = 'spo2', sampleRate = 400, average = 4, pulseWidth = 411, adcRange = 4096, red = 7, ir = 7 } = {}) {
    const pick = (list, v, what) => {
      const i = list.indexOf(v);
      if (i < 0) throw new Error(`${what} ${v}: one of ${list.join(', ')}`);
      return i;
    };
    if (!(mode in MODES)) throw new Error(`mode ${mode}: spo2 or hr`);
    const sr = pick(SAMPLE_RATES, sampleRate, 'sample rate'), pw = pick(PULSE_WIDTHS, pulseWidth, 'pulse width');
    const rge = pick(ADC_RANGES, adcRange, 'ADC range'), ave = pick(AVERAGES, average, 'average');
    const current = (mA, what) => {
      const code = Math.round(mA / MA_PER_STEP);
      if (code < 0 || code > 0xff) throw new Error(`${what} LED ${mA} mA: 0-51`);
      return code;
    };
    const [id] = await this.bus.writeRead(this.address, [REG_PART_ID], 1);
    if (id !== Max30102.chip.whoAmI) throw new Error(`part ID 0x${id.toString(16)}, not a MAX30102`);
    await this.bus.write(this.address, [REG_MODE_CONFIG, RESET]);
    await this.until(REG_MODE_CONFIG, RESET, RESET_POLL_MS);
    await this.bus.write(this.address, [REG_FIFO_CONFIG, ave << 5]);
    await this.bus.write(this.address, [REG_SPO2_CONFIG, (rge << 5) | (sr << 2) | pw]);
    await this.bus.write(this.address, [REG_LED1_PA, current(red, 'red'), current(ir, 'IR')]);
    await this.bus.write(this.address, [REG_FIFO_WR_PTR, 0, 0, 0]);
    await this.bus.write(this.address, [REG_MODE_CONFIG, MODES[mode]]);
    this.mode = mode;
    this.sampleBytes = mode === 'spo2' ? 6 : 3;
    this.rate = sampleRate / average; // samples a second into the FIFO
  }

  // until a register's bits clear
  async until(reg, bits, pollMs) {
    for (let i = 0; i < POLL_LIMIT; i++) {
      const [v] = await this.bus.writeRead(this.address, [reg], 1);
      if (!(v & bits)) return;
      await delay(pollMs);
    }
    throw new Error(`register 0x${reg.toString(16)} bits 0x${bits.toString(16)} never cleared`);
  }

  // the samples queued, oldest first: { red, ir } (spo2) or { red } (hr),
  // ADC counts (18 bits). Throws when the FIFO filled and samples were lost
  // (it keeps the oldest: read it more often than every 32 samples)
  async readFifo() {
    const [wr, ovf, rd] = await this.bus.writeRead(this.address, [REG_FIFO_WR_PTR], 3);
    if (ovf) {
      await this.bus.write(this.address, [REG_FIFO_WR_PTR, 0, 0, 0]);
      throw new Error(`MAX30102 FIFO overflowed: ${ovf} samples lost`);
    }
    const n = (wr - rd) & (FIFO_DEPTH - 1);
    if (!n) return [];
    const d = await this.bus.writeRead(this.address, [REG_FIFO_DATA], n * this.sampleBytes);
    const at = (o) => ((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]) & SAMPLE_MASK;
    return Array.from({ length: n }, (_, i) => {
      const o = i * this.sampleBytes;
      return this.mode === 'spo2' ? { red: at(o), ir: at(o + 3) } : { red: at(o) };
    });
  }

  // the die's temperature, C: one reading (29 ms)
  async temperature() {
    await this.bus.write(this.address, [REG_TEMP_CONFIG, 1]);
    await this.until(REG_TEMP_CONFIG, 1, TEMP_POLL_MS);
    const [whole, frac] = await this.bus.writeRead(this.address, [REG_TEMP_INT], 2);
    return ((whole << 24) >> 24) + (frac & 0x0f) * 0.0625;
  }

  // power-save: the LEDs off, the registers kept
  async sleep() {
    await this.bus.write(this.address, [REG_MODE_CONFIG, SHDN]);
  }
}

Max30102.addresses = [0x57];

export default Max30102;
