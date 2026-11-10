// Goertek's SPL06-001: barometric pressure and temperature, at 0x77 (SDO
// high) or 0x76 (SDO to GND). Adapter-free: any I2C bus with write(address,
// bytes) and writeRead(address, bytes, n).
//
// Per its datasheet (Version 7.0; not in docs/: marked confidential by
// Goertek, though distributors publish it): ID (0Dh) 0x10, PROD_ID 1 and
// REV_ID 0 (Infineon's DPS310, of the same design, reads 0x10 too); after a
// soft reset (0Ch = 0x09) SENSOR_RDY (08h bit 6, 12 ms) and COEF_RDY (bit 7,
// 40 ms); the calibration coefficients at 10h-21h (Table 10: c0, c1 12 bits,
// c00, c10 20 bits, c01, c11, c20, c21, c30 16 bits, 2's complement); the
// results at 00h-05h, pressure then temperature, 24 bits 2's complement,
// MSB first. Compensation (5.6):
//   Praw_sc = Praw / kP,  Traw_sc = Traw / kT   (Table 4, by oversampling)
//   Pcomp = c00 + Praw_sc (c10 + Praw_sc (c20 + Praw_sc c30))
//           + Traw_sc c01 + Traw_sc Praw_sc (c11 + Praw_sc c21)   (Pa)
//   Tcomp = c0 / 2 + c1 Traw_sc   (C)
// Measured in the background (MEAS_CTRL 111), at one of its Table 5 use
// cases: weather (PRS_CFG 0x01, TMP_CFG 0x80), indoor navigation (0x14,
// 0x80, P shift), sports (0x26, 0xA0, P shift); a result shift is required
// above 8 times oversampling (CFG_REG). Temperature from the MEMS element's
// sensor (TMP_EXT, as the datasheet asks). Supply 1.7-3.6 V (4 V absolute
// maximum): 3.3 V, never 5 V, on a module without a regulator.

const ADDRESS = 0x77;
const REG_PSR = 0x00; // pressure then temperature, 6 bytes
const REG_PRS_CFG = 0x06;
const REG_TMP_CFG = 0x07;
const REG_MEAS_CFG = 0x08;
const REG_CFG = 0x09;
const REG_RESET = 0x0c;
const REG_ID = 0x0d;
const REG_COEF = 0x10;
const COEF_BYTES = 18;
const ID = 0x10;
const SOFT_RESET = 0x09;
const COEF_RDY = 0x80;
const SENSOR_RDY = 0x40;
const PRS_RDY = 0x10;
const MEAS_BACKGROUND = 0x07; // continuous pressure and temperature
const MEAS_IDLE = 0x00;
const P_SHIFT = 0x04;
const T_SHIFT = 0x08;
const PRC_MASK = 0x0f;
const RATE_SHIFT = 4;
const RATE_MASK = 0x07;
const READY_LIMIT_MS = 100; // SENSOR_RDY 12 ms, COEF_RDY 40 ms (Table 3), and a margin
const POLL_MS = 5;
const SHIFT_ABOVE = 3; // PRC codes above 0011 (8 times) need the shift
// Table 4: the scale factor by oversampling code (PRC 0000 single ... 0111 128 times)
const K = [524288, 1572864, 3670016, 7864320, 253952, 516096, 1040384, 2088960];
// Table 8: a measurement's time by oversampling code, ms (pressure; the
// temperature's alike)
const MEAS_MS = [3.6, 5.2, 8.4, 14.8, 27.6, 53.2, 104.4, 206.8];
// Table 5's use cases: PRS_CFG, TMP_CFG, and the shift they ask
export const MODES = {
  weather: { prs: 0x01, tmp: 0x80 }, // 5 Pa, 1 a second, ~6 uA
  indoor: { prs: 0x14, tmp: 0x80 }, // 10 cm, 2 a second, ~30 uA
  sports: { prs: 0x26, tmp: 0xa0 }, // 5 cm, 4 a second, ~200 uA
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// an n-bit 2's complement number
const signed = (v, bits) => (v & (1 << (bits - 1)) ? v - (1 << bits) : v);

// Table 10's coefficients from the 18 bytes at 10h
export function coefficients(b) {
  return {
    c0: signed((b[0] << 4) | (b[1] >> 4), 12),
    c1: signed(((b[1] & 0x0f) << 8) | b[2], 12),
    c00: signed((b[3] << 12) | (b[4] << 4) | (b[5] >> 4), 20),
    c10: signed(((b[5] & 0x0f) << 16) | (b[6] << 8) | b[7], 20),
    c01: signed((b[8] << 8) | b[9], 16),
    c11: signed((b[10] << 8) | b[11], 16),
    c20: signed((b[12] << 8) | b[13], 16),
    c21: signed((b[14] << 8) | b[15], 16),
    c30: signed((b[16] << 8) | b[17], 16),
  };
}

// 5.6's compensation: { pressure: Pa, temperature: C }
export function compensate(c, praw, traw, kP, kT) {
  const p = praw / kP;
  const t = traw / kT;
  return {
    pressure: c.c00 + p * (c.c10 + p * (c.c20 + p * c.c30)) + t * c.c01 + t * p * (c.c11 + p * c.c21),
    temperature: c.c0 * 0.5 + c.c1 * t,
  };
}

class Spl06 {
  static chip = {
    name: 'SPL06',
    async identify(bus, address) {
      const [id] = await bus.writeRead(address, [REG_ID], 1);
      return id === ID;
    },
  };

  constructor(bus, address = ADDRESS) {
    this.bus = bus;
    this.address = address;
  }

  async read(reg, n) {
    return this.bus.writeRead(this.address, [reg], n);
  }

  async write(reg, value) {
    await this.bus.write(this.address, [reg, value]);
  }

  // a soft reset, the coefficients read, measuring in the background at
  // mode: 'weather', 'indoor' or 'sports' (Table 5)
  async init({ mode = 'indoor' } = {}) {
    if (!(await Spl06.chip.identify(this.bus, this.address))) throw new Error('not an SPL06: its ID (0Dh) isn\'t 0x10');
    await this.write(REG_RESET, SOFT_RESET);
    const t0 = Date.now();
    for (;;) {
      await delay(POLL_MS);
      const [m] = await this.read(REG_MEAS_CFG, 1);
      if ((m & (COEF_RDY | SENSOR_RDY)) === (COEF_RDY | SENSOR_RDY)) break;
      if (Date.now() - t0 > READY_LIMIT_MS) throw new Error(`SPL06 not ready in ${READY_LIMIT_MS} ms (MEAS_CFG 0x${m.toString(16)})`);
    }
    this.coef = coefficients(await this.read(REG_COEF, COEF_BYTES));
    await this.configure({ mode });
  }

  // a Table 5 use case: its rates and oversampling, the shifts it needs,
  // measuring in the background
  async configure({ mode }) {
    const m = MODES[mode];
    if (!m) throw new Error(`SPL06: no mode ${mode}: ${Object.keys(MODES).join(', ')}`);
    const pPrc = m.prs & PRC_MASK;
    const tPrc = m.tmp & PRC_MASK;
    await this.write(REG_MEAS_CFG, MEAS_IDLE);
    // a measurement already running finishes under the old setting: its
    // result would be read with the new scale and shift (on r8845: 833.63
    // hPa among 1020.10s). Waited out (the old setting's longest, Table 8),
    // the results read once to clear their ready flags
    if (this.mode) {
      const old = MODES[this.mode];
      await delay(MEAS_MS[old.prs & PRC_MASK] + MEAS_MS[old.tmp & PRC_MASK] + POLL_MS);
      await this.read(REG_PSR, 6);
    }
    await this.write(REG_PRS_CFG, m.prs);
    await this.write(REG_TMP_CFG, m.tmp);
    await this.write(REG_CFG, (pPrc > SHIFT_ABOVE ? P_SHIFT : 0) | (tPrc > SHIFT_ABOVE ? T_SHIFT : 0));
    await this.write(REG_MEAS_CFG, MEAS_BACKGROUND);
    this.kP = K[pPrc];
    this.kT = K[tPrc];
    this.mode = mode;
    // how often a pressure result comes: PM_RATE, measurements a second
    this.periodMs = 1000 / (1 << ((m.prs >> RATE_SHIFT) & RATE_MASK));
  }

  // the next pressure result, the temperature with it: { pressure: Pa,
  // temperature: C }
  async measure() {
    const limit = 2 * this.periodMs + READY_LIMIT_MS;
    const t0 = Date.now();
    for (;;) {
      const [m] = await this.read(REG_MEAS_CFG, 1);
      if (m & PRS_RDY) break;
      if (Date.now() - t0 > limit) throw new Error(`SPL06: no pressure in ${limit} ms`);
      await delay(POLL_MS);
    }
    const d = await this.read(REG_PSR, 6);
    const praw = signed((d[0] << 16) | (d[1] << 8) | d[2], 24);
    const traw = signed((d[3] << 16) | (d[4] << 8) | d[5], 24);
    return compensate(this.coef, praw, traw, this.kP, this.kT);
  }

  // measuring stopped (standby)
  async sleep() {
    await this.write(REG_MEAS_CFG, MEAS_IDLE);
  }
}

Spl06.addresses = [ADDRESS, 0x76];
Spl06.MODES = MODES;

export default Spl06;
