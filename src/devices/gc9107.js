// GalaxyCore GC9107, here on a 1.45" 60x160 IPS module (r8845). The commands
// and pixel formats are DcsPanel's (dcs-panel.js); the chip's own, per its
// datasheet (GC9107 DataSheet V1.2: Espressif keeps a copy,
// dl.espressif.com/AE/esp-iot-solution/GC9107_DataSheet_V1.2.pdf): a 128x160
// frame memory (TFA + VSA + BFA = 160, 6.2.21), COLMOD 3/5/6 for 12/16/18
// bits, as the ST7735S. For 12 bits the datasheet says both 001 (6.2.28)
// and 011 (4.2.2's 4-line serial); on r8845's module 011 shows the 12-bit
// card, 001 nothing at all (the two side by side).
//
// Its panel needs the chip's inner registers set: the standard commands
// alone left a white haze over a quarter of the screen. The values are
// Espressif's esp_lcd_gc9107 defaults (vendor_specific_init_default),
// behind the inter register enables FE and EF (6.3.1-2, as Display_Lib_RPI
// sends them); the datasheet documents few of them. With them set the panel
// shows inverted unless INVON. The module's settings found by eye: inverted,
// BGR, its 60x160 at column 34 row 0 (the memory's middle: all four edges
// of a border, nothing of the memory around it).
import DcsPanel from './dcs-panel.js';

class Gc9107 extends DcsPanel {
  static chip = {
    name: 'GC9107',
    memoryRows: 160,
    colmod: { 12: 0x03, 16: 0x05, 18: 0x06 },
    setup: [
      [0xfe], [0xef], // inter register enable 1, 2
      [0xb0, 0xc0], [0xb2, 0x2f], [0xb3, 0x03], [0xb6, 0x19], [0xb7, 0x01],
      [0xac, 0xcb], [0xab, 0x0e], [0xb4, 0x04], [0xa8, 0x19], [0xb8, 0x08],
      [0xe8, 0x24], [0xe9, 0x48], [0xea, 0x22], [0xc6, 0x30], [0xc7, 0x18],
      [0xf0, 0x1f, 0x28, 0x04, 0x3e, 0x2a, 0x2e, 0x20, 0x00, 0x0c, 0x06, 0x00, 0x1c, 0x1f, 0x0f], // gamma
      [0xf1, 0x00, 0x2d, 0x2f, 0x3c, 0x6f, 0x1c, 0x0b, 0x00, 0x00, 0x00, 0x07, 0x0d, 0x11, 0x0f],
    ],
    defaults: { width: 60, height: 160, xOffset: 34, yOffset: 0, invert: true, bgr: true },
  };
}

export default Gc9107;
