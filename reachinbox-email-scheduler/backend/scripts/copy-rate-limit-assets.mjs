import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(projectRoot, 'src/services/rate-limit');
const destination = resolve(projectRoot, 'dist/services/rate-limit');

await mkdir(destination, { recursive: true });
await cp(resolve(source, 'hourly-limit.lua'), resolve(destination, 'hourly-limit.lua'));
await cp(resolve(source, 'release-hourly-limit.lua'), resolve(destination, 'release-hourly-limit.lua'));
await cp(resolve(source, 'minimum-delay.lua'), resolve(destination, 'minimum-delay.lua'));