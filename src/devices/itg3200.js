// InvenSense's ITG-3200: a 3-axis gyroscope with a temperature sensor, at
// 0x68 or 0x69 (AD0). Adapter-free: any I2C bus with write(address, bytes)
// and writeRead(address, bytes, n).
//
// Per its product specification: revision 1.4 (docs/ITG-3200.pdf) for the
// register map (later revisions moved it to a separate document), 1.7
// (docs/itg-3200-datasheet.pdf) for the figures. Set up as it asks: a
// reset (PWR_MGM H_RESET), the X gyro as the clock reference ("highly
// recommended", CLK_SEL 1), FS_SEL 3 (+/-2000 deg/s: "set to 03h for proper
// operation", the only range; 14.375 LSb per deg/s), DLPF_CFG 2 (98 Hz,
// sampled at 1 kHz: the noise spec's setting), SMPLRT_DIV 0 (1 kHz). Data
// 0x1B-0x22: temperature, X, Y, Z, each MSB first, two's complement, read
// in one block. Temperature: 280 LSb/C, -13200 LSb at 35 C.
//
// WHO_AM_I (0x00) holds its address's bits 6-1 (110100); bit 0 isn't
// defined (r8845's part reads 0x69 at 0x68). An MPU-6050 also sits at 0x68:
// the bench tells them apart by 0x75 (an MPU's WHO_AM_I: 0x68, 0x70).

const REG_WHO_AM_I = 0x00;
const REG_SMPLRT_DIV = 0x15;
// DLPF_FS (0x16) written after SMPLRT_DIV in one burst
const REG_TEMP_OUT_H = 0x1b;
const REG_PWR_MGM = 0x3e;
const REG_MPU_WHO_AM_I = 0x75;
const ID_MASK = 0x7e; // bits 6-1
const ID = 0x68; // 110100 in bits 6-1
const MPU_IDS = [0x68, 0x70]; // MPU-6050, MPU-6500
const H_RESET = 0x80;
const SLEEP = 0x40;
const CLK_PLL_X = 0x01;
const FS_2000 = 0x18; // FS_SEL 3 in bits 4-3
const DLPF_98HZ = 0x02; // 1 kHz internal
const DIV_1KHZ = 0x00;
const LSB_PER_DPS = 14.375;
const TEMP_LSB_PER_C = 280;
const TEMP_OFFSET_LSB = -13200; // at 35 C
const TEMP_OFFSET_C = 35;
const STARTUP_MS = 20; // "start-up time for register read/write" (1.7, 3.2)
const SETTLE_MS = 50; // gyro start-up: ZRO to +/-1 deg/s of final (1.7, 3.1); the PLL's 1 ms inside it

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the eight data bytes as raw temperature and x, y, z
export function parseData(d) {
  const s16 = (i) => (((d[i] << 8) | d[i + 1]) << 16) >> 16;
  return { temperature: s16(0), x: s16(2), y: s16(4), z: s16(6) };
}

export const celsius = (raw) => TEMP_OFFSET_C + (raw - TEMP_OFFSET_LSB) / TEMP_LSB_PER_C;

class Itg3200 {
  static chip = {
    name: 'ITG-3200',
    // WHO_AM_I's address bits, and not an MPU's WHO_AM_I at 0x75
    async identify(bus, address) {
      const [id] = await bus.writeRead(address, [REG_WHO_AM_I], 1);
      if ((id & ID_MASK) !== ID) return false;
      const [mpu] = await bus.writeRead(address, [REG_MPU_WHO_AM_I], 1);
      return !MPU_IDS.includes(mpu);
    },
  };

  constructor(bus, address = 0x68) {
    this.bus = bus;
    this.address = address;
  }

  // reset; the X gyro's PLL; +/-2000 deg/s, 98 Hz, 1 kHz; settled
  async init() {
    const [id] = await this.bus.writeRead(this.address, [REG_WHO_AM_I], 1);
    if ((id & ID_MASK) !== ID) throw new Error(`no ITG-3200 at 0x${this.address.toString(16)} (WHO_AM_I 0x${id.toString(16)})`);
    await this.bus.write(this.address, [REG_PWR_MGM, H_RESET]);
    await delay(STARTUP_MS);
    await this.bus.write(this.address, [REG_PWR_MGM, CLK_PLL_X]);
    await this.bus.write(this.address, [REG_SMPLRT_DIV, DIV_1KHZ, FS_2000 | DLPF_98HZ]);
    await delay(SETTLE_MS);
  }

  // the latest sample: deg/s, and its temperature (C)
  async measure() {
    const r = parseData(await this.bus.writeRead(this.address, [REG_TEMP_OUT_H], 8));
    return {
      gyroscopes: { x: r.x / LSB_PER_DPS, y: r.y / LSB_PER_DPS, z: r.z / LSB_PER_DPS },
      temperature: celsius(r.temperature),
    };
  }

  // sleep: the serial interface and registers stay (init() wakes it)
  async sleep() {
    await this.bus.write(this.address, [REG_PWR_MGM, SLEEP | CLK_PLL_X]);
  }
}

Itg3200.addresses = [0x68, 0x69];

export default Itg3200;
