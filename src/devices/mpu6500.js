// InvenSense MPU-6500: the MPU-6050's successor (often on boards sold as
// GY-9250, which would carry an MPU-9250: WHO_AM_I tells). Same register
// layout over I2C; what differs is in `chip`, and the accelerometer's
// low-pass filter has its own register, ACCEL_CONFIG2, right after
// ACCEL_CONFIG. Its facts as Linux's inv_mpu6050 driver has them
// (drivers/iio/imu/inv_mpu6050): WHO_AM_I 0x70, the temperature (raw +
// 7011) x 2995178 nC, the FIFO 512 bytes, ACCEL_CONFIG_2 written with the
// gyro's filter value. Rated to 400 kHz on I2C (and SPI, not here).
import Mpu6050 from './mpu6050.js';

const A_DLPF_20HZ = 0x04; // ACCEL_CONFIG2's A_DLPF_CFG, ACCEL_FCHOICE_B 0: the filter as CONFIG's

class Mpu6500 extends Mpu6050 {
  static chip = {
    name: 'MPU-6500',
    idRegister: 0x75, // WHO_AM_I
    whoAmI: 0x70,
    tempLsb: 333.87, // LSB per degree C
    tempOffset: 21, // degrees C at a reading of 0
    fifoSize: 512,
    // woken from sleep, within 0.5 deg/s of rest (through the 20 Hz
    // filter, r8845's GY-9250, 24 wake-ups): 46-51 ms after init() began when
    // it slept under 40 ms, 60-66 ms after longer (the worst)
    settleMs: 100,
    // with the gyro's filter off (DLPF_CFG 0) it samples at 8 kHz whatever
    // SMPLRT_DIV says: on r8845 a 2, 2.67 and 4 kHz FIFO each filled at
    // ~4400 frames/s and overflowed. The divider counts with the filter on
    dividerWithFilterOff: false,
  };

  configBytes(gfs, afs) {
    return [...super.configBytes(gfs, afs), A_DLPF_20HZ];
  }
}

export default Mpu6500;
