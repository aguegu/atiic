// the ST7789 on a bench: r8845's 240x320 module (BENCH_ST7789)
import { St7789 } from '../../src/index.js';
import { ST7789 } from './bench.js';
import { panelTests } from './panel.js';

panelTests(St7789, ST7789, 'BENCH_ST7789');
