// The LM75 (Analog Devices / Maxim): temperature, and a thermal watchdog (the
// OS pin) with an over-temperature limit and a hysteresis, at 0x48-0x4F by
// its A2-A0 pins. Adapter-free: any I2C bus with write(address, bytes) and
// writeRead(address, bytes, n).
//
// Per its datasheet (19-4385 Rev 3, 02/24, docs/): a pointer selects four
// registers (Table 2): temperature 0x00 (read only), configuration 0x01 (one
// byte), T_HYST 0x02 and T_OS 0x03. Temperature, T_HYST and T_OS alike
// (Table 3): 9 bits, two's complement, in D15-D7, 0.5 C a step; D6-D0 don't
// care (cleared here). It converts on its own, every 100 ms typical, 300 at
// most: a read at any time gives the last conversion, nothing to trigger or
// wait for. The configuration (Table 5): D4-D3 the fault queue (1, 2, 4 or
// 6 conversions over before OS), D2 OS polarity (1 active high), D1
// interrupt mode (0 comparator), D0 shutdown; D7-D5 written 0. Power-up
// state: comparator, OS active low, T_OS 80 C, T_HYST 75 C; it has no
// reset command, so init() writes that state back.
// No ID register: chip.identify only checks what the datasheet guarantees
// (D7-D5 of the configuration 0; temperature and both limits inside -55 to
// 125 C), so a bench looks for it after every chip with an ID of its own.
// Many "LM75" modules carry an LM75A or a clone with more bits in D6-D0:
// this driver reads the datasheet's 9.
// Measured on Dart-8346 at 100 kHz: 23.0 C; pointers 0x04-0x07, 0xFE, 0xFF
// read 0xFFFF; an SHT3x's ID check (0xF3 0x2D) wrote 0x2D into T_OS.

const REG_TEMPERATURE = 0x00;
const REG_CONFIG = 0x01;
const REG_HYST = 0x02;
const REG_OS = 0x03;
const CONFIG_ZERO = 0xe0; // D7-D5, written 0
const SHUTDOWN = 0x01;
const INTERRUPT = 0x02;
const ACTIVE_HIGH = 0x04;
const FAULT_SHIFT = 3;
// Table 6: the fault queue's codes by number of faults
export const FAULT_QUEUE = { 1: 0, 2: 1, 4: 2, 6: 3 };
export const CONVERSION_MS = 300; // the longest conversion: a faster read repeats the last
const STEP_C = 0.5;
const MIN_C = -55; // the operating range
const MAX_C = 125;
const POWER_UP = { hysteresis: 75, overtemperature: 80 };

// a register's 16 bits as degrees: D15-D7, two's complement, 0.5 C a step
const degreesOf = (h, l) => ((((h << 8) | l) << 16) >> 23) * STEP_C;
// degrees as a register's two bytes, to the 0.5 C step
function bytesOf(c) {
  const v = (Math.round(c / STEP_C) << 7) & 0xffff;
  return [v >> 8, v & 0xff];
}
const inRange = (c) => c >= MIN_C && c <= MAX_C;

class Lm75 {
  static chip = {
    name: 'LM75',
    // no ID register: what the datasheet guarantees, read only
    async identify(bus, address) {
      try {
        const [c] = await bus.writeRead(address, [REG_CONFIG], 1);
        if (c & CONFIG_ZERO) return false;
        for (const r of [REG_TEMPERATURE, REG_HYST, REG_OS]) {
          const [h, l] = await bus.writeRead(address, [r], 2);
          if (!inRange(degreesOf(h, l))) return false;
        }
        return true;
      } catch {
        return false;
      }
    },
  };

  constructor(bus, address = 0x48) {
    this.bus = bus;
    this.address = address;
  }

  // the power-up state back (no reset command): comparator, OS active low,
  // a fault queue of 1, converting; T_HYST 75 C, T_OS 80 C
  async init() {
    await this.bus.write(this.address, [REG_CONFIG, 0x00]);
    await this.setLimits(POWER_UP);
  }

  // degrees C, the last conversion
  async temperature() {
    const [h, l] = await this.bus.writeRead(this.address, [REG_TEMPERATURE], 2);
    return degreesOf(h, l);
  }

  // { temperature: C }, as the other sensors' measure()
  async measure() {
    return { temperature: await this.temperature() };
  }

  async config() {
    const [c] = await this.bus.writeRead(this.address, [REG_CONFIG], 1);
    return c;
  }

  // the configuration (Table 5), any part left as it is: { shutdown,
  // interrupt (else comparator), activeHigh (OS), faultQueue: 1, 2, 4 or 6 }
  async configure({ shutdown, interrupt, activeHigh, faultQueue } = {}) {
    let c = (await this.config()) & ~CONFIG_ZERO;
    const flag = (on, bit) => { if (on !== undefined) c = on ? c | bit : c & ~bit; };
    flag(shutdown, SHUTDOWN);
    flag(interrupt, INTERRUPT);
    flag(activeHigh, ACTIVE_HIGH);
    if (faultQueue !== undefined) {
      if (FAULT_QUEUE[faultQueue] === undefined) throw new Error(`LM75: no fault queue ${faultQueue}: ${Object.keys(FAULT_QUEUE).join(', ')}`);
      c = (c & ~(0x03 << FAULT_SHIFT)) | (FAULT_QUEUE[faultQueue] << FAULT_SHIFT);
    }
    await this.bus.write(this.address, [REG_CONFIG, c]);
  }

  // { hysteresis: T_HYST, overtemperature: T_OS }, C
  async limits() {
    const [hh, hl] = await this.bus.writeRead(this.address, [REG_HYST], 2);
    const [oh, ol] = await this.bus.writeRead(this.address, [REG_OS], 2);
    return { hysteresis: degreesOf(hh, hl), overtemperature: degreesOf(oh, ol) };
  }

  // either or both limits, C, to the 0.5 C step, inside -55 to 125 C
  async setLimits({ hysteresis, overtemperature } = {}) {
    for (const [r, c] of [[REG_HYST, hysteresis], [REG_OS, overtemperature]]) {
      if (c === undefined) continue;
      if (!inRange(c)) throw new Error(`LM75: ${c} C outside ${MIN_C} to ${MAX_C} C`);
      await this.bus.write(this.address, [r, ...bytesOf(c)]);
    }
  }
}

Lm75.addresses = [0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f];
Lm75.CONVERSION_MS = CONVERSION_MS;
Lm75.FAULT_QUEUE = FAULT_QUEUE;

export default Lm75;
