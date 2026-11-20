// Lite-On's AP3216C: ambient light (ALS), proximity (PS) by its own IR LED,
// and the IR level, in one package, at 0x1E. Adapter-free: any I2C bus with
// write(address, bytes) and writeRead(address, bytes, n).
//
// Per its datasheet (Rev0.86, docs/AP3216C-Rev0.86.pdf; Rev0.80 beside it):
// the system mode at 0x00 (0 power down, 1 ALS, 2 PS+IR, 3 ALS and PS+IR,
// 4 a software reset, its registers back to default after 10 ms); IR at
// 0x0A-0x0B (10 bits: 0x0B the high 8, 0x0A bits 1-0; 0x0A bit 7 IR_OF),
// ALS at 0x0C-0x0D (16 bits), PS at 0x0E-0x0F (10 bits: 0x0F bits 5-0 the
// high 6, 0x0E bits 3-0; bit 7 of either OBJ, an object near, bit 6 IR_OF,
// the PS invalid in strong IR); the ALS range at 0x10 bits 5-4. Each pair
// low byte first: reading the low byte holds the high one for the read after.
// Conversions: ALS 100 ms, PS+IR 12.5 ms, alternately 112.5 ms (mode 3).
// On ours a burst read wraps within its register pair (0x2A, 0x2B, 0x2A,
// ...): each pair read on its own here.
// Lux per count: the datasheet disagrees with itself. Rev0.86's register
// section gives ranges of 20661, 5162, 1291 and 323 lux (its "0.35
// lux/count" for the first fits none of them: 20661 / 65535 is 0.315); its
// electrical characteristics, and Rev0.80 throughout, 23360, 5840, 1460 and
// 365 (0.36 lux/count; 128 lux reading 360 counts). FULL_SCALE_LUX takes
// the latter: both revisions give it, from a measured point, each range 4x
// the next. Not checked against a reference: read it as a level that rises
// and falls with the light, not an exact lux.
// On the CJMCU-3216 module: VCC (3.3 V, no regulator), and VLED, its IR
// LED's own supply: unwired, no proximity. Proximity not tried on our
// bench yet (it read 0 with nothing near).
// No ID register: chip.identify checks the bits its datasheet reserves as 0
// (an HMC5883L, also at 0x1E, reads "H43" from 0x0A: 0x48 has bit 6 set).
const REG_SYSTEM = 0x00;
const REG_IR = 0x0a;
const REG_ALS = 0x0c;
const REG_PS = 0x0e;
const REG_ALS_CONFIG = 0x10;
const REG_PS_INT_MODE = 0x22;
const REG_PS_MEAN_TIME = 0x23;
const REG_PS_WAIT = 0x24;
export const MODE = { powerDown: 0x00, als: 0x01, psIr: 0x02, all: 0x03, reset: 0x04 };
const RESET_MS = 10;
// the first results after mode 3 starts: its 112.5 ms twice, as its "once"
// modes take 2.5 conversions to theirs
const FIRST_MS = 250;
const ALS_RANGE_SHIFT = 4;
// the four ALS ranges by their full scale, lux, at 65535 counts (see above)
export const FULL_SCALE_LUX = [23360, 5840, 1460, 365];
const COUNTS = 65535;
const IR_OF = 0x80; // 0x0A bit 7
const OBJ = 0x80; // 0x0F bit 7
const PS_IR_OF = 0x40; // 0x0F bit 6
// registers whose reserved bits read 0: register, mask
const RESERVED = [[REG_SYSTEM, 0xf8], [REG_IR, 0x7c], [REG_ALS_CONFIG, 0xc0], [REG_PS_INT_MODE, 0xfe], [REG_PS_MEAN_TIME, 0xfc], [REG_PS_WAIT, 0xc0]];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the three pairs as read: [low, high] each
export function decode(ir, als, ps) {
  return {
    ir: (ir[1] << 2) | (ir[0] & 0x03),
    als: als[0] | (als[1] << 8),
    proximity: ((ps[1] & 0x3f) << 4) | (ps[0] & 0x0f),
    near: Boolean(ps[1] & OBJ),
    irOverflow: Boolean(ir[0] & IR_OF) || Boolean(ps[1] & PS_IR_OF),
  };
}

class Ap3216c {
  static chip = {
    name: 'AP3216C',
    // no ID: the reserved bits of six registers all 0
    async identify(bus, address) {
      try {
        for (const [reg, mask] of RESERVED) {
          const [v] = await bus.writeRead(address, [reg], 1);
          if (v & mask) return false;
        }
        return true;
      } catch {
        return false;
      }
    },
  };

  // range: 0-3, the ALS's full scale (FULL_SCALE_LUX; 0, the widest, its
  // default: 0.36 lux a count)
  constructor(bus, address = 0x1e, { range = 0 } = {}) {
    if (!FULL_SCALE_LUX[range]) throw new Error(`AP3216C: no range ${range}: 0-${FULL_SCALE_LUX.length - 1}`);
    this.bus = bus;
    this.address = address;
    this.range = range;
  }

  async mode(m) {
    await this.bus.write(this.address, [REG_SYSTEM, m]);
  }

  // a software reset, the range, then ALS and PS+IR alternately; the first
  // results waited for
  async init() {
    await this.mode(MODE.reset);
    await delay(RESET_MS);
    await this.bus.write(this.address, [REG_ALS_CONFIG, this.range << ALS_RANGE_SHIFT]);
    await this.mode(MODE.all);
    await delay(FIRST_MS);
  }

  async pair(reg) {
    return this.bus.writeRead(this.address, [reg], 2);
  }

  // { lux, als, ir, proximity, near, irOverflow }: the last results; als,
  // ir and proximity in counts (16, 10 and 10 bits), near: an object within
  // its PS thresholds (OBJ), irOverflow: the IR too strong for the PS
  async measure() {
    const r = decode(await this.pair(REG_IR), await this.pair(REG_ALS), await this.pair(REG_PS));
    return { lux: (r.als * FULL_SCALE_LUX[this.range]) / COUNTS, ...r };
  }

  // power down (init() starts it again)
  async sleep() {
    await this.mode(MODE.powerDown);
  }
}

Ap3216c.addresses = [0x1e];
Ap3216c.FULL_SCALE_LUX = FULL_SCALE_LUX;

export default Ap3216c;
