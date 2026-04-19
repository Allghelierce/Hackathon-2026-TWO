import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.cwd(), 'public/data');
mkdirSync(outDir, { recursive: true });

const files = [
  ['data/solar-city-permits.csv', 'public/data/solar-city-permits.csv'],
  ['data/Titan All Addresses.csv', 'public/data/titan-addresses.csv'],
];

for (const [src, dest] of files) {
  const source = resolve(process.cwd(), src);
  const target = resolve(process.cwd(), dest);
  if (!existsSync(source)) {
    console.warn('Source data file not found:', source);
    continue;
  }
  copyFileSync(source, target);
  console.log('Copied', src, '→', dest);
}
