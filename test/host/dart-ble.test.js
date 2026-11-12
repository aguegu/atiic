// the Dart adapter over Bluetooth LE (src/adapters/dart/ble.js) on a fake
// Web Bluetooth BluetoothDevice: requests written in pieces, put together as
// dart-ble does, served by dart-protocol's fake dart, replies notified in
// pieces of the link's MTU; no hardware
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Dart, { OP, BLE_SERVICE, BLE_REQUEST, BLE_FILTERS, NAME_PREFIX } from '../../src/adapters/dart/index.js';
import { REQUEST, REPLY, WRITE_CHUNK } from '../../src/adapters/dart/ble.js';
import { fakeDart } from './fake-dart.js';

const SLAVE = 0x52;

const listeners = () => {
  const map = new Map();
  return {
    addEventListener(type, f) { (map.get(type) ?? map.set(type, new Set()).get(type)).add(f); },
    removeEventListener(type, f) { map.get(type)?.delete(f); },
    emit(type, e) { for (const f of map.get(type) ?? []) f(e); },
    count(type) { return map.get(type)?.size ?? 0; },
  };
};

// mtu: the link's ATT MTU (a notification carries mtu - 3); silent: INFO
// never answered (not a dart); hold: replies kept back while true
function fakeBle({ mtu = 23, silent = false, ...opts } = {}) {
  const ctl = { hold: false };
  const dart = fakeDart(opts);
  const writes = [];
  let frame = [];
  let notifying = false;
  const reply = Object.assign(listeners(), {
    uuid: REPLY,
    async startNotifications() { notifying = true; return this; },
    async stopNotifications() { notifying = false; return this; },
  });
  const notify = (bytes) => {
    for (let i = 0; i < bytes.length; i += mtu - 3) {
      const piece = Uint8Array.from(bytes.subarray(i, i + mtu - 3));
      setTimeout(() => reply.emit('characteristicvaluechanged', { target: { value: new DataView(piece.buffer) } }), 0);
    }
  };
  const request = {
    uuid: REQUEST,
    async writeValueWithoutResponse(data) {
      if (!device.gatt.connected) throw new Error('NetworkError: GATT Server is disconnected.');
      assert.ok(data.length <= mtu - 3, `a write of ${data.length} over the MTU`);
      writes.push(Uint8Array.from(data));
      frame.push(...data);
      const len = frame.length >= 4 ? 4 + (frame[2] | (frame[3] << 8)) : Infinity;
      if (frame.length < len) return;
      const q = Uint8Array.from(frame.splice(0, len));
      await dart.transferOut(1, q);
      if ((silent && q[0] === OP.INFO) || ctl.hold) return;
      const r = await dart.transferIn(1, 4096);
      if (notifying) notify(new Uint8Array(r.data.buffer));
    },
  };
  const device = Object.assign(listeners(), { name: 'Dart-D946', id: 'fake' });
  const service = {
    uuid: BLE_SERVICE,
    async getCharacteristic(u) {
      const c = { [REQUEST]: request, [REPLY]: reply }[u];
      if (!c) throw new Error('NotFoundError');
      return c;
    },
  };
  device.gatt = {
    connected: false,
    async connect() { this.connected = true; return this; },
    disconnect() { this.connected = false; device.emit('gattserverdisconnected', {}); },
    async getPrimaryService(u) { if (u !== BLE_SERVICE) throw new Error('NotFoundError'); return service; },
  };
  return { device, dart, writes, reply, ctl, isNotifying: () => notifying };
}

describe('dart over Bluetooth LE', () => {
  it('requestDevice\'s options: by name, the service optional (no service filter: bluez 5.87); the filter kept apart', () => {
    assert.deepEqual(BLE_REQUEST, { filters: [{ namePrefix: 'Dart-' }], optionalServices: ['76600001-dace-4d07-9686-48b0186b7cd7'] });
    assert.equal(NAME_PREFIX, 'Dart-');
    assert.deepEqual(BLE_FILTERS, [{ services: ['76600001-dace-4d07-9686-48b0186b7cd7'] }]);
  });

  it('opens: connects, notifications on, INFO and SPEED as over USB', async () => {
    const f = fakeBle();
    await new Dart(f.device).open();
    assert.equal(f.device.gatt.connected, true);
    assert.equal(f.isNotifying(), true);
    assert.deepEqual([...f.dart.sent[0]], [OP.INFO, 1, 0, 0]);
    assert.deepEqual([...f.dart.sent[1]], [OP.SPEED, 2, 4, 0, 0xa0, 0x86, 0x01, 0x00]);
  });

  for (const mtu of [23, 247]) {
    it(`MTU ${mtu}: a 200-byte write in ${WRITE_CHUNK}-byte pieces, a 200-byte read back over the notifications`, async () => {
      const f = fakeBle({ mtu });
      const bus = await new Dart(f.device).open();
      const data = Array.from({ length: 200 }, (_, i) => (i * 37 + 7) & 0xff);
      const before = f.writes.length;
      await bus.write(SLAVE, [0x00, ...data]);
      assert.equal(f.writes.length - before, Math.ceil((4 + 3 + 201) / WRITE_CHUNK));
      assert.deepEqual([...f.dart.regs.slice(0, 200)], data);
      assert.deepEqual([...await bus.writeRead(SLAVE, [0x00], 200)], data);
    });
  }

  it('statuses as over USB: a missing device, a scan, acks', async () => {
    const bus = await new Dart(fakeBle().device).open();
    await assert.rejects(bus.read(0x2a, 1), /no ack from 0x2a/);
    assert.deepEqual(await bus.scan(), [SLAVE]);
    assert.equal(await bus.acks(0x53), false);
    assert.equal((await bus.info()).uniqueId, '7F59CFCC5293D946');
  });

  it('a device that never answers INFO: not a dart, disconnected, after identifyMs', async () => {
    const f = fakeBle({ silent: true });
    await assert.rejects(new Dart(f.device).open(100000, { identifyMs: 50 }), /no answer to INFO in 50 ms: not a dart/);
    assert.equal(f.device.gatt.connected, false);
  });

  it('the link lost mid-request: the request rejects, and so does the next', async () => {
    const f = fakeBle();
    const bus = await new Dart(f.device).open();
    f.ctl.hold = true; // the reply never comes
    const pending = bus.request(OP.INFO);
    await new Promise((r) => setTimeout(r, 10)); // written, waiting
    f.device.gatt.disconnect();
    await assert.rejects(pending, /dart disconnected/);
    await assert.rejects(bus.scan(), /disconnected/);
  });

  it('close: notifications off, its listeners gone, disconnected; it opens again', async () => {
    const f = fakeBle();
    const bus = await new Dart(f.device).open();
    await bus.close();
    assert.deepEqual([f.isNotifying(), f.device.gatt.connected, f.reply.count('characteristicvaluechanged'), f.device.count('gattserverdisconnected')], [false, false, 0, 0]);
    await new Dart(f.device).open();
    assert.equal(f.device.gatt.connected, true);
  });
});
