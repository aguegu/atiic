// Sensirion's SGP40: a metal-oxide VOC sensor on a hotplate, at 0x59. Its
// raw signal, SRAW_VOC, in ticks proportional to the logarithm of the
// sensing layer's resistance: more VOCs, a lower resistance, fewer ticks.
// Adapter-free: any I2C bus with write(address, bytes) and read(address, n).
//
// Per its datasheet (version 1.2, February 2022, docs/SGP40-v1.2.pdf):
// 16-bit commands (Table 8), each data word followed by a CRC-8 (0x31, from
// 0xFF, Table 7: CRC(0xBEEF) = 0x92; the SHT3x's and SHT4x's):
//   measure raw   0x26 0x0F + RH and T words: 30 ms at most; the
//                 hotplate on, until heater off. RH ticks = RH% x 65535 / 100,
//                 T ticks = (T + 45) x 65535 / 175 (Table 10); the defaults,
//                 50 % and 25 C (0x8000, 0x6666), leave its humidity
//                 compensation off
//   self test     0x28 0x0E: 320 ms at most; 0xD4xx passed, 0x4Bxx failed
//   heater off    0x36 0x15: back to idle
//   serial        0x36 0x82: 1 ms at most; three words, 48 bits
// No clock stretching (4.2): until done it NACKs a read; the duration waited
// here, then read. One measurement a second (Table 1's sampling interval,
// 0.5 to 10 s) keeps the hotplate's temperature steady. The VOC Index (1 to
// 500) is Sensirion's Gas Index Algorithm run over the raw signal on the
// host (3.2): not in this driver. On ours the first raw signal after the
// hotplate comes on reads 0, then about 21500 rising as it heats. No ID register: the serial number, three
// words with good CRCs, is how a bench knows it.

const ADDRESS = 0x59;
const MEASURE = [0x26, 0x0f];
const SELF_TEST = [0x28, 0x0e];
const HEATER_OFF = [0x36, 0x15];
const SERIAL = [0x36, 0x82];
// Table 8's longest durations, ms
const MEASURE_MS = 30;
const SELF_TEST_MS = 320;
const SERIAL_MS = 1;
const SELF_TEST_PASSED = 0xd4;
const FULL_SCALE = 65535;
const RH_SPAN = 100;
const T_OFFSET = 45;
const T_SPAN = 175;
// a reply not ready at its longest duration: asked again this often, this many times
const RETRY_MS = 2;
const RETRIES = 3;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Table 7's CRC-8: 0x31, from 0xFF
export function crc8(bytes) {
  let c = 0xff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x31) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

// a 16-bit value as a word and its CRC
const withCrc = (v) => [v >> 8, v & 0xff, crc8([v >> 8, v & 0xff])];
const clamp = (v) => Math.min(FULL_SCALE, Math.max(0, Math.round(v)));

// the measurement's parameters (Table 10): RH and T as ticks, each with its CRC
export function parameters(humidity = 50, temperature = 25) {
  return [...withCrc(clamp((humidity * FULL_SCALE) / RH_SPAN)), ...withCrc(clamp(((temperature + T_OFFSET) * FULL_SCALE) / T_SPAN))];
}

// n words from d, each CRC checked
function words(d, n, what) {
  const out = [];
  for (let i = 0; i < n * 3; i += 3) {
    if (crc8(d.slice(i, i + 2)) !== d[i + 2]) throw new Error(`SGP40 ${what} CRC: 0x${d[i + 2].toString(16)}`);
    out.push((d[i] << 8) | d[i + 1]);
  }
  return out;
}

class Sgp40 {
  static chip = {
    name: 'SGP40',
    // no ID register: its serial number, three words with good CRCs
    async identify(bus, address) {
      try {
        await bus.write(address, SERIAL);
        await delay(SERIAL_MS);
        const d = await bus.read(address, 9);
        return [0, 3, 6].every((i) => crc8(d.slice(i, i + 2)) === d[i + 2]);
      } catch {
        return false;
      }
    },
  };

  constructor(bus, address = ADDRESS) {
    this.bus = bus;
    this.address = address;
  }

  // a command, its duration, then n bytes (asked again a few times if not yet ready)
  async ask(command, ms, n) {
    await this.bus.write(this.address, command);
    await delay(ms);
    for (let i = 0; ; i++) {
      try {
        return await this.bus.read(this.address, n);
      } catch (e) {
        if (i >= RETRIES) throw e;
        await delay(RETRY_MS);
      }
    }
  }

  // the 48-bit serial number (a Number: exact to 2^53)
  async serial() {
    const [a, b, c] = words(await this.ask(SERIAL, SERIAL_MS, 9), 3, 'serial');
    return a * 2 ** 32 + b * 2 ** 16 + c;
  }

  // { passed, result }: its built-in test of the hotplate and the sensing layer
  async selfTest() {
    const [result] = words(await this.ask(SELF_TEST, SELF_TEST_MS, 3), 1, 'self test');
    return { passed: result >> 8 === SELF_TEST_PASSED, result };
  }

  // { raw }: one raw signal, SRAW_VOC ticks; humidity (%) and temperature
  // (C) from a sensor beside it turn its compensation on, left out off.
  // The hotplate stays on: call it once a second
  async measure({ humidity, temperature } = {}) {
    const p = humidity === undefined || temperature === undefined ? parameters() : parameters(humidity, temperature);
    const [raw] = words(await this.ask([...MEASURE, ...p], MEASURE_MS, 3), 1, 'measurement');
    return { raw };
  }

  // the hotplate off, idle
  async sleep() {
    await this.bus.write(this.address, HEATER_OFF);
  }
}

Sgp40.addresses = [ADDRESS];

export default Sgp40;
