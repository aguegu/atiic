// ST's VL53L1X: a time-of-flight distance sensor (to ~4 m), at 0x29, its
// registers at 16-bit addresses (high byte first). Adapter-free: any I2C bus
// with write(address, bytes) and writeRead(address, bytes, n).
//
// ST's datasheet (DS12385) gives no register map: the sensor is driven by ST's Ultra
// Lite Driver (ULD, VL53L1X_api, STSW-IMG009). This follows it, as SparkFun's
// library carries it (src/st_src/vl53l1x_class.cpp): VL53L1X_SensorInit (the
// boot wait, the 91-byte default configuration at 0x2D-0x87, one ranging to
// settle, the VHV loop bound), VL53L1X_StartRanging, CheckForDataReady,
// GetRangeStatus, GetDistance, ClearInterrupt, StopRanging;
// SetDistanceMode, SetTimingBudgetInMs, SetInterMeasurementInMs for
// configure(); GetSignalRate, GetAmbientRate, GetSpadNb for measure()'s
// other numbers; SetROI for roi(). The default configuration (DEFAULT_CONFIGURATION) and the
// modes' and budgets' register values (DISTANCE_MODES, TIMING_BUDGETS) are
// ST's, under its licence:
//
//   COPYRIGHT(c) 2018 STMicroelectronics
//
//   Redistribution and use in source and binary forms, with or without modification,
//   are permitted provided that the following conditions are met:
//     1. Redistributions of source code must retain the above copyright notice,
//        this list of conditions and the following disclaimer.
//     2. Redistributions in binary form must reproduce the above copyright notice,
//        this list of conditions and the following disclaimer in the documentation
//        and/or other materials provided with the distribution.
//     3. Neither the name of STMicroelectronics nor the names of its contributors
//        may be used to endorse or promote products derived from this software
//        without specific prior written permission.
//
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
//   AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
//   IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
//   DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
//   FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
//   DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
//   SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
//   CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
//   OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
//   OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// pre-1.0 atiic's driver had the same 91 bytes. On r8845's module (model ID
// 0xEA, type 0xCC): booted (0xE5 = 3), a reading every ~98 ms, ~1966 mm
// to the room past it, valid each time.

const REG_VHV_CONFIG_LOOP_BOUND = 0x0008;
const REG_VHV_CONFIG_INIT = 0x000b;
const REG_CONFIG_FIRST = 0x002d;
const REG_GPIO_HV_MUX_CTRL = 0x0030; // bit 4: interrupt polarity, 0 active high
const REG_GPIO_TIO_HV_STATUS = 0x0031; // bit 0: the interrupt line, data ready at the polarity
const REG_PHASECAL_CONFIG_TIMEOUT_MACROP = 0x004b;
const REG_RANGE_CONFIG_TIMEOUT_MACROP_A_HI = 0x005e; // 16 bits
const REG_RANGE_CONFIG_VCSEL_PERIOD_A = 0x0060;
const REG_RANGE_CONFIG_TIMEOUT_MACROP_B_HI = 0x0061; // 16 bits
const REG_RANGE_CONFIG_VCSEL_PERIOD_B = 0x0063;
const REG_RANGE_CONFIG_VALID_PHASE_HIGH = 0x0069;
const REG_SYSTEM_INTERMEASUREMENT_PERIOD = 0x006c; // 32 bits
const REG_SD_CONFIG_WOI_SD0 = 0x0078; // 16 bits
const REG_SD_CONFIG_INITIAL_PHASE_SD0 = 0x007a; // 16 bits
const REG_RESULT_OSC_CALIBRATE_VAL = 0x00de; // 16 bits, bits 9:0 the oscillator's clocks a ms
const REG_SYSTEM_INTERRUPT_CLEAR = 0x0086;
const REG_SYSTEM_MODE_START = 0x0087; // 0x40 continuous, 0x10 one shot, 0x00 stop
const REG_ROI_CENTRE_SPAD = 0x007f;
const REG_ROI_XY_SIZE = 0x0080; // (height - 1) << 4 | (width - 1)
// a reading's results, 0x89-0x99 in one read (as the ULD's GetResult)
const REG_RESULT_RANGE_STATUS = 0x0089; // bits 4:0
const RESULT_BYTES = 17;
const RESULT_SPADS = 0x008c - REG_RESULT_RANGE_STATUS; // 16 bits, SPADs used, 8.8 fixed point
const RESULT_AMBIENT = 0x0090 - REG_RESULT_RANGE_STATUS; // 16 bits, Mcps, 9.7 fixed point
const RESULT_DISTANCE = 0x0096 - REG_RESULT_RANGE_STATUS; // 16 bits, mm, the final crosstalk-corrected range
const RESULT_SIGNAL = 0x0098 - REG_RESULT_RANGE_STATUS; // 16 bits, Mcps, 9.7 fixed point, crosstalk corrected
// 9.7 Mcps to kcps (the ULD multiplies by 8, rounding 7.8125 up); 8.8 SPADs
// to whole ones (the ULD's >> 8)
const KCPS_PER_LSB = 1000 / 128;
const SPAD_FRACTION_BITS = 8;
const ROI_MIN = 4; // SPADs a side (DS12385 3.5: 4 x 4 the minimum, 16 x 16 the full FoV)
const ROI_MAX = 16;
const ROI_CENTRE_ONLY_MAX = 10; // the ULD: wider or taller, the centre forced to 199
const ROI_CENTRE = 199; // the array's centre (the table below; ST's examples)
const SPAD_ROWS = 16;
const SPAD_HALF = 8;

// ST's SPAD numbers by place in the 16 x 16 array (row 0 top, column 0 left,
// pin 1 at the bottom right), as SparkFun's SparkFun_VL53L1X.h tabulates
// them: the top eight rows 128 + 8 * column + row, the bottom eight
// 127 - 8 * column - (row - 8). A ROI's centre is the SPAD right of and
// above the middle of the region wanted
export function spadAt(row, column) {
  if (!(Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < SPAD_ROWS && column >= 0 && column < SPAD_ROWS)) {
    throw new Error(`VL53L1X: no SPAD at row ${row}, column ${column}: 0-${SPAD_ROWS - 1} each`);
  }
  return row < SPAD_HALF ? 128 + SPAD_HALF * column + row : 127 - SPAD_HALF * column - (row - SPAD_HALF);
}
const REG_FIRMWARE_SYSTEM_STATUS = 0x00e5; // non-zero once booted
const REG_MODEL_ID = 0x010f; // 0xEA, then the module type 0xCC
const MODE_CONTINUOUS = 0x40;
const MODE_STOP = 0x00;
const VHV_TWO_BOUNDS = 0x09;
const RANGE_STATUS_MASK = 0x1f;
// the ULD's GetRangeStatus: the device's status codes to its own, 0 a valid
// range (1 sigma fail, 2 signal fail, 4 out of bounds, 7 wrap-around ...)
const RANGE_STATUS = { 9: 0, 6: 1, 4: 2, 8: 3, 5: 4, 3: 5, 19: 6, 7: 7, 12: 9, 18: 10, 22: 11, 23: 12, 13: 13 };
const RANGE_STATUS_UNKNOWN = 255;
const POLL_MS = 2;
const BOOT_LIMIT_MS = 1000;
const READY_LIMIT_MS = 1000; // a ranging every ~100 ms with the default configuration
const OSC_CALIBRATE_MASK = 0x3ff;
// the ULD's SetInterMeasurementInMs: the period in oscillator clocks is the
// calibrated clocks a ms times ms times 1.075 (ST's factor, unexplained)
const INTERMEASUREMENT_FACTOR = 1.075;

// the ULD's SetDistanceMode: short (to ~1.3 m, better in ambient light) and
// long (to ~4 m, the default configuration's; DS12385 3.5.1, its medium mode
// not in the ULD)
const DISTANCE_MODES = {
  short: { phasecal: 0x14, vcselA: 0x07, vcselB: 0x05, validPhaseHigh: 0x38, woiSd0: 0x0705, initialPhaseSd0: 0x0606 },
  long: { phasecal: 0x0a, vcselA: 0x0f, vcselB: 0x0d, validPhaseHigh: 0xb8, woiSd0: 0x0f0d, initialPhaseSd0: 0x0e0e },
};
// the ULD's SetTimingBudgetInMs: ms -> the timeouts A and B, per mode. The
// budgets the datasheet allows (DS12385 rev. 8, 3.5.2: 20 ms the minimum,
// in short mode only; 33 ms the minimum in every mode): the ULD's 15 ms
// short and 20 ms long left out (dart on r8845: long at 20 ms read ~6 cm
// short of the others, sd 5.5-9.3 mm)
const TIMING_BUDGETS = {
  short: {
    20: [0x0051, 0x006e], 33: [0x00d6, 0x006e], 50: [0x01ae, 0x01e8],
    100: [0x02e1, 0x0388], 200: [0x03e1, 0x0496], 500: [0x0591, 0x05c1],
  },
  long: {
    33: [0x0060, 0x006e], 50: [0x00ad, 0x00c6],
    100: [0x01cc, 0x01ea], 200: [0x02d9, 0x02f8], 500: [0x048f, 0x04a4],
  },
};

const DEFAULT_CONFIGURATION = [ // 0x2D-0x87, ST's VL51L1X_DEFAULT_CONFIGURATION
  0x00, 0x01, 0x01, 0x01, 0x02, 0x00, 0x02, 0x08, 0x00, 0x08, 0x10, 0x01,
  0x01, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0x0f, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x20, 0x0b, 0x00, 0x00, 0x02, 0x0a, 0x21, 0x00, 0x00, 0x05, 0x00,
  0x00, 0x00, 0x00, 0xc8, 0x00, 0x00, 0x38, 0xff, 0x01, 0x00, 0x08, 0x00,
  0x00, 0x01, 0xdb, 0x0f, 0x01, 0xf1, 0x0d, 0x01, 0x68, 0x00, 0x80, 0x08,
  0xb8, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x89, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x0f, 0x0d, 0x0e, 0x0e, 0x00, 0x00, 0x02, 0xc7, 0xff,
  0x9b, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (reg) => [reg >> 8, reg & 0xff];

class Vl53l1x {
  static chip = {
    name: 'VL53L1X',
    // its model ID and module type at a 16-bit address: no 8-bit ID register
    async identify(bus, address) {
      const [id, type] = await bus.writeRead(address, at(REG_MODEL_ID), 2);
      return id === 0xea && type === 0xcc;
    },
  };

  constructor(bus, address = 0x29) {
    this.bus = bus;
    this.address = address;
  }

  async write(reg, ...bytes) {
    await this.bus.write(this.address, [...at(reg), ...bytes]);
  }

  async write16(reg, v) {
    await this.write(reg, v >> 8, v & 0xff);
  }

  async read(reg, n = 1) {
    return this.bus.writeRead(this.address, at(reg), n);
  }

  // until fn() is true, polling; how long it took, ms
  async until(fn, limitMs, what) {
    const t0 = Date.now();
    while (!(await fn())) {
      if (Date.now() - t0 > limitMs) throw new Error(`VL53L1X: no ${what} in ${limitMs} ms`);
      await delay(POLL_MS);
    }
    return Date.now() - t0;
  }

  // the ULD's SensorInit, then ranging, continuously
  async init() {
    if (!(await Vl53l1x.chip.identify(this.bus, this.address))) throw new Error('not a VL53L1X: model ID or module type');
    await this.until(async () => (await this.read(REG_FIRMWARE_SYSTEM_STATUS))[0] !== 0, BOOT_LIMIT_MS, 'boot');
    await this.write(REG_CONFIG_FIRST, ...DEFAULT_CONFIGURATION);
    const [ctrl] = await this.read(REG_GPIO_HV_MUX_CTRL);
    this.polarity = ((ctrl & 0x10) >> 4) ^ 1;
    await this.start();
    await this.until(() => this.dataReady(), READY_LIMIT_MS, 'first ranging');
    await this.write(REG_SYSTEM_INTERRUPT_CLEAR, 1);
    await this.write(REG_SYSTEM_MODE_START, MODE_STOP);
    await this.write(REG_VHV_CONFIG_LOOP_BOUND, VHV_TWO_BOUNDS);
    await this.write(REG_VHV_CONFIG_INIT, 0);
    await this.start();
  }

  async start() {
    await this.write(REG_SYSTEM_INTERRUPT_CLEAR, 1);
    await this.write(REG_SYSTEM_MODE_START, MODE_CONTINUOUS);
  }

  async dataReady() {
    const [s] = await this.read(REG_GPIO_TIO_HV_STATUS);
    return (s & 1) === this.polarity;
  }

  // the next ranging: { distance: mm, status: 0 valid (the ULD's codes),
  // signal: kcps of its own light back, ambient: kcps of the background,
  // spads: SPADs it used (signal and ambient per SPAD: divide) }
  async measure() {
    await this.until(() => this.dataReady(), this.readyLimitMs ?? READY_LIMIT_MS, 'ranging');
    const r = await this.read(REG_RESULT_RANGE_STATUS, RESULT_BYTES);
    await this.write(REG_SYSTEM_INTERRUPT_CLEAR, 1);
    const u16 = (i) => (r[i] << 8) | r[i + 1];
    return {
      distance: u16(RESULT_DISTANCE),
      status: RANGE_STATUS[r[0] & RANGE_STATUS_MASK] ?? RANGE_STATUS_UNKNOWN,
      signal: u16(RESULT_SIGNAL) * KCPS_PER_LSB,
      ambient: u16(RESULT_AMBIENT) * KCPS_PER_LSB,
      spads: u16(RESULT_SPADS) >> SPAD_FRACTION_BITS,
    };
  }

  // the region of interest: width x height of the 16 x 16 SPADs (4-16
  // each; smaller: a narrower view, less light), around centre (ST's SPAD
  // number, spadAt(); 199 the array's centre). As the ULD's SetROI: wider
  // or taller than 10, the centre is 199. Takes effect from the ranging
  // after the next
  async roi({ width = ROI_MAX, height = ROI_MAX, centre } = {}) {
    for (const [name, v] of [['width', width], ['height', height]]) {
      if (!(Number.isInteger(v) && v >= ROI_MIN && v <= ROI_MAX)) throw new Error(`VL53L1X: ROI ${name} ${v}: ${ROI_MIN}-${ROI_MAX}`);
    }
    const c = width > ROI_CENTRE_ONLY_MAX || height > ROI_CENTRE_ONLY_MAX ? ROI_CENTRE : centre ?? ROI_CENTRE;
    await this.write(REG_ROI_CENTRE_SPAD, c);
    await this.write(REG_ROI_XY_SIZE, ((height - 1) << 4) | (width - 1));
  }

  // the distance mode ('short' or 'long'), the timing budget (ms, one of the
  // ULD's the datasheet allows: 20 (short only), 33, 50, 100, 200, 500) and the period from
  // one ranging's start to the next (ms, budget by default; not under it),
  // as the ULD sets them, ranging stopped and started again. After init()
  // the sensor runs the default configuration's long mode, ~100 ms
  async configure({ mode = 'long', budget = 100, period = budget } = {}) {
    const m = DISTANCE_MODES[mode];
    if (!m) throw new Error(`VL53L1X: no distance mode ${mode}: ${Object.keys(DISTANCE_MODES).join(', ')}`);
    const timeouts = TIMING_BUDGETS[mode][budget];
    if (!timeouts) throw new Error(`VL53L1X: no ${budget} ms budget in ${mode} mode: ${Object.keys(TIMING_BUDGETS[mode]).join(', ')}`);
    if (!(period >= budget)) throw new Error(`VL53L1X: a ${period} ms period under the ${budget} ms budget`);
    await this.sleep();
    await this.write(REG_PHASECAL_CONFIG_TIMEOUT_MACROP, m.phasecal);
    await this.write(REG_RANGE_CONFIG_VCSEL_PERIOD_A, m.vcselA);
    await this.write(REG_RANGE_CONFIG_VCSEL_PERIOD_B, m.vcselB);
    await this.write(REG_RANGE_CONFIG_VALID_PHASE_HIGH, m.validPhaseHigh);
    await this.write16(REG_SD_CONFIG_WOI_SD0, m.woiSd0);
    await this.write16(REG_SD_CONFIG_INITIAL_PHASE_SD0, m.initialPhaseSd0);
    await this.write16(REG_RANGE_CONFIG_TIMEOUT_MACROP_A_HI, timeouts[0]);
    await this.write16(REG_RANGE_CONFIG_TIMEOUT_MACROP_B_HI, timeouts[1]);
    const [hi, lo] = await this.read(REG_RESULT_OSC_CALIBRATE_VAL, 2);
    const clocks = Math.floor((((hi << 8) | lo) & OSC_CALIBRATE_MASK) * period * INTERMEASUREMENT_FACTOR);
    await this.write(REG_SYSTEM_INTERMEASUREMENT_PERIOD, clocks >>> 24, (clocks >> 16) & 0xff, (clocks >> 8) & 0xff, clocks & 0xff);
    this.readyLimitMs = Math.max(READY_LIMIT_MS, 2 * period);
    await this.start();
  }

  // ranging stopped
  async sleep() {
    await this.write(REG_SYSTEM_MODE_START, MODE_STOP);
  }
}

Vl53l1x.addresses = [0x29];
Vl53l1x.spadAt = spadAt;

export default Vl53l1x;
