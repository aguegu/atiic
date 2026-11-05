// Melexis' MLX90614: an infrared thermometer (the object's temperature, no
// contact, and its own), at 0x5A on SMBus. Adapter-free: any I2C bus with
// writeRead(address, bytes, n) (a repeated start between).
//
// Per its datasheet (Rev 021, 02-Jun-2026, docs/): RAM read by its address
// as the command (0x06 Ta, 0x07 Tobj1, 0x08 Tobj2), EEPROM by 0x20 | its
// address; each answer 2 bytes low first and a PEC, a CRC-8 (x8 + x2 + x1 +
// 1) over the slave address written, the command, the address read and the
// two bytes (its Figure 6: 0x30 for 0x3AD2 read from 0x07). A temperature
// is 0.02 K a count; its MSb set flags an error. Config Register 1 (EEPROM
// 0x05) bit 6 tells a dual-zone part: on a single, Tobj2 means nothing.
// SMBus clock 10-100 kHz. On r8845's module: single zone, Ta ~28 C.

const RAM_TA = 0x06;
const RAM_TOBJ1 = 0x07;
const RAM_TOBJ2 = 0x08;
const EEPROM = 0x20; // | the EEPROM address
const EE_CONFIG_1 = 0x05;
const EE_ID_FIRST = 0x1c; // the ID number, 4 words
const CONFIG_DUAL = 0x40; // bit 6
const ERROR_FLAG = 0x8000;
const KELVIN_PER_COUNT = 0.02;
const ZERO_C_IN_K = 273.15;

// the datasheet's PEC: CRC-8, x8 + x2 + x1 + 1, from 0
export function pec(bytes) {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

// a word read: { value, ok } (ok: its PEC checked)
async function readWord(bus, address, command) {
  const [lo, hi, p] = await bus.writeRead(address, [command], 3);
  return { value: lo | (hi << 8), ok: pec([address << 1, command, (address << 1) | 1, lo, hi]) === p };
}

class Mlx90614 {
  static chip = {
    name: 'MLX90614',
    // no ID register to compare: its config register read with a good PEC
    async identify(bus, address) {
      return (await readWord(bus, address, EEPROM | EE_CONFIG_1)).ok;
    },
  };

  constructor(bus, address = 0x5a) {
    this.bus = bus;
    this.address = address;
  }

  async word(command) {
    const { value, ok } = await readWord(this.bus, this.address, command);
    if (!ok) throw new Error(`MLX90614 PEC wrong reading 0x${command.toString(16)}`);
    return value;
  }

  // its config: single or dual zone
  async init() {
    this.config = await this.word(EEPROM | EE_CONFIG_1);
    this.dual = Boolean(this.config & CONFIG_DUAL);
  }

  // its 64-bit ID number, as 4 words
  async id() {
    const words = [];
    for (let i = 0; i < 4; i++) words.push(await this.word(EEPROM | (EE_ID_FIRST + i)));
    return words;
  }

  async temperature(command) {
    const raw = await this.word(command);
    if (raw & ERROR_FLAG) throw new Error(`MLX90614 flags an error on 0x${command.toString(16)}`);
    return raw * KELVIN_PER_COUNT - ZERO_C_IN_K;
  }

  async ambient() {
    return this.temperature(RAM_TA);
  }

  // the object's temperature, C: zone 1, or 2 on a dual-zone part
  async object(zone = 1) {
    if (zone === 2 && !this.dual) throw new Error('a single-zone MLX90614 has no zone 2');
    return this.temperature(zone === 2 ? RAM_TOBJ2 : RAM_TOBJ1);
  }

  // { ambient, object } (and object2 on a dual-zone part), C
  async measure() {
    const r = { ambient: await this.ambient(), object: await this.object() };
    if (this.dual) r.object2 = await this.object(2);
    return r;
  }
}

Mlx90614.addresses = [0x5a];

export default Mlx90614;
