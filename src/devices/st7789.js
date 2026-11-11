// Sitronix ST7789, here on a 240x320 module. The commands and pixel formats
// are DcsPanel's (dcs-panel.js); the chip's own, per its datasheet (Sitronix
// ST7789V Version 1.3, 2014/03: Newhaven Display keeps a copy,
// newhavendisplay.com/appnotes/datasheets/LCDs/ST7789V.pdf): a 240x320x18
// frame memory (its features list), its scroll definition TFA, VSA and BFA
// (9.1.25), COLMOD 0x53/0x55/0x66 for 12/16/18 bits a pixel (9.1.32: the
// low bits the SPI's format, 011/101/110; its Note 2 asks 55h for 16 bits,
// the high bits the RGB interface's, unused over SPI). No setup beyond the
// standard commands: its power-on defaults. The module's settings found by
// eye on r8845 (2026-11-11, the user): inverted (without INVON a white
// ground, each colour its complement: red cyan, green purple, blue yellow,
// white black), RGB order, the memory's 240x320 at 0, 0 (a 1-pixel frame at
// its edge whole on all four sides).
import DcsPanel from './dcs-panel.js';

class St7789 extends DcsPanel {
  static chip = {
    name: 'ST7789',
    memoryRows: 320,
    colmod: { 12: 0x53, 16: 0x55, 18: 0x66 },
    setup: [],
    defaults: { width: 240, height: 320, xOffset: 0, yOffset: 0, invert: true, bgr: false },
  };
}

export default St7789;
