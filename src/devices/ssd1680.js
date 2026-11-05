// Solomon Systech SSD1680: an e-paper controller, here on a 1.54" 152x152
// black/white module (r8845). Adapter-free: any bus with spi(bytes),
// pins({ name: level }) and readPins() (the CH341 has all three), and the
// names of the lines its CS, DC, RES and BUSY are on. 4-wire SPI, write only,
// MSB first (Rev 1.4, 6.1.2).
//
// The datasheet's operation flow (SSD1680 Rev 1.4, Apr 2021, 9.1: Newhaven
// Display keeps a copy, support.newhavendisplay.com, "SSD1680"): reset,
// SWRESET, gates (01h), RAM window (11h, 44h, 45h), border (3Ch),
// temperature (18h); then the image into RAM (24h) and a full update (22h
// F7h, 20h), BUSY high until it's done. RAM is a bit a pixel, 1 white, the
// leftmost pixel in a byte's MSB; X addresses count bytes. On r8845's module
// the RAM window at 0, 0 shows whole, its top-left at the panel's, and a
// full update keeps BUSY high 2.10 s (2,101-2,106 ms), after about 58 ms of
// sending the two RAMs over the CH341.
//
// A partial update is the chip's display mode 2 (22h FFh: as F7h, with mode
// 2's waveform from the panel's OTP): it drives only the pixels that differ
// between RAM 24h (the new image) and RAM 26h (the previous one), with no
// flash. On r8845's module BUSY is high 588-594 ms, a moving square left no
// ghost and the rest of the panel stayed clean over eight in a row. RAM 26h
// holds the last image shown, so this driver is for black/white panels: on
// a three-colour one that RAM is red.

const SWRESET = 0x12;
const DRIVER_OUTPUT = 0x01;
const DATA_ENTRY = 0x11;
const DATA_ENTRY_XY_INC = 0x03; // X then Y, both increasing
const RAM_X_WINDOW = 0x44;
const RAM_Y_WINDOW = 0x45;
const BORDER = 0x3c;
const BORDER_LUT1 = 0x05; // VBD on GS transition, following LUT1 (the command table, 3Ch: A[7:6] 00, A[2] 1, A[1:0] 01)
const TEMPERATURE = 0x18;
const TEMPERATURE_INTERNAL = 0x80;
const RAM_X = 0x4e;
const RAM_Y = 0x4f;
const WRITE_BW = 0x24;
const WRITE_PREVIOUS = 0x26; // the previous image, for mode 2 (red on three-colour panels)
const UPDATE_CONTROL_2 = 0x22;
const UPDATE_FULL = 0xf7; // clock and analog on, temperature, LUT from OTP, display mode 1, off
const UPDATE_PARTIAL = 0xff; // the same with display mode 2
const ACTIVATE = 0x20;
const DEEP_SLEEP = 0x10;
const DEEP_SLEEP_KEEP_RAM = 0x01;
const RESET_LOW_MS = 10;
const RESET_WAIT_MS = 10; // after RES and after SWRESET (9.1: "Wait 10ms")
const BUSY_POLL_MS = 5;
const BUSY_LIMIT_MS = 10000; // a full update takes ~2.1 s on r8845's module, a partial ~0.59

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// a frame for width x height: a bit a pixel, all white
export function blankFrame(width, height) {
  return new Uint8Array(Math.ceil(width / 8) * height).fill(0xff);
}

// a pixel in a frame black (true) or white
export function plot(frame, width, x, y, black = true) {
  const i = y * Math.ceil(width / 8) + (x >> 3), bit = 0x80 >> (x & 7);
  frame[i] = black ? frame[i] & ~bit : frame[i] | bit;
}

class Ssd1680 {
  constructor(bus, { cs = 'D2', dc = 'D1', res = 'D0', busy = 'D4', width = 152, height = 152 } = {}) {
    Object.assign(this, { bus, cs, dc, res, busy, width, height, rowBytes: Math.ceil(width / 8) });
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

  // until BUSY goes low; how long it was high, ms
  async waitBusy() {
    const t0 = Date.now();
    while ((await this.bus.readPins())[this.busy]) {
      if (Date.now() - t0 > BUSY_LIMIT_MS) throw new Error(`BUSY still high after ${BUSY_LIMIT_MS} ms`);
      await delay(BUSY_POLL_MS);
    }
    return Date.now() - t0;
  }

  async init() {
    this.shown = false;
    await this.bus.pins({ [this.cs]: true, [this.dc]: true, [this.res]: true });
    await this.bus.pins({ [this.res]: false });
    await delay(RESET_LOW_MS);
    await this.bus.pins({ [this.res]: true });
    await delay(RESET_WAIT_MS);
    await this.waitBusy();
    await this.command(SWRESET);
    await delay(RESET_WAIT_MS);
    await this.waitBusy();
    const last = this.height - 1;
    await this.command(DRIVER_OUTPUT, [last & 0xff, last >> 8, 0x00]);
    await this.command(DATA_ENTRY, [DATA_ENTRY_XY_INC]);
    await this.command(RAM_X_WINDOW, [0, this.rowBytes - 1]);
    await this.command(RAM_Y_WINDOW, [0, 0, last & 0xff, last >> 8]);
    await this.command(BORDER, [BORDER_LUT1]);
    await this.command(TEMPERATURE, [TEMPERATURE_INTERNAL]);
  }

  async ram(c, bytes) {
    await this.command(RAM_X, [0]);
    await this.command(RAM_Y, [0, 0]);
    await this.command(c, bytes);
  }

  // a whole frame (blankFrame, plot) shown by a full update (display mode
  // 1: the panel flashes): into both RAMs, the second the previous image
  // for showPartial(); how long the panel took, ms
  async show(frame) {
    await this.ram(WRITE_BW, frame);
    await this.ram(WRITE_PREVIOUS, frame);
    await this.command(UPDATE_CONTROL_2, [UPDATE_FULL]);
    await this.command(ACTIVATE);
    this.shown = true;
    return this.waitBusy();
  }

  // a whole frame shown by a partial update (display mode 2: only the
  // pixels that changed since the last frame shown, no flash); a full one
  // when nothing has been shown since init(). How long the panel took, ms
  async showPartial(frame) {
    if (!this.shown) return this.show(frame);
    await this.ram(WRITE_BW, frame);
    await this.command(UPDATE_CONTROL_2, [UPDATE_PARTIAL]);
    await this.command(ACTIVATE);
    const ms = await this.waitBusy();
    await this.ram(WRITE_PREVIOUS, frame);
    return ms;
  }

  // deep sleep, the RAM kept: init() again to wake it
  async sleep() {
    await this.command(DEEP_SLEEP, [DEEP_SLEEP_KEEP_RAM]);
  }
}

export default Ssd1680;
