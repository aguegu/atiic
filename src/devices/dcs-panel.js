// A TFT controller on MIPI DCS commands, over 4-wire SPI: what the
// ST7735S and the GC9107 share (st7735s.js, gc9107.js give each chip's own).
// Adapter-free: any bus with spi(bytes) and pins({ name: level }) (the CH341
// has both), and the names of the lines its CS, DC and RES are on. Write
// only (the modules' MISO isn't wired), MSB first: both datasheets say so,
// with no other order.
//
// Colours are 0xRRGGBB, as in CSS; the pixel format (12, 16 or 18 bits a
// pixel, COLMOD) decides how many of their bits reach the panel: 4, 5-6-5 or
// 6 a colour, in the same 4-line serial layouts on both chips (ST7735S
// 9.8.20-22, GC9107 4.2.2). Tried on r8845's ST7735S module: a
// ramp shows 16 steps in 12 bits, looks smooth in 18.
//
// Scrolling is the controller's (VSCRDEF 33h, VSCSAD 37h): it shows its
// memory's rows from a start line on, wrapping around, so a strip chart
// draws one new row a step instead of a whole screen. Along the rows only:
// the panel's long side, left to right held landscape.

const SWRESET = 0x01;
const SLPOUT = 0x11;
const NORON = 0x13;
const INVOFF = 0x20;
const INVON = 0x21;
const DISPON = 0x29;
const CASET = 0x2a;
const RASET = 0x2b;
const RAMWR = 0x2c;
const SCRLAR = 0x33;
const MADCTL = 0x36;
const VSCSAD = 0x37;
const COLMOD = 0x3a;
const MADCTL_BGR = 0x08;
// the pixel formats' bytes from 0xRRGGBB colours (COLMOD's values are the
// chip's: chip.colmod)
const FORMATS = {
  // RGB 4-4-4: two pixels in three bytes, R1G1 B1R2 G2B2; an odd count's
  // last pixel padded with a zero nibble
  12: { encode: (colors) => {
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
  16: { encode: (colors) => {
    const out = new Uint8Array(colors.length * 2);
    colors.forEach((c, i) => {
      const v = rgb565(c);
      out[2 * i] = v >> 8;
      out[2 * i + 1] = v & 0xff;
    });
    return out;
  } },
  // RGB 6-6-6: a byte a colour, its top six bits
  18: { encode: (colors) => {
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

class DcsPanel {
  // a chip's own: its name, its frame memory's rows (TFA + VSA + BFA must
  // make them), COLMOD's value for each pixel format, the commands its
  // panels need after MADCTL ([command, ...parameters]), and its module's
  // defaults (width, height, xOffset, yOffset, invert, bgr)
  static chip = null;

  constructor(bus, options = {}) {
    const { chip } = this.constructor;
    const o = { cs: 'D2', dc: 'D1', res: 'D0', yOffset: 0, invert: false, bgr: true, bits: 16, ...chip.defaults, ...options };
    if (!chip.colmod[o.bits]) throw new Error(`${o.bits} bits a pixel: 12, 16 or 18`);
    const { cs, dc, res, width, height, xOffset, yOffset, invert, bgr, bits } = o;
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
    const { chip } = this.constructor;
    await this.command(COLMOD, [chip.colmod[this.bits]]);
    await this.command(MADCTL, [this.bgr ? MADCTL_BGR : 0]);
    for (const [c, ...data] of chip.setup) await this.command(c, data);
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

  // the scroll area: the panel's rows between `top` fixed rows and `bottom`
  // fixed rows (the memory's rows past the panel fixed too). Shows from its
  // first row until scroll()
  async scrollArea(top = 0, bottom = 0) {
    const tfa = this.yOffset + top, vsa = this.height - top - bottom, bfa = this.constructor.chip.memoryRows - tfa - vsa;
    if (vsa < 1) throw new Error(`no rows left to scroll: ${top} + ${bottom} of ${this.height}`);
    this.scrolling = { top, rows: vsa };
    await this.command(SCRLAR, [tfa >> 8, tfa & 0xff, vsa >> 8, vsa & 0xff, bfa >> 8, bfa & 0xff]);
    await this.scroll(0);
  }

  // the scroll area shown from its row `n` (wrapping): the row before it
  // shows last. A strip chart draws its newest row at scrollRow(n) and calls
  // scroll(n + 1)
  async scroll(n) {
    const ssa = this.yOffset + this.scrollRow(n);
    await this.command(VSCSAD, [ssa >> 8, ssa & 0xff]);
  }

  // the panel row (for draw()'s y) of the scroll area's row n
  scrollRow(n) {
    const { top, rows } = this.scrolling;
    return top + (((n % rows) + rows) % rows);
  }

  // back to the plain display: rows where they're drawn
  async scrollOff() {
    this.scrolling = null;
    await this.command(NORON);
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

export default DcsPanel;
