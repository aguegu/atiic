import dotenvFlow from 'dotenv-flow';

dotenvFlow.config();

export default {
  device: process.env.DEVICE_PORT,
  slaves: {
    spl06: '76',
    sht30: '44',
    bme280: '76',
  },
};
