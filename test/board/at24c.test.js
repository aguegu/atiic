// an AT24C08 on a bench, named by BENCH_AT24C08 (its address, 0x50; it has
// no ID to look for): a pattern written across a page and a block edge,
// read back, then what was there written back
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { At24c } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { AT24C08, sclFor } from './bench.js';

const SCL_HZ = 400000; // 2.7-5.5 V
const AT = 0x2f8; // block 2's last half page and block 3's first page
const N = 24;

describe('at24c08 (board)', { skip: AT24C08 === null ? 'no BENCH_AT24C08: no AT24C08 named on the bench' : false }, () => {
  let bus, eeprom, saved;
  before(async () => {
    bus = await openCh341(sclFor(SCL_HZ));
    eeprom = new At24c(bus, { model: 'AT24C08', address: AT24C08 });
    saved = await eeprom.read(AT, N);
  });

  after(async () => {
    if (saved) await eeprom.write(AT, saved);
    await bus?.close();
  });

  it('answers at its four blocks\' addresses', async () => {
    for (let b = 0; b < 4; b++) assert.ok(await bus.acks(AT24C08 + b), `0x${(AT24C08 + b).toString(16)}`);
  });

  it('writes across a page and a block edge and reads it back', async () => {
    const pattern = Uint8Array.from({ length: N }, (_, i) => (saved[i] ^ (0xa5 + i)) & 0xff);
    await eeprom.write(AT, pattern);
    assert.deepEqual([...await eeprom.read(AT, N)], [...pattern]);
  });

  it('reads the whole memory in one go', async () => {
    assert.equal((await eeprom.read(0, 1024)).length, 1024);
  });

  it('puts back what was there', async () => {
    await eeprom.write(AT, saved);
    assert.deepEqual([...await eeprom.read(AT, N)], [...saved]);
  });
});
