require('dotenv-flow').config();

module.exports = {
  device: process.env.DEVICE_PORT,
  slaves: {
    spl06: '76',
    sht30: '44',
    bme280: '76',
  },
};
