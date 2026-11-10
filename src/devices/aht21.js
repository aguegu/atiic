// Aosong's AHT21B: relative humidity and temperature, at 0x38. Adapter-free:
// any I2C bus with write(address, bytes), read(address, n) and
// writeRead(address, bytes, n).
//
// Per its datasheet (V1.0, May 2021, docs/), 7.4: after power-on (100 ms) the
// status byte (command 0x71) must have 0x18 set; else registers 0x1B, 0x1C
// and 0x1E need Aosong's initialisation routine, which the datasheet points
// to but doesn't give: refused here. A measurement: 0xAC 0x33 0x00, 80 ms or
// more, then 7 bytes: the status (bit 7 busy), 20 bits of humidity, 20 bits
// of temperature, a CRC-8 (1 + x4 + x5 + x8, from 0xFF).
//   RH = S / 2^20 x 100 (%),  T = S / 2^20 x 200 - 50 (C)
// Measure every 2 s or more (4.4: the sensor warms itself, under 0.1 C so).
// On r8845's module: status 0x18; 28.1 C, 67.7 % RH.

const ADDRESS = 0x38;
const STATUS = 0x71;
const TRIGGER = [0xac, 0x33, 0x00];
const STATUS_READY = 0x18; // 7.4: these bits set, else Aosong's routine first
const BUSY = 0x80;
const MEASURE_MS = 80; // 7.4: wait 80 ms, then poll the busy bit
const BUSY_POLL_MS = 10;
const BUSY_LIMIT = 20;
const FULL_SCALE = 1 << 20;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the datasheet's CRC-8: 1 + x4 + x5 + x8 (0x31), from 0xFF
export function crc8(bytes) {
  let c = 0xff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

class Aht21 {
  static chip = {
    name: 'AHT21B',
    // no ID: its status byte, the calibration bits set and not busy (no
    // measurement started): 0xFF, what a device with nothing at 0x71 reads
    // (a BH1745NUC at 0x38), isn't one
    async identify(bus, address) {
      const [s] = await bus.writeRead(address, [STATUS], 1);
      return (s & STATUS_READY) === STATUS_READY && !(s & BUSY);
    },
  };

  constructor(bus, address = ADDRESS) {
    this.bus = bus;
    this.address = address;
  }

  async status() {
    const [s] = await this.bus.writeRead(this.address, [STATUS], 1);
    return s;
  }

  // the status checked (7.4, step 1)
  async init() {
    const s = await this.status();
    if ((s & STATUS_READY) !== STATUS_READY) {
      throw new Error(`AHT21B status 0x${s.toString(16)}: needs Aosong's initialisation of 0x1B, 0x1C, 0x1E first`);
    }
  }

  // { temperature: C, humidity: % } (~80 ms), its CRC checked
  async measure() {
    await this.bus.write(this.address, TRIGGER);
    await delay(MEASURE_MS);
    let d;
    for (let i = 0; ; i++) {
      d = await this.bus.read(this.address, 7);
      if (!(d[0] & BUSY)) break;
      if (i >= BUSY_LIMIT) throw new Error('AHT21B still busy');
      await delay(BUSY_POLL_MS);
    }
    if (crc8(d.slice(0, 6)) !== d[6]) throw new Error(`AHT21B CRC: 0x${d[6].toString(16)}`);
    const rh = (d[1] << 12) | (d[2] << 4) | (d[3] >> 4);
    const t = ((d[3] & 0x0f) << 16) | (d[4] << 8) | d[5];
    return { temperature: (t / FULL_SCALE) * 200 - 50, humidity: (rh / FULL_SCALE) * 100 };
  }
}

Aht21.addresses = [ADDRESS];

export default Aht21;
