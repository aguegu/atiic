// TI's OPT3001: an ambient light sensor, in lux, its spectral response
// matched to the human eye; at 0x44, 0x45, 0x46 or 0x47 by its ADDR pin
// (GND, VDD, SDA, SCL; Table 1). Adapter-free: any I2C bus with
// write(address, bytes) and writeRead(address, bytes, n). Registers 16 bits,
// MSB first, by a pointer.
//
// Per its datasheet (SBOS681C, revised November 2017, docs/): the result at
// 0x00, a 4-bit exponent E and a 12-bit mantissa R,
//   lux = 0.01 x 2^E x R   (Equation 3; 0.01 to 83865.6 lux)
// the configuration at 0x01 (Table 10: RN[3:0] the range, 1100b automatic;
// CT the conversion time, 100 or 800 ms; M[1:0] shutdown, single-shot or
// continuous; OVF overflow, CRF conversion ready, FH and FL the limits'
// flags; L, POL, ME, FC[1:0] the interrupt's); the limits at 0x02 and 0x03;
// its manufacturer ID 0x5449 ("TI") at 0x7E and device ID 0x3001 at 0x7F:
// how a bench knows it (chip.identify). Set up here automatic-ranging and
// continuous, 800 ms (the specified resolution; Table 10's CT) or 100 ms:
// a read gives the last conversion. init() waits for the first by its CRF
// (cleared by a read of the configuration), at most the longest conversion,
// 880 ms or 110 ms (7.5), plus its 10-ms range assessment and the 3 ms
// it reports in, twice over.
// On ours its pointer ignores bit 7: 0xFE and 0xFF read the IDs too, so an
// INA231's check (TI's ID at 0xFE) would take it (devices/ina231.js turns
// its 0x3001 away).
const REG_RESULT = 0x00;
const REG_CONFIG = 0x01;
const REG_MANUFACTURER = 0x7e;
const REG_DEVICE = 0x7f;
const TI = 0x5449;
export const DEVICE_ID = 0x3001;
const RN_AUTO = 0xc000; // RN[3:0] 1100b
const CT_800 = 0x0800;
const M_CONTINUOUS = 0x0400; // 10b
const M_MASK = 0x0600;
const L = 0x0010; // its reset: latched window-style
const OVF = 0x0100;
const CRF = 0x0080;
const READ_ONLY = 0x01e0; // OVF, CRF, FH, FL: left out of a write back
// the conversion times, ms: CT's two; their longest (7.5), with the range
// assessment and the 3 ms a result takes to report
export const CONVERSION_MS = { 800: 880, 100: 110 };
const ASSESS_MS = 10 + 3;
const POLL_MS = 10;
const LSB_LUX = 0.01;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the result register's 16 bits as lux (Equation 3)
export function luxOf(word) {
  return LSB_LUX * 2 ** (word >> 12) * (word & 0x0fff);
}

class Opt3001 {
  static chip = {
    name: 'OPT3001',
    // TI's manufacturer ID and its device ID
    async identify(bus, address) {
      try {
        const [mh, ml] = await bus.writeRead(address, [REG_MANUFACTURER], 2);
        const [dh, dl] = await bus.writeRead(address, [REG_DEVICE], 2);
        return ((mh << 8) | ml) === TI && ((dh << 8) | dl) === DEVICE_ID;
      } catch {
        return false;
      }
    },
  };

  // conversionMs: 800 (the default, its specified resolution) or 100
  constructor(bus, address = 0x44, { conversionMs = 800 } = {}) {
    if (!CONVERSION_MS[conversionMs]) throw new Error(`OPT3001: no conversion time ${conversionMs} ms: ${Object.keys(CONVERSION_MS).join(', ')}`);
    this.bus = bus;
    this.address = address;
    this.conversionMs = conversionMs;
  }

  async config() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_CONFIG], 2);
    return (h << 8) | l;
  }

  // automatic range, continuous, the conversion time; the first result waited for
  async init() {
    const c = RN_AUTO | (this.conversionMs === 800 ? CT_800 : 0) | M_CONTINUOUS | L;
    await this.bus.write(this.address, [REG_CONFIG, c >> 8, c & 0xff]);
    const limitMs = 2 * (CONVERSION_MS[this.conversionMs] + ASSESS_MS);
    for (let waited = 0; waited < limitMs; waited += POLL_MS) {
      await delay(POLL_MS);
      if ((await this.config()) & CRF) return;
    }
    throw new Error(`OPT3001 at 0x${this.address.toString(16)}: no conversion ready after ${limitMs} ms`);
  }

  // lux, the last conversion
  async lux() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_RESULT], 2);
    return luxOf((h << 8) | l);
  }

  // { lux, overflow }: the last conversion; overflow: past its 83865.6 lux
  // (OVF, with the automatic range)
  async measure() {
    const lux = await this.lux();
    return { lux, overflow: Boolean((await this.config()) & OVF) };
  }

  // shutdown: no conversions (init() starts them again)
  async sleep() {
    const c = (await this.config()) & ~M_MASK & ~READ_ONLY;
    await this.bus.write(this.address, [REG_CONFIG, c >> 8, c & 0xff]);
  }
}

Opt3001.addresses = [0x44, 0x45, 0x46, 0x47];
Opt3001.CONVERSION_MS = CONVERSION_MS;

export default Opt3001;
