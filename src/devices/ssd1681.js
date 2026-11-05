// Solomon Systech SSD1681: an e-paper controller for up to 200x200, here on a
// 1.54" 200x200 black/white module (r8845). Its commands, RAM and operation
// flow are the SSD1680's (SSD1681 Rev 1.1, Apr 2021, 9.1: Newhaven Display
// keeps a copy): the Ssd1680 driver with 200x200 as its defaults. On r8845's
// module, all of it as on the SSD1680's: the RAM window at 0, 0 whole, the
// orientation as drawn, partial updates clean, the RAM through sleep and
// wake. A full update keeps BUSY high 1,682-1,685 ms, a partial 494-498 ms
// (the panel's waveforms, faster than the 152x152's).
import Ssd1680 from './ssd1680.js';

class Ssd1681 extends Ssd1680 {
  constructor(bus, options = {}) {
    super(bus, { width: 200, height: 200, ...options });
  }
}

export default Ssd1681;
