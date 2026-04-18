import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.cwd(), 'data/solar-city-permits.csv');
const target = resolve(process.cwd(), 'public/data/solar-city-permits.csv');

if (!existsSync(source)) {
  console.warn('Source data file not found:', source);
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('Copied permit data to public/data/solar-city-permits.csv');
