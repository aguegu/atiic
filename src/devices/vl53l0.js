import { i2hex } from '../utils.js';

class Vl53l0 {
  SYSRANGE_START = 0x00;

  SYSTEM_THRESH_HIGH = 0x0C;

  SYSTEM_THRESH_LOW = 0x0E;

  SYSTEM_SEQUENCE_CONFIG = 0x01;

  SYSTEM_RANGE_CONFIG = 0x09;

  SYSTEM_INTERMEASUREMENT_PERIOD = 0x04;

  SYSTEM_INTERRUPT_CONFIG_GPIO = 0x0A;

  GPIO_HV_MUX_ACTIVE_HIGH = 0x84;

  SYSTEM_INTERRUPT_CLEAR = 0x0B;

  RESULT_INTERRUPT_STATUS = 0x13;

  RESULT_RANGE_STATUS = 0x14;

  RESULT_CORE_AMBIENT_WINDOW_EVENTS_RTN = 0xBC;

  RESULT_CORE_RANGING_TOTAL_EVENTS_RTN = 0xC0;

  RESULT_CORE_AMBIENT_WINDOW_EVENTS_REF = 0xD0;

  RESULT_CORE_RANGING_TOTAL_EVENTS_REF = 0xD4;

  RESULT_PEAK_SIGNAL_RATE_REF = 0xB6;

  ALGO_PART_TO_PART_RANGE_OFFSET_MM = 0x28;

  I2C_SLAVE_DEVICE_ADDRESS = 0x8A;

  MSRC_CONFIG_CONTROL = 0x60;

  PRE_RANGE_CONFIG_MIN_SNR = 0x27;

  PRE_RANGE_CONFIG_VALID_PHASE_LOW = 0x56;

  PRE_RANGE_CONFIG_VALID_PHASE_HIGH = 0x57;

  PRE_RANGE_MIN_COUNT_RATE_RTN_LIMIT = 0x64;

  FINAL_RANGE_CONFIG_MIN_SNR = 0x67;

  FINAL_RANGE_CONFIG_VALID_PHASE_LOW = 0x47;

  FINAL_RANGE_CONFIG_VALID_PHASE_HIGH = 0x48;

  FINAL_RANGE_CONFIG_MIN_COUNT_RATE_RTN_LIMIT = 0x44;

  PRE_RANGE_CONFIG_SIGMA_THRESH_HI = 0x61;

  PRE_RANGE_CONFIG_SIGMA_THRESH_LO = 0x62;

  PRE_RANGE_CONFIG_VCSEL_PERIOD = 0x50;

  PRE_RANGE_CONFIG_TIMEOUT_MACROP_HI = 0x51;

  PRE_RANGE_CONFIG_TIMEOUT_MACROP_LO = 0x52;

  SYSTEM_HISTOGRAM_BIN = 0x81;

  HISTOGRAM_CONFIG_INITIAL_PHASE_SELECT = 0x33;

  HISTOGRAM_CONFIG_READOUT_CTRL = 0x55;

  FINAL_RANGE_CONFIG_VCSEL_PERIOD = 0x70;

  FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI = 0x71;

  FINAL_RANGE_CONFIG_TIMEOUT_MACROP_LO = 0x72;

  CROSSTALK_COMPENSATION_PEAK_RATE_MCPS = 0x20;

  MSRC_CONFIG_TIMEOUT_MACROP = 0x46;

  SOFT_RESET_GO2_SOFT_RESET_N = 0xBF;

  IDENTIFICATION_MODEL_ID = 0xC0;

  IDENTIFICATION_REVISION_ID = 0xC2;

  OSC_CALIBRATE_VAL = 0xF8;

  GLOBAL_CONFIG_VCSEL_WIDTH = 0x32;

  GLOBAL_CONFIG_SPAD_ENABLES_REF_0 = 0xB0;

  GLOBAL_CONFIG_SPAD_ENABLES_REF_1 = 0xB1;

  GLOBAL_CONFIG_SPAD_ENABLES_REF_2 = 0xB2;

  GLOBAL_CONFIG_SPAD_ENABLES_REF_3 = 0xB3;

  GLOBAL_CONFIG_SPAD_ENABLES_REF_4 = 0xB4;

  GLOBAL_CONFIG_SPAD_ENABLES_REF_5 = 0xB5;

  GLOBAL_CONFIG_REF_EN_START_SELECT = 0xB6;

  DYNAMIC_SPAD_NUM_REQUESTED_REF_SPAD = 0x4E;

  DYNAMIC_SPAD_REF_EN_START_OFFSET = 0x4F;

  POWER_MANAGEMENT_GO1_POWER_FORCE = 0x80;

  VHV_CONFIG_PAD_SCL_SDA__EXTSUP_HV = 0x89;

  ALGO_PHASECAL_LIM = 0x30;

  ALGO_PHASECAL_CONFIG_TIMEOUT = 0x30;

  constructor(adapter, address = '29') {
    this.adapter = adapter;
    this.address = address;
  }

  async init() {
    const [id] = await this.adapter.transmit(`AT+TR=${this.address}C001`);
    if (id !== 0xee) {
      throw new Error(`Device at adrress 0x${this.address} IS NOT VL53L0`);
    }

    const [ioMode] = await this.adapter.transmit(`AT+TR=${this.address}8901`);
    await this.adapter.transmit(`AT+TX=${this.address}89${i2hex(ioMode | 0x01)}`); // io 2v8 mode

    await this.adapter.transmit(`AT+TX=${this.address}8800`);

    await this.adapter.transmit(`AT+TX=${this.address}8001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0000`);

    const [stopVariable] = await this.adapter.transmit(`AT+TR=${this.address}9101`);
    this.stopVariable = stopVariable;

    await this.adapter.transmit(`AT+TX=${this.address}0001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}8000`);

    const [msrcConfigControl] = await this.adapter.transmit(`AT+TR=${this.address}6001`); // MSRC_CONFIG_CONTROL
    await this.adapter.transmit(`AT+TX=${this.address}60${i2hex(msrcConfigControl | 0x12)}`);

    await this.setSignalRateLimit(0.5);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_SEQUENCE_CONFIG)}FF`);

    const { count, isAperture } = await this.getSpadInfo();
    console.log({ count, isAperture });

    const spadMap = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.GLOBAL_CONFIG_SPAD_ENABLES_REF_0)}06`).then((buff) => Array.from(buff));
    console.log({ spadMap });

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.DYNAMIC_SPAD_REF_EN_START_OFFSET)}00`);
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.DYNAMIC_SPAD_NUM_REQUESTED_REF_SPAD)}2C`);
    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.GLOBAL_CONFIG_REF_EN_START_SELECT)}84`);

    const firstSpadToEnable = isAperture ? 12 : 0; // 12 is the first aperture spad
    let spadsEnabled = 0;

    for (let i = 0; i < 48; i++) {
      if (i < firstSpadToEnable || spadsEnabled == count) {
        // This bit is lower than the first one that should be enabled, or
        // (reference_spad_count) bits have already been enabled, so zero this bit
        spadMap[parseInt(i / 8)] &= ~(1 << (i % 8));
      } else if ((spadMap[parseInt(i / 8)] >> (i % 8)) & 0x1) {
        spadsEnabled++;
      }
    }

    console.log({ spadMap });

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.GLOBAL_CONFIG_SPAD_ENABLES_REF_0)}${Buffer.from(spadMap).toString('hex')}`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0000`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}0900`);
    await this.adapter.transmit(`AT+TX=${this.address}1000`);
    await this.adapter.transmit(`AT+TX=${this.address}1100`);

    await this.adapter.transmit(`AT+TX=${this.address}2401`);
    await this.adapter.transmit(`AT+TX=${this.address}25FF`);
    await this.adapter.transmit(`AT+TX=${this.address}7500`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}4E2C`);
    await this.adapter.transmit(`AT+TX=${this.address}4800`);
    await this.adapter.transmit(`AT+TX=${this.address}3020`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}3009`);
    await this.adapter.transmit(`AT+TX=${this.address}5400`);
    await this.adapter.transmit(`AT+TX=${this.address}3104`);
    await this.adapter.transmit(`AT+TX=${this.address}3203`);
    await this.adapter.transmit(`AT+TX=${this.address}4083`);
    await this.adapter.transmit(`AT+TX=${this.address}4625`);
    await this.adapter.transmit(`AT+TX=${this.address}6000`);
    await this.adapter.transmit(`AT+TX=${this.address}2700`);
    await this.adapter.transmit(`AT+TX=${this.address}5006`);
    await this.adapter.transmit(`AT+TX=${this.address}5100`);
    await this.adapter.transmit(`AT+TX=${this.address}5296`);
    await this.adapter.transmit(`AT+TX=${this.address}5608`);
    await this.adapter.transmit(`AT+TX=${this.address}5730`);
    await this.adapter.transmit(`AT+TX=${this.address}6100`);
    await this.adapter.transmit(`AT+TX=${this.address}6200`);
    await this.adapter.transmit(`AT+TX=${this.address}6400`);
    await this.adapter.transmit(`AT+TX=${this.address}6500`);
    await this.adapter.transmit(`AT+TX=${this.address}66A0`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}2232`);
    await this.adapter.transmit(`AT+TX=${this.address}4714`);
    await this.adapter.transmit(`AT+TX=${this.address}49FF`);
    await this.adapter.transmit(`AT+TX=${this.address}4A00`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}7A0A`);
    await this.adapter.transmit(`AT+TX=${this.address}7B00`);
    await this.adapter.transmit(`AT+TX=${this.address}7821`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}2334`);
    await this.adapter.transmit(`AT+TX=${this.address}4200`);
    await this.adapter.transmit(`AT+TX=${this.address}44FF`);
    await this.adapter.transmit(`AT+TX=${this.address}4526`);
    await this.adapter.transmit(`AT+TX=${this.address}4605`);
    await this.adapter.transmit(`AT+TX=${this.address}4040`);
    await this.adapter.transmit(`AT+TX=${this.address}0E06`);
    await this.adapter.transmit(`AT+TX=${this.address}201A`);
    await this.adapter.transmit(`AT+TX=${this.address}4340`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}3403`);
    await this.adapter.transmit(`AT+TX=${this.address}3544`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}3104`);
    await this.adapter.transmit(`AT+TX=${this.address}4B09`);
    await this.adapter.transmit(`AT+TX=${this.address}4C05`);
    await this.adapter.transmit(`AT+TX=${this.address}4D04`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}4400`);
    await this.adapter.transmit(`AT+TX=${this.address}4520`);
    await this.adapter.transmit(`AT+TX=${this.address}4708`);
    await this.adapter.transmit(`AT+TX=${this.address}4828`);
    await this.adapter.transmit(`AT+TX=${this.address}6700`);
    await this.adapter.transmit(`AT+TX=${this.address}7004`);
    await this.adapter.transmit(`AT+TX=${this.address}7101`);
    await this.adapter.transmit(`AT+TX=${this.address}72FE`);
    await this.adapter.transmit(`AT+TX=${this.address}7600`);
    await this.adapter.transmit(`AT+TX=${this.address}7700`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0D01`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}8001`);
    await this.adapter.transmit(`AT+TX=${this.address}01F8`);

    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}8E01`);
    await this.adapter.transmit(`AT+TX=${this.address}0001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}8000`);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_INTERRUPT_CONFIG_GPIO)}04`);
    const [tmp] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.GPIO_HV_MUX_ACTIVE_HIGH)}01`);
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.GPIO_HV_MUX_ACTIVE_HIGH)}${i2hex(tmp & ~0x10)}`);
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_INTERRUPT_CLEAR)}01`);

    this.measurement_timing_budget_us = await this.getMeasurementTimingBudget();

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_SEQUENCE_CONFIG)}E8`);

    this.measurement_timing_budget_us = await this.setMeasurementTimingBudget(this.measurement_timing_budget_us);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_SEQUENCE_CONFIG)}01`);
    await this.performSingleRefCalibration(0x40);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_SEQUENCE_CONFIG)}02`);
    await this.performSingleRefCalibration(0x00);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_SEQUENCE_CONFIG)}E8`);
  }

  async setSignalRateLimit(limitMcps) {
    if (limitMcps < 0 || limitMcps > 511.99) {
      throw new Error('invalid limitMcps');
    }
    // Q9.7 fixed point format (9 integer bits, 7 fractional bits)
    const buff = Buffer.alloc(2);
    buff.writeUInt16BE(limitMcps * (1 << 7));
    return this.adapter.transmit(`AT+TX=${this.address}44${buff.toString('hex')}`); // FINAL_RANGE_CONFIG_MIN_COUNT_RATE_RTN_LIMIT
  }

  async getSpadInfo() {
    await this.adapter.transmit(`AT+TX=${this.address}8001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0000`);

    await this.adapter.transmit(`AT+TX=${this.address}FF06`);
    let [tmp] = await this.adapter.transmit(`AT+TR=${this.address}8301`);
    await this.adapter.transmit(`AT+TX=${this.address}83${i2hex(tmp | 0x04)}`);

    await this.adapter.transmit(`AT+TX=${this.address}FF07`);
    await this.adapter.transmit(`AT+TX=${this.address}8101`);

    await this.adapter.transmit(`AT+TX=${this.address}8001`);
    await this.adapter.transmit(`AT+TX=${this.address}946b`);
    await this.adapter.transmit(`AT+TX=${this.address}8300`);

    ([tmp] = await this.adapter.transmit(`AT+TR=${this.address}8301`));

    if (tmp == 0x00) {
      ([tmp] = await this.adapter.transmit(`AT+TR=${this.address}8301`));
    }

    ([tmp] = await this.adapter.transmit(`AT+TR=${this.address}9201`));
    const count = tmp & 0x7f;
    const isAperture = (tmp >> 7) & 0x01;

    await this.adapter.transmit(`AT+TX=${this.address}8100`);
    await this.adapter.transmit(`AT+TX=${this.address}FF06`);

    ([tmp] = await this.adapter.transmit(`AT+TR=${this.address}8301`));

    await this.adapter.transmit(`AT+TX=${this.address}83${i2hex(tmp & ~0x04)}`);
    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0001`);

    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}8000`);

    return Promise.resolve({ count, isAperture });
  }

  async getSequenceStepEnables() {
    const [sequence_config] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.SYSTEM_SEQUENCE_CONFIG)}01`);
    return Promise.resolve({
      tcc: (sequence_config >> 4) & 0x1,
      dss: (sequence_config >> 3) & 0x1,
      msrc: (sequence_config >> 2) & 0x1,
      pre_range: (sequence_config >> 6) & 0x1,
      final_range: (sequence_config >> 7) & 0x1,
    });
  }

  decodeVcselPeriod(regVal) {
    return (regVal + 1) << 1;
  }

  encodeVcselPeriod(period_pclks) {
    return (period_pclks >> 1) - 1;
  }

  async getVcselPulsePeriodPreRange() {
    const [tmp] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.PRE_RANGE_CONFIG_VCSEL_PERIOD)}01`);
    return Promise.resolve(this.decodeVcselPeriod(tmp));
  }

  async getVcselPulsePeriodFinalRange() {
    const [tmp] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.FINAL_RANGE_CONFIG_VCSEL_PERIOD)}01`);
    return Promise.resolve(this.decodeVcselPeriod(tmp));
  }

  calcMacroPeriod(vcsel_period_pclks) {
    return ((2304 * (vcsel_period_pclks) * 1655) + 500) / 1000;
  }

  timeoutMclksToMicroseconds(timeout_period_mclks, vcsel_period_pclks) {
    const macro_period_ns = this.calcMacroPeriod(vcsel_period_pclks);
    return ((timeout_period_mclks * macro_period_ns) + 500) / 1000;
  }

  decodeTimeout(regVal) {
    // format: "(LSByte * 2^MSByte) + 1"
    return ((regVal & 0x00FF) << ((regVal & 0xFF00) >> 8)) + 1;
  }

  async getSequenceStepTimeouts(enables) {
    const pre_range_vcsel_period_pclks = await this.getVcselPulsePeriodPreRange();
    // timeouts->pre_range_vcsel_period_pclks = getVcselPulsePeriod(VcselPeriodPreRange);

    const msrc_dss_tcc_mclks = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.MSRC_CONFIG_TIMEOUT_MACROP)}01`).then((buff) => buff[0] + 1);
    // timeouts->msrc_dss_tcc_mclks = readReg(MSRC_CONFIG_TIMEOUT_MACROP) + 1;

    const msrc_dss_tcc_us = this.timeoutMclksToMicroseconds(msrc_dss_tcc_mclks, pre_range_vcsel_period_pclks);
    // timeouts->msrc_dss_tcc_us =
    //   timeoutMclksToMicroseconds(timeouts->msrc_dss_tcc_mclks,
    //                              timeouts->pre_range_vcsel_period_pclks);

    const pre_range_mclks = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.PRE_RANGE_CONFIG_TIMEOUT_MACROP_HI)}02`).then((buff) => this.decodeTimeout(buff.readUInt16BE()));
    // timeouts->pre_range_mclks =
    //   decodeTimeout(readReg16Bit(PRE_RANGE_CONFIG_TIMEOUT_MACROP_HI));

    const pre_range_us = this.timeoutMclksToMicroseconds(pre_range_mclks, pre_range_vcsel_period_pclks);
    // timeouts->pre_range_us =
    //   timeoutMclksToMicroseconds(timeouts->pre_range_mclks,
    //                              timeouts->pre_range_vcsel_period_pclks);

    const final_range_vcsel_period_pclks = await this.getVcselPulsePeriodFinalRange();
    // timeouts->final_range_vcsel_period_pclks = getVcselPulsePeriod(VcselPeriodFinalRange);

    let final_range_mclks = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI)}02`).then((buff) => this.decodeTimeout(buff.readUInt16BE()));
    // timeouts->final_range_mclks =
    //   decodeTimeout(readReg16Bit(FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI));

    if (enables.pre_range) {
      final_range_mclks -= pre_range_mclks;
      // timeouts->final_range_mclks -= timeouts->pre_range_mclks;
    }

    const final_range_us = this.timeoutMclksToMicroseconds(final_range_mclks, final_range_vcsel_period_pclks);

    // timeouts->final_range_us =
    //   timeoutMclksToMicroseconds(timeouts->final_range_mclks,
    //                              timeouts->final_range_vcsel_period_pclks);
    return Promise.resolve({
      pre_range_vcsel_period_pclks,
      msrc_dss_tcc_mclks,
      msrc_dss_tcc_us,
      pre_range_mclks,
      pre_range_us,
      final_range_vcsel_period_pclks,
      final_range_mclks,
      final_range_us,
    });
  }

  async getMeasurementTimingBudget() {
    const StartOverhead = 1910;
    const EndOverhead = 960;
    const MsrcOverhead = 660;
    const TccOverhead = 590;
    const DssOverhead = 690;
    const PreRangeOverhead = 660;
    const FinalRangeOverhead = 550;

    // "Start and end overhead times always present"
    let budget_us = StartOverhead + EndOverhead;

    const enables = await this.getSequenceStepEnables();
    const timeouts = await this.getSequenceStepTimeouts(enables);

    if (enables.tcc) {
      budget_us += (timeouts.msrc_dss_tcc_us + TccOverhead);
    }

    if (enables.dss) {
      budget_us += 2 * (timeouts.msrc_dss_tcc_us + DssOverhead);
    } else if (enables.msrc) {
      budget_us += (timeouts.msrc_dss_tcc_us + MsrcOverhead);
    }

    if (enables.pre_range) {
      budget_us += (timeouts.pre_range_us + PreRangeOverhead);
    }

    if (enables.final_range) {
      budget_us += (timeouts.final_range_us + FinalRangeOverhead);
    }

    // this.measurement_timing_budget_us = budget_us; // store for internal reuse
    return Promise.resolve(budget_us);
  }

  async setMeasurementTimingBudget(budget_us) {
    // SequenceStepEnables enables;
    // SequenceStepTimeouts timeouts;

    const StartOverhead = 1910;
    const EndOverhead = 960;
    const MsrcOverhead = 660;
    const TccOverhead = 590;
    const DssOverhead = 690;
    const PreRangeOverhead = 660;
    const FinalRangeOverhead = 550;

    let used_budget_us = StartOverhead + EndOverhead;

    const enables = await this.getSequenceStepEnables();
    const timeouts = await this.getSequenceStepTimeouts(enables);

    if (enables.tcc) {
      used_budget_us += (timeouts.msrc_dss_tcc_us + TccOverhead);
    }

    if (enables.dss) {
      used_budget_us += 2 * (timeouts.msrc_dss_tcc_us + DssOverhead);
    } else if (enables.msrc) {
      used_budget_us += (timeouts.msrc_dss_tcc_us + MsrcOverhead);
    }

    if (enables.pre_range) {
      used_budget_us += (timeouts.pre_range_us + PreRangeOverhead);
    }

    if (enables.final_range) {
      used_budget_us += FinalRangeOverhead;

      // "Note that the final range timeout is determined by the timing
      // budget and the sum of all other timeouts within the sequence.
      // If there is no room for the final range timeout, then an error
      // will be set. Otherwise the remaining time will be applied to
      // the final range."

      if (used_budget_us > budget_us) {
        // "Requested timeout too big."
        // return false;
        throw new Error('Requested timeout too big.');
      }

      const final_range_timeout_us = budget_us - used_budget_us;

      // set_sequence_step_timeout() begin
      // (SequenceStepId == VL53L0X_SEQUENCESTEP_FINAL_RANGE)

      // "For the final range timeout, the pre-range timeout
      //  must be added. To do this both final and pre-range
      //  timeouts must be expressed in macro periods MClks
      //  because they have different vcsel periods."

      let final_range_timeout_mclks = this.timeoutMicrosecondsToMclks(
        final_range_timeout_us,
        timeouts.final_range_vcsel_period_pclks,
      );

      if (enables.pre_range) {
        final_range_timeout_mclks += timeouts.pre_range_mclks;
      }

      const buff = Buffer.alloc(2);
      buff.writeUInt16BE(this.encodeTimeout(final_range_timeout_mclks));
      return this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI)}${buff.toString('hex')}`); // FINAL_RANGE_CONFIG_MIN_COUNT_RATE_RTN_LIMIT
      // writeReg16Bit(FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI, encodeTimeout(final_range_timeout_mclks));
      // set_sequence_step_timeout() end

      // measurement_timing_budget_us = budget_us; // store for internal reuse
    }
    return Promise.resolve(budget_us);
  }

  timeoutMicrosecondsToMclks(timeout_period_us, vcsel_period_pclks) {
    const macro_period_ns = this.calcMacroPeriod(vcsel_period_pclks);
    return (((timeout_period_us * 1000) + (macro_period_ns / 2)) / macro_period_ns);
  }

  encodeTimeout(timeout_mclks) {
    // format: "(LSByte * 2^MSByte) + 1"
    let ls_byte = 0;
    let ms_byte = 0;

    if (timeout_mclks > 0) {
      ls_byte = timeout_mclks - 1;

      while ((ls_byte & 0xFFFFFF00) > 0) {
        ls_byte >>= 1;
        ms_byte++;
      }

      return (ms_byte << 8) | (ls_byte & 0xFF);
    }
    else { return 0; }
  }

  async performSingleRefCalibration(vhv_init_byte) {
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSRANGE_START)}${i2hex(0x01 | vhv_init_byte)}`);
    // writeReg(SYSRANGE_START, 0x01 | vhv_init_byte); // VL53L0X_REG_SYSRANGE_MODE_START_STOP

    // startTimeout();
    let [interrupt] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_INTERRUPT_STATUS)}01`);
    console.log({ interrupt });
    if (!(interrupt & 0x07)) {
      ([interrupt] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_INTERRUPT_STATUS)}01`));
      console.log({ interrupt });
    }
    if (!(interrupt & 0x07)) {
      ([interrupt] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_INTERRUPT_STATUS)}01`));
      console.log({ interrupt });
    }

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_INTERRUPT_CLEAR)}01`);
    // writeReg(SYSTEM_INTERRUPT_CLEAR, 0x01);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSRANGE_START)}00`);
    // writeReg(SYSRANGE_START, 0x00);

    // return true;
  }

  async readRangeSingleMillimeters() {
    await this.adapter.transmit(`AT+TX=${this.address}8001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0000`);

    await this.adapter.transmit(`AT+TX=${this.address}91${i2hex(this.stopVariable)}`);

    await this.adapter.transmit(`AT+TX=${this.address}0001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}8000`);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSRANGE_START)}01`);

    let [tmp] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.SYSRANGE_START)}01`);
    console.log({ tmp });

    // if (tmp & 0x01) {
    //   ([tmp] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.SYSRANGE_START)}01`));
    //   console.log({ tmp });
    // }

    return this.readRangeContinuousMillimeters();
  }

  async readRangeContinuousMillimeters() {
    const t = Date.now();
    console.log({ t });
    let [interrupt] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_INTERRUPT_STATUS)}01`);
    console.log({ interrupt });
    if (!(interrupt & 0x07)) {
      ([interrupt] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_INTERRUPT_STATUS)}01`));
      console.log({ interrupt });
    }
    if (!(interrupt & 0x07)) {
      ([interrupt] = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_INTERRUPT_STATUS)}01`));
      console.log({ interrupt });
    }
    // console.log({ ttl: Date.now() - t });

    // assumptions: Linearity Corrective Gain is 1000 (default);
    // fractional ranging is not enabled
    // uint16_t range = readReg16Bit(RESULT_RANGE_STATUS + 10);
    const range = await this.adapter.transmit(`AT+TR=${this.address}${i2hex(this.RESULT_RANGE_STATUS + 10)}02`).then(buff => buff.readUInt16BE());


    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSTEM_INTERRUPT_CLEAR)}01`);
    // writeReg(SYSTEM_INTERRUPT_CLEAR, 0x01);

    return Promise.resolve(range);
  }

  async startContinuous() {
    await this.adapter.transmit(`AT+TX=${this.address}8001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    await this.adapter.transmit(`AT+TX=${this.address}0000`);
    await this.adapter.transmit(`AT+TX=${this.address}91${i2hex(this.stopVariable)}`);

    await this.adapter.transmit(`AT+TX=${this.address}0001`);
    await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    await this.adapter.transmit(`AT+TX=${this.address}8000`);

    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSRANGE_START)}02`);
  }

  async stopContinuous() {
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(this.SYSRANGE_START)}01`);
    // await this.adapter.transmit(`AT+TX=${this.address}FF01`);
    // await this.adapter.transmit(`AT+TX=${this.address}0000`);
    // await this.adapter.transmit(`AT+TX=${this.address}9100`);
    // await this.adapter.transmit(`AT+TX=${this.address}0001`);
    // await this.adapter.transmit(`AT+TX=${this.address}FF00`);
    // not really working if this section is enabled
  }
}

export default Vl53l0;
