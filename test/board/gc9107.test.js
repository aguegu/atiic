// the GC9107 on a bench: r8845's 1.45" 60x160 IPS module (BENCH_GC9107)
import { Gc9107 } from '../../src/index.js';
import { GC9107 } from './bench.js';
import { panelTests } from './panel.js';

panelTests(Gc9107, GC9107, 'BENCH_GC9107');
