// the GC9A01 on a bench: r8845's round 240x240 IPS module, 32.4 mm across
// (BENCH_GC9A01)
import { Gc9a01 } from '../../src/index.js';
import { GC9A01 } from './bench.js';
import { panelTests } from './panel.js';

panelTests(Gc9a01, GC9A01, 'BENCH_GC9A01', { round: true });
