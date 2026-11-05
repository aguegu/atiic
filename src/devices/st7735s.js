// Sitronix ST7735S: a TFT controller, here on a 0.96" 80x160 IPS module.
// Adapter-free: any bus with spi(bytes) and pins({ name: level }) (the CH341
// has both), and the names of the lines its CS, DC and RES are on. 4-wire
// SPI, write only (the module's MISO isn't wired), MSB first with no other
// order ("The MSB is transmitted first", 9.4 serial interface, page 44).
// The commands are MIPI DCS's, as the controller's datasheet lists them
// (Sitronix ST7735S V1.3, 2012-06-20: Crystalfontz keeps a copy,
// crystalfontz.com/controllers/uploaded/ST7735S_V1.3_20120620.pdf); the panel's settings (no
// inversion, BGR, its 80x160 at column 24 row 0 of the controller's 132x162)
// found on r8845's module by eye: inverted, red showed as cyan; at 26 and 1,
// a column and two rows of noise along the edges.
//
// Colours are 0xRRGGBB, as in CSS; the pixel format (12, 16 or 18 bits a
// pixel, COLMOD) decides how many of their bits reach the panel: 4, 5-6-5 or
// 6 a colour (the 4-line serial layouts, 9.8.20-22, pages 65-66). Tried on
// r8845's module: a ramp shows 16 steps in 12 bits, looks smooth in 18.

const SWRESET = 0x01;
const SLPOUT = 0x11;
const NORON = 0x13;
const INVOFF = 0x20;
const INVON = 0x21;
const DISPON = 0x29;
const CASET = 0x2a;
const RASET = 0x2b;
const RAMWR = 0x2c;
const MADCTL = 0x36;
const COLMOD = 0x3a;
const MADCTL_BGR = 0x08;
// the pixel formats: COLMOD's value, the bytes for n pixels, and the bytes
// themselves from 0xRRGGBB colours
const FORMATS = {
  // RGB 4-4-4: two pixels in three bytes, R1G1 B1R2 G2B2; an odd count's
  // last pixel padded with a zero nibble
  12: { colmod: 0x03, encode: (colors) => {
    const out = new Uint8Array(Math.ceil((colors.length * 3) / 2));
    let o = 0;
    for (let i = 0; i < colors.length; i += 2) {
      const a = colors[i], b = i + 1 < colors.length ? colors[i + 1] : 0;
      out[o++] = ((a >> 16) & 0xf0) | ((a >> 12) & 0x0f);
      out[o++] = (a & 0xf0) | ((b >> 20) & 0x0f);
      if (i + 1 < colors.length) out[o++] = ((b >> 8) & 0xf0) | ((b >> 4) & 0x0f);
    }
    return out;
  } },
  // RGB 5-6-5: two bytes a pixel, high byte first
  16: { colmod: 0x05, encode: (colors) => {
    const out = new Uint8Array(colors.length * 2);
    colors.forEach((c, i) => {
      const v = rgb565(c);
      out[2 * i] = v >> 8;
      out[2 * i + 1] = v & 0xff;
    });
    return out;
  } },
  // RGB 6-6-6: a byte a colour, its top six bits
  18: { colmod: 0x06, encode: (colors) => {
    const out = new Uint8Array(colors.length * 3);
    colors.forEach((c, i) => {
      out[3 * i] = (c >> 16) & 0xfc;
      out[3 * i + 1] = (c >> 8) & 0xfc;
      out[3 * i + 2] = c & 0xfc;
    });
    return out;
  } },
};
const RESET_LOW_MS = 20;
const RESET_WAIT_MS = 150; // after RES and after SWRESET (the datasheet asks 120)
const SLPOUT_WAIT_MS = 150; // the datasheet asks 120 before the next command
const DISPON_WAIT_MS = 50;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 0xRRGGBB to RGB 5-6-5
const rgb565 = (c) => ((c >> 8) & 0xf800) | ((c >> 5) & 0x07e0) | ((c >> 3) & 0x001f);

// the pixels' bytes for a pixel format: colours 0xRRGGBB
export function encodePixels(colors, bits = 16) {
  return FORMATS[bits].encode(colors);
}

class St7735s {
  constructor(bus, {
    cs = 'D2', dc = 'D1', res = 'D0',
    width = 80, height = 160, xOffset = 24, yOffset = 0, invert = false, bgr = true,
    bits = 16,
  } = {}) {
    if (!FORMATS[bits]) throw new Error(`${bits} bits a pixel: 12, 16 or 18`);
    Object.assign(this, { bus, cs, dc, res, width, height, xOffset, yOffset, invert, bgr, bits });
  }

  // a command and its parameters: CS low, DC low for the command, high for
  // the parameters, CS high
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
    await delay(RESET_LOW_MS);
    await this.bus.pins({ [this.res]: true });
    await delay(RESET_WAIT_MS);
    await this.command(SWRESET);
    await delay(RESET_WAIT_MS);
    await this.command(SLPOUT);
    await delay(SLPOUT_WAIT_MS);
    await this.command(COLMOD, [FORMATS[this.bits].colmod]);
    await this.command(MADCTL, [this.bgr ? MADCTL_BGR : 0]);
    await this.command(this.invert ? INVON : INVOFF);
    await this.command(NORON);
    await this.command(DISPON);
    await delay(DISPON_WAIT_MS);
  }

  // the window the next pixels fill, in the panel's coordinates
  async window(x, y, w, h) {
    const x0 = x + this.xOffset, y0 = y + this.yOffset;
    await this.command(CASET, [x0 >> 8, x0 & 0xff, (x0 + w - 1) >> 8, (x0 + w - 1) & 0xff]);
    await this.command(RASET, [y0 >> 8, y0 & 0xff, (y0 + h - 1) >> 8, (y0 + h - 1) & 0xff]);
  }

  // a rectangle of one colour (0xRRGGBB)
  async fillRect(x, y, w, h, color) {
    await this.draw(x, y, w, h, new Array(w * h).fill(color));
  }

  async fill(color) {
    await this.fillRect(0, 0, this.width, this.height, color);
  }

  // w x h pixels, 0xRRGGBB each, row by row
  async draw(x, y, w, h, pixels) {
    await this.window(x, y, w, h);
    await this.command(RAMWR, encodePixels(pixels, this.bits));
  }
}

export default St7735s;
