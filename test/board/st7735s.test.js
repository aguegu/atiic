// the ST7735S on a bench: r8845's 0.96" 80x160 IPS module (BENCH_ST7735)
import { St7735s } from '../../src/index.js';
import { ST7735 } from './bench.js';
import { panelTests } from './panel.js';

panelTests(St7735s, ST7735, 'BENCH_ST7735');
