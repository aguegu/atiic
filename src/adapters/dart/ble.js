// dart over Bluetooth LE (firmware dart-ble): the same command set as over
// USB, on one GATT service. A request's frame is written to one
// characteristic (Write Without Response, in pieces), its reply notified on
// another, in as many notifications as the link's ATT MTU takes; a reply is
// whole when its header's count of bytes is in (data only on OK). A browser's
// Web Bluetooth BluetoothDevice (navigator.bluetooth.requestDevice) is what
// it runs on; Node has no Web Bluetooth.
export const SERVICE = '76600001-dace-4d07-9686-48b0186b7cd7';
export const REQUEST = '76600002-dace-4d07-9686-48b0186b7cd7';
export const REPLY = '76600003-dace-4d07-9686-48b0186b7cd7';
// a dart advertises its service's UUID and the name "Dart-XXXX"
export const BLE_FILTERS = [{ services: [SERVICE] }];
export const NAME_PREFIX = 'Dart-';
// a request's frame written WRITE_CHUNK bytes at a time: ATT's least MTU (23)
// less a write's 3-byte header, what every link takes. Web Bluetooth doesn't
// tell a page the link's MTU, and a write over it fails or is cut on some
// systems; a request is mostly a few bytes, so this costs only long writes.
export const WRITE_CHUNK = 20;
const REPLY_HEADER = 6;

export class BleLink {
  constructor(device) {
    this.device = device;
    this.rx = new Uint8Array(0);
    this.waiting = null; // the pending receive(): { resolve, reject }
    this.onValue = (e) => {
      const v = e.target.value;
      const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      const rx = new Uint8Array(this.rx.length + b.length);
      rx.set(this.rx);
      rx.set(b, this.rx.length);
      this.rx = rx;
      this.deliver();
    };
    this.onGone = () => this.fail(new Error('dart disconnected'));
  }

  async open() {
    const server = this.device.gatt.connected ? this.device.gatt : await this.device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    this.request = await service.getCharacteristic(REQUEST);
    this.reply = await service.getCharacteristic(REPLY);
    this.reply.addEventListener('characteristicvaluechanged', this.onValue);
    this.device.addEventListener('gattserverdisconnected', this.onGone);
    await this.reply.startNotifications();
  }

  async close() {
    this.device.removeEventListener('gattserverdisconnected', this.onGone);
    if (this.reply) {
      this.reply.removeEventListener('characteristicvaluechanged', this.onValue);
      if (this.device.gatt.connected) await this.reply.stopNotifications().catch(() => {});
    }
    if (this.device.gatt.connected) this.device.gatt.disconnect();
    this.fail(new Error('dart closed'));
  }

  async send(frame) {
    this.rx = new Uint8Array(0); // nothing of an earlier reply belongs to this one
    for (let i = 0; i < frame.length; i += WRITE_CHUNK) {
      await this.request.writeValueWithoutResponse(frame.subarray(i, i + WRITE_CHUNK));
    }
  }

  // the next whole reply's bytes
  receive() {
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.deliver();
    });
  }

  deliver() {
    const rx = this.rx;
    if (!this.waiting || rx.length < REPLY_HEADER) return;
    const ok = rx[2] === 0;
    const need = REPLY_HEADER + (ok ? rx[4] | (rx[5] << 8) : 0);
    if (rx.length < need) return;
    this.rx = rx.slice(need);
    const { resolve } = this.waiting;
    this.waiting = null;
    resolve(rx.slice(0, need));
  }

  fail(e) {
    const w = this.waiting;
    this.waiting = null;
    w?.reject(e);
  }
}
