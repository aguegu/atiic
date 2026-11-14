// ASAIR's (Aosong's) AGS2602: a TVOC sensor (a heated metal-oxide film on a
// MEMS hotplate, its resistance falling as VOCs rise), at 0x1A.
// Adapter-free: any I2C bus with write(address, bytes) and read(address, n).
//
// Per its manual (AGS2602 说明书, 2026-04/05, section 4): registers of four
// data bytes and a CRC. A read: the register written, a stop, then 5 bytes
// read (Data1-4, then CRC8 over them: initial 0xFF, polynomial 0x31). 0x00
// the concentration: Data1 bit 0 RDY (0: updated; 1: not yet, or warming
// up), Data2-4 the reading in ppb (0-30000 ppb), high byte first; 0x11 the
// version (four bytes, their layout not given); 0x20 the resistance, Data1-4
// high first, x 10 ohm. The bus at 100 kHz at most; a new value every 2 s
// or slower; 120 s warm-up at least, 30-60 minutes after days unpowered.
// Its supply is 5 V (4.75-5.25 V), the pull-ups to it (1-10 kOhm).
//
// identify(): the version read with a good CRC. Aosong's AGS10 (also 0x1A)
// speaks the same registers and CRC (its datasheet, 2022), but at 15 kHz at
// most: a bench probing faster doesn't read it.
//
// r8845's AGS2602 (on the CH347T at 20 kHz, 5 V, 2026-11-14): version
// 19 09 0d 01; 647440 ohm; 100 ppb with RDY 0, minutes after power-up.

export const CONCENTRATION = 0x00;
export const VERSION = 0x11;
export const RESISTANCE = 0x20;
export const MAX_SCL_HZ = 100000; // the manual, 4: "通讯速率不高于100kHz"
export const SAMPLE_MS = 2000; // the manual, Table 1: "采样周期 ≥2s"
export const WARMUP_S = 120; // the manual, Table 1: "预热时间 ≥120s"
const OHMS_PER_COUNT = 10; // the manual, 4.4: "实际阻值 = Res × 10"
const RDY = 0x01; // Data1 bit 0: 1 = not updated, or warming up

// the manual's CRC8, 4.6: initial 0xFF, polynomial 0x31 (x8 + x5 + x4 + 1)
export function crc8(bytes) {
  let c = 0xff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

const hex = (b) => `0x${b.toString(16).padStart(2, '0')}`;

// one register's four data bytes, the CRC checked
async function readRegister(bus, address, reg) {
  await bus.write(address, [reg]);
  const d = await bus.read(address, 5);
  if (crc8(d.slice(0, 4)) !== d[4]) {
    throw new Error(`AGS2602 CRC: ${hex(d[4])} for ${[...d.slice(0, 4)].map(hex).join(' ')} (register ${hex(reg)})`);
  }
  return d.slice(0, 4);
}

class Ags2602 {
  static chip = {
    name: 'AGS2602',
    maxSclHz: MAX_SCL_HZ,
    // no ID register: its version reads with a good CRC
    async identify(bus, address) {
      try {
        await readRegister(bus, address, VERSION);
        return true;
      } catch {
        return false;
      }
    },
  };

  constructor(bus, address = 0x1a) {
    this.bus = bus;
    this.address = address;
  }

  async register(reg) {
    return readRegister(this.bus, this.address, reg);
  }

  // the four version bytes as read (the manual gives no layout)
  async version() {
    return [...(await this.register(VERSION))];
  }

  // the sensing film's resistance, ohms
  async resistance() {
    const [a, b, c, d] = await this.register(RESISTANCE);
    return (((a << 24) | (b << 16) | (c << 8) | d) >>> 0) * OHMS_PER_COUNT;
  }

  // { tvoc: ppb, ready: false while not updated or warming up (RDY set) }
  async measure() {
    const [status, a, b, c] = await this.register(CONCENTRATION);
    return { tvoc: (a << 16) | (b << 8) | c, ready: (status & RDY) === 0 };
  }
}

Ags2602.addresses = [0x1a];

export default Ags2602;
