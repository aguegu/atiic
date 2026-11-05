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
const COLMOD_16BIT = 0x05; // RGB565, two bytes a pixel, high byte first
const RESET_LOW_MS = 20;
const RESET_WAIT_MS = 150; // after RES and after SWRESET (the datasheet asks 120)
const SLPOUT_WAIT_MS = 150; // the datasheet asks 120 before the next command
const DISPON_WAIT_MS = 50;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// a colour as the panel takes it: 5 bits red, 6 green, 5 blue
export const rgb565 = (r, g, b) => ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);

class St7735s {
  constructor(bus, {
    cs = 'D2', dc = 'D1', res = 'D0',
    width = 80, height = 160, xOffset = 24, yOffset = 0, invert = false, bgr = true,
  } = {}) {
    Object.assign(this, { bus, cs, dc, res, width, height, xOffset, yOffset, invert, bgr });
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
    await this.command(COLMOD, [COLMOD_16BIT]);
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

  // a rectangle of one colour (rgb565)
  async fillRect(x, y, w, h, color) {
    const px = new Uint8Array(w * h * 2);
    for (let i = 0; i < px.length; i += 2) { px[i] = color >> 8; px[i + 1] = color & 0xff; }
    await this.window(x, y, w, h);
    await this.command(RAMWR, px);
  }

  async fill(color) {
    await this.fillRect(0, 0, this.width, this.height, color);
  }

  // w x h pixels, rgb565 each, row by row
  async draw(x, y, w, h, pixels) {
    const px = new Uint8Array(w * h * 2);
    pixels.forEach((c, i) => { px[2 * i] = c >> 8; px[2 * i + 1] = c & 0xff; });
    await this.window(x, y, w, h);
    await this.command(RAMWR, px);
  }
}

export default St7735s;
