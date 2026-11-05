// Sitronix ST7735S, here on a 0.96" 80x160 IPS module (r8845). The commands
// and pixel formats are DcsPanel's (dcs-panel.js); the chip's own, per its
// datasheet (Sitronix ST7735S V1.3, 2012-06-20: Crystalfontz keeps a copy,
// crystalfontz.com/controllers/uploaded/ST7735S_V1.3_20120620.pdf): a 132x162
// frame memory (TFA + VSA + BFA = 162, 10.1.26), COLMOD 3/5/6 (10.1.32), no
// setup beyond the standard commands. The module's settings found by eye:
// no inversion (inverted, red showed as cyan), BGR, its 80x160 at column 24
// row 0 (at 26 and 1, a column and two rows of noise along the edges).
import DcsPanel, { encodePixels } from './dcs-panel.js';

class St7735s extends DcsPanel {
  static chip = {
    name: 'ST7735S',
    memoryRows: 162,
    colmod: { 12: 0x03, 16: 0x05, 18: 0x06 },
    setup: [],
    defaults: { width: 80, height: 160, xOffset: 24, yOffset: 0, invert: false, bgr: true },
  };
}

export { encodePixels };
export default St7735s;
