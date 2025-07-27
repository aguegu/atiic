import { autoDetect } from '@serialport/bindings-cpp';
import { timeoutify } from '../utils.js';

class SerialportBindingCppAdapter {
  constructor(path, logger = console, timeout = 100) {
    this.conf = {
      path,
      baudRate: 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
    };
    this.logger = logger;
    this.spBase = autoDetect();
    this.timeout = timeout;
  }

  async transmit(txString) {
    const sp = await this.spBase.open(this.conf);
    const len = txString.length + 521; // 521 = 2: \r\n + 510: 255 bytes in hex + 9: \r\nERROR\r\n
    const recv = Buffer.alloc(len);
    let offset = 0;
    const startAt = Date.now();

    const read = async () => {
      const { bytesRead } = await sp.read(recv, offset, len - offset);
      offset += bytesRead;
      const res = recv.toString().slice(0, offset);
      this.logger?.debug({ rx: res, hex: res.toString('hex'), ttl: Date.now() - startAt });

      if (res.endsWith('OK\r\n')) {
        const lines = res.split('\r\n');
        const payload = Buffer.from(lines[lines.length - 3], 'hex');
        await sp.close();
        return Promise.resolve(payload);
      } if (res.endsWith('ERROR\r\n')) {
        await sp.close();
        throw new Error('FAILED');
      } else {
        return read();
      }
    };

    const txBuffer = Buffer.from(`${txString}\r\n`);
    sp.write(txBuffer);
    this.logger?.debug({ tx: txBuffer.toString(), hex: txBuffer.toString('hex') });

    return timeoutify(this.timeout, read(), () => {
      if (sp.isOpen) {
        sp.close();
      }
    });
  }
}

export default SerialportBindingCppAdapter;
