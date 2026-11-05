// Bosch BMX055's magnetometer: one of the BMX055's three chips, at 0x10-0x13
// by its CSB3 and SDO pins (the accelerometer and the gyro have their own
// drivers). Adapter-free: any I2C bus with write(address, bytes) and
// writeRead(address, bytes, n). Chip ID 0x32 (the BMM150's). The PS pin
// must be tied to VDDIO for I2C.
//
// Registers, presets and rates per Bosch's BMX055 datasheet,
// BST-BMX055-DS000-02 rev 1.1 (MAG registers, 9.2-9.3). The datasheet leaves
// the field's compensation to Bosch's driver ("off-chip temperature
// compensation", 9.3.2): the raw readings, the Hall resistance and the trim
// values programmed into each chip combine into microtesla. That part - the
// data's bit layout, the trim registers' layout and the floating-point
// compensation - follows Bosch Sensortec's BMM150 Sensor API
// (github.com/boschsensortec/BMM150_SensorAPI, bmm150.c: read_trim_registers,
// bmm150_read_mag_data, compensate_x/_y/_z), under its license:
//
//   Copyright (c) 2020 Bosch Sensortec GmbH. All rights reserved.
//
//   BSD-3-Clause
//
//   Redistribution and use in source and binary forms, with or without
//   modification, are permitted provided that the following conditions are met:
//
//   1. Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//
//   2. Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
//   3. Neither the name of the copyright holder nor the names of its
//       contributors may be used to endorse or promote products derived from
//       this software without specific prior written permission.
//
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
//   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
//   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
//   FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
//   COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
//   INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
//   (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
//   SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
//   HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
//   STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
//   IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
//   POSSIBILITY OF SUCH DAMAGE.

const REG_CHIP_ID = 0x40; // readable only with the power bit set
const REG_DATA_X_LSB = 0x42; // x, y (13 bits), z (15 bits), Hall resistance (14 bits), each low byte first
const REG_POWER = 0x4b; // bit 0: power control (0 suspend, 1 sleep)
const REG_OPMODE = 0x4c; // data rate bits 5-3, opmode bits 2-1
const REG_REP_XY = 0x51;
const REG_REP_Z = 0x52;
const REG_TRIM_FIRST = 0x5d; // dig_x1 .. dig_xy1 at 0x71
const TRIM_BYTES = 0x71 - 0x5d + 1;
const DATA_BYTES = 8;
const POWER_ON = 0x01;
const POWER_OFF = 0x00; // suspend: only 0x4B answers
const STARTUP_MS = 3; // suspend to sleep, ts_up,m 3.0 ms (max)
const OPMODE_NORMAL_10HZ = 0x00; // opmode 00 normal, data rate 000: 10 Hz (Table 51)
// the regular preset (the datasheet's table: nXY 9, nZ 15, 10 Hz recommended;
// nXY = 1 + 2 REPXY, nZ = 1 + REPZ). Bosch's 2020 API uses REPZ 7 (nZ 8); the
// BMX055's datasheet is followed here
const REPXY_REGULAR = 0x04;
const REPZ_REGULAR = 0x0e;
const SAMPLE_PERIOD_MS = 100; // 10 Hz
// raw values that mean the axis overflowed (the API's OVERFLOW_ADCVAL_*)
const OVERFLOW_XY = -4096;
const OVERFLOW_Z = -16384;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the trim registers 0x5D-0x71, read in one block, as the API's read_trim_registers
export function parseTrim(t) {
  const at = (reg) => t[reg - REG_TRIM_FIRST];
  const s8 = (reg) => (at(reg) << 24) >> 24;
  const u16 = (lo, hi) => (at(hi) << 8) | at(lo);
  const s16 = (lo, hi) => (u16(lo, hi) << 16) >> 16;
  return {
    x1: s8(0x5d), y1: s8(0x5e),
    z4: s16(0x62, 0x63), x2: s8(0x64), y2: s8(0x65),
    z2: s16(0x68, 0x69), z1: u16(0x6a, 0x6b),
    xyz1: ((at(0x6d) & 0x7f) << 8) | at(0x6c),
    z3: s16(0x6e, 0x6f), xy2: s8(0x70), xy1: at(0x71),
  };
}

// the data registers 0x42-0x49 unpacked: raw x, y, z and the Hall resistance
export function parseData(d) {
  const s8 = (i) => (d[i] << 24) >> 24;
  return {
    x: s8(1) * 32 + (d[0] >> 3), // 13 bits: bits 7-3 of the LSB
    y: s8(3) * 32 + (d[2] >> 3),
    z: s8(5) * 128 + (d[4] >> 1), // 15 bits: bits 7-1
    rhall: (d[7] << 6) | (d[6] >> 2), // 14 bits, unsigned: bits 7-2
  };
}

// microtesla from a raw x or y, the Hall resistance and the trims (the
// API's compensate_x and compensate_y: dig_x1/x2 or dig_y1/y2); null when
// the axis overflowed or the inputs can't be used
export function compensateXY(raw, rhall, trim, d1, d2) {
  if (raw === OVERFLOW_XY || rhall === 0 || trim.xyz1 === 0) return null;
  const r = (trim.xyz1 * 16384) / rhall - 16384;
  const a = trim.xy2 * ((r * r) / 268435456) + (r * trim.xy1) / 16384;
  return ((raw * ((a + 256) * (d2 + 160))) / 8192 + d1 * 8) / 16;
}

// microtesla from the raw z (the API's compensate_z)
export function compensateZ(raw, rhall, trim) {
  if (raw === OVERFLOW_Z || trim.z2 === 0 || trim.z1 === 0 || trim.xyz1 === 0 || rhall === 0) return null;
  const top = (raw - trim.z4) * 131072 - trim.z3 * (rhall - trim.xyz1);
  return top / ((trim.z2 + (trim.z1 * rhall) / 32768) * 4) / 16;
}

class Bmx055Mag {
  static chip = {
    name: 'BMX055 magnetometer',
    idRegister: REG_CHIP_ID,
    whoAmI: 0x32,
    // suspended (after power-on) the chip ID reads 0x00 (datasheet 9.2.2):
    // what to write, and how long to wait, before reading it
    idWake: [REG_POWER, POWER_ON],
    idWakeMs: STARTUP_MS,
    // after normal mode, before the first field reading: two samples at
    // 10 Hz; to measure on the board
    settleMs: 2 * SAMPLE_PERIOD_MS,
  };

  constructor(bus, address = 0x10) {
    this.bus = bus;
    this.address = address;
  }

  async init() {
    await this.bus.write(this.address, [REG_POWER, POWER_ON]); // suspend to sleep: the registers answer
    await delay(STARTUP_MS);
    const [id] = await this.bus.writeRead(this.address, [REG_CHIP_ID], 1);
    const { chip } = this.constructor;
    if (id !== chip.whoAmI) {
      throw new Error(`chip ID 0x${id.toString(16)}, not a ${chip.name}`);
    }
    this.trim = parseTrim(await this.bus.writeRead(this.address, [REG_TRIM_FIRST], TRIM_BYTES));
    await this.bus.write(this.address, [REG_REP_XY, REPXY_REGULAR]);
    await this.bus.write(this.address, [REG_REP_Z, REPZ_REGULAR]);
    await this.bus.write(this.address, [REG_OPMODE, OPMODE_NORMAL_10HZ]);
    await delay(chip.settleMs);
  }

  // the field, microtesla about x, y, z (null for an axis that overflowed)
  async measure() {
    const raw = parseData(await this.bus.writeRead(this.address, [REG_DATA_X_LSB], DATA_BYTES));
    const t = this.trim;
    return {
      magnetometers: {
        x: compensateXY(raw.x, raw.rhall, t, t.x1, t.x2),
        y: compensateXY(raw.y, raw.rhall, t, t.y1, t.y2),
        z: compensateZ(raw.z, raw.rhall, t),
      },
    };
  }

  async sleep() {
    await this.bus.write(this.address, [REG_POWER, POWER_OFF]);
  }
}

Bmx055Mag.addresses = [0x10, 0x11, 0x12, 0x13];

export default Bmx055Mag;
