const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const timeoutify = (ms, promise, cb) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    cb();
    reject(new Error('timeout'));
  }, ms);

  promise.then((value) => {
    clearTimeout(timer);
    resolve(value);
  }).catch((reason) => {
    clearTimeout(timer);
    reject(reason);
  });
});

const crc8 = (buffer, polynomial = 0x31, initialization = 0xff) => buffer.reduce((crc0, byte) => {
  let crc = crc0 ^ byte;
  Array(8).fill().forEach(() => {
    if (crc & 0x80) {
      crc = (crc << 1) ^ polynomial;
    } else {
      crc <<= 1;
    }
    crc &= 0xff;
  });
  return crc;
}, initialization);

export { delay, timeoutify, crc8 };
