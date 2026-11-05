// Sitronix ST7302: an ultra-low-power mono TFT driver, here on a 2.13"
// 250x122 reflective module (r8845). Not e-paper: the picture needs power,
// and there is no BUSY: a frame is in the moment it's sent. Adapter-free:
// any bus with spi(bytes) and pins({ name: level }), and the lines its CS,
// DC and RES are on.
//
// The set-up is zhcong/ST7302-for-arduino's (MIT, ST7302SPI::begin): the
// datasheet (Sitronix ST7302 V0.0, 2018/02) names the commands but gives no
// panel's values. Its RAM, as that driver packs it and r8845's module shows
// it: a column address per band of 12 pixels along the 122 side (bands
// 0x19-0x23: 11, the last 2 pixels past the panel), a row address per pair
// of pixels along the 250 side, and per address 3 bytes, 4 lines of the band
// each, a line 2 bits (the pair, the even pixel the higher), 1 dark.
//
// Frames are frame.js's (1 white), upright as the module is held on r8845:
// 122 wide, 250 tall; that's the RAM's landscape turned a quarter clockwise
// (landscape x = Y, y = 121 - X). On r8845's module all of 122x250 shows:
// a diagonal of 3 pixels from a frame 3 in, to each corner, whole.
//
// Frame rates (FRCTRL B2h): the glass is redrawn 16 or 32 times a second in
// high power mode (HPM, 38h), 0.25-8 in low power mode (LPM, 39h). On
// r8845's module, a square moved a frame every 100 ms: HPM at 16 and 32 Hz
// blinked too much (with zhcong's set-up, tuned for LPM), LPM at 8 Hz left
// ghosts, at 4 Hz fine; zhcong's set-up sets no rate, and LPM at its default
// moved nothing in 0.8 s. So init() ends in LPM at 4 Hz; frameRate() changes
// it.

const SLPOUT = 0x11;
const DISPON = 0x29;
const CASET = 0x2a;
const RASET = 0x2b;
const RAMWR = 0x2c;
const HPM = 0x38; // high power mode
const LPM = 0x39; // low power mode
const FRCTRL = 0xb2; // frame rate: [HFR, LFR]
const HPM_RATES = { 16: 0, 32: 1 }; // HFR, Hz
const LPM_RATES = { 0.25: 0, 0.5: 1, 1: 2, 2: 3, 4: 4, 8: 5 }; // LFR[2:0], Hz
const DEFAULT_RATE = 4; // LPM: on r8845's module, moving content without ghosts or blinking
const BAND = 12; // pixels along the short side a column address covers
const FIRST_BAND = 0x19;
const RESET_MS = 100; // zhcong's waits, low and after
const SLPOUT_WAIT_MS = 100;
const CLEAR_RAM_MS = 100;
// zhcong's set-up before the sleep out, as [command, ...parameters]
const POWER_SETUP = [
  [HPM],
  [0xeb, 0x02], // enable OTP
  [0xd7, 0x68], // OTP load control
  [0xd1, 0x01], // auto power control
  [0xc0, 0x80], // gate voltage: VGH 12 V, VGL -5 V
  [0xc1, 0x28, 0x28, 0x28, 0x28, 0x14, 0x00], // VSH
  [0xc2, 0x00, 0x00, 0x00, 0x00], // VSL
  [0xcb, 0x14], // VCOMH
  [0xb4, 0xe5, 0x77, 0xf1, 0xff, 0xff, 0x4f, 0xf1, 0xff, 0xff, 0x4f], // gate EQ
];
// and after it, to the display on
const PANEL_SETUP = [
  [0xc7, 0xa6, 0xe9], // OSC
  [0xb0, 0x64], // duty
  [0x36, 0x20], // memory data access control
  [0x3a, 0x11], // data format: 3 writes for 24 bits
  [0xb9, 0x23], // source setting
  [0xb8, 0x09], // panel setting: frame inversion
  [CASET, 0x05, 0x36], // column address: S61-S182
  [RASET, 0x00, 0xc7], // row address: G1-G250
  [0xd0, 0x1f],
  [DISPON],
];
const CLEAR_RAM_ON = [0xb9, 0xe3];
const CLEAR_RAM_OFF = [0xb9, 0x23];
const DESTRESS_OFF = [0x72, 0x00];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// a frame (frame.js: upright, 1 white) as the RAM takes it: per band, per
// pair, 3 bytes of 4 lines, 1 dark
export function packFrame(frame, width, height) {
  const rowBytes = Math.ceil(width / 8), bands = Math.ceil(width / BAND), pairs = Math.ceil(height / 2);
  const dark = (X, Y) => X >= 0 && X < width && Y < height && !((frame[Y * rowBytes + (X >> 3)] << (X & 7)) & 0x80);
  const out = new Uint8Array(bands * pairs * 3);
  let o = 0;
  for (let b = 0; b < bands; b++) for (let p = 0; p < pairs; p++) for (let q = 0; q < 3; q++) {
    let byte = 0;
    for (let r = 0; r < 4; r++) {
      const X = width - 1 - (b * BAND + q * 4 + r), Y = 2 * p; // landscape y = b * 12 + q * 4 + r, x = 2p
      if (dark(X, Y)) byte |= 0x80 >> (2 * r);
      if (dark(X, Y + 1)) byte |= 0x40 >> (2 * r);
    }
    out[o++] = byte;
  }
  return out;
}

class St7302 {
  constructor(bus, { cs = 'D2', dc = 'D1', res = 'D0', width = 122, height = 250 } = {}) {
    Object.assign(this, { bus, cs, dc, res, width, height });
  }

  async command(c, data = []) {
    await this.bus.pins({ [this.cs]: false, [this.dc]: false });
    await this.bus.spi([c]);
    if (data.length) {
      await this.bus.pins({ [this.dc]: true });
      await this.bus.spi(data);
    }
    await this.bus.pins({ [this.cs]: true });
  }

  async init() {
    await this.bus.pins({ [this.cs]: true, [this.dc]: true, [this.res]: true });
    await this.bus.pins({ [this.res]: false });
    await delay(RESET_MS);
    await this.bus.pins({ [this.res]: true });
    await delay(RESET_MS);
    for (const [c, ...d] of POWER_SETUP) await this.command(c, d);
    await this.command(SLPOUT);
    await delay(SLPOUT_WAIT_MS);
    for (const [c, ...d] of PANEL_SETUP) await this.command(c, d);
    await this.command(CLEAR_RAM_ON[0], [CLEAR_RAM_ON[1]]);
    await delay(CLEAR_RAM_MS);
    await this.command(CLEAR_RAM_OFF[0], [CLEAR_RAM_OFF[1]]);
    await this.command(DESTRESS_OFF[0], [DESTRESS_OFF[1]]);
    this.hfr = HPM_RATES[32];
    await this.frameRate(DEFAULT_RATE);
  }

  // how often the glass is redrawn, Hz: 16 or 32 in high power mode, 0.25,
  // 0.5, 1, 2, 4 or 8 in low power mode (the mode follows the rate)
  async frameRate(hz) {
    if (hz in HPM_RATES) {
      this.hfr = HPM_RATES[hz];
      await this.command(FRCTRL, [this.hfr, this.lfr ?? LPM_RATES[DEFAULT_RATE]]);
      await this.command(HPM);
    } else if (hz in LPM_RATES) {
      this.lfr = LPM_RATES[hz];
      await this.command(FRCTRL, [this.hfr ?? HPM_RATES[32], this.lfr]);
      await this.command(LPM);
    } else {
      throw new Error(`${hz} Hz: 16 or 32 (high power), 0.25, 0.5, 1, 2, 4 or 8 (low power)`);
    }
    this.rate = hz;
  }

  // a whole frame (frame.js, upright) into the RAM: on the panel at once
  async show(frame) {
    const bands = Math.ceil(this.width / BAND), pairs = Math.ceil(this.height / 2);
    await this.command(CASET, [FIRST_BAND, FIRST_BAND + bands - 1]);
    await this.command(RASET, [0, pairs - 1]);
    await this.command(RAMWR, packFrame(frame, this.width, this.height));
  }
}

export default St7302;
