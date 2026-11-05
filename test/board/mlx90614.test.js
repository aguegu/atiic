// the MLX90614 on a bench: r8845's CH341 at 100 kHz (its SMBus top), the
// module looking at the room
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Mlx90614 } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { onlyWith, addressOf, sclFor } from './bench.js';

const SCL_HZ = 100000;
const AMBIENT_C = [5, 45];
const OBJECT_C = [-20, 100]; // a room, a hand, a cup
const AGREE_C = 1; // two readings a second apart, a still scene

describe('mlx90614 (board)', onlyWith(Mlx90614), () => {
  let bus, m;
  before(async () => {
    bus = await openCh341(sclFor(SCL_HZ));
    m = new Mlx90614(bus, addressOf(Mlx90614));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits (its config: single or dual zone)', async () => {
    await m.init();
  });

  it('reads its ID number, each word\'s PEC good', async () => {
    const id = await m.id();
    assert.equal(id.length, 4);
    assert.ok(id.some((w) => w !== 0 && w !== 0xffff), id.map((w) => w.toString(16)).join(' '));
  });

  it('measures the room and itself; two readings a second apart agree', async () => {
    const a = await m.measure();
    assert.ok(a.ambient > AMBIENT_C[0] && a.ambient < AMBIENT_C[1], `ambient ${a.ambient} C`);
    assert.ok(a.object > OBJECT_C[0] && a.object < OBJECT_C[1], `object ${a.object} C`);
    await new Promise((r) => setTimeout(r, 1000));
    const b = await m.measure();
    assert.ok(Math.abs(a.ambient - b.ambient) < AGREE_C, `${a.ambient} then ${b.ambient}`);
    assert.ok(Math.abs(a.object - b.object) < AGREE_C, `${a.object} then ${b.object}`);
  });
});
