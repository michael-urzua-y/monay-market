#!/usr/bin/env node
/**
 * Única fuente de verdad para la versión de assets de la PWA.
 *
 * Uso en cada release:
 *   1. Editar pwa/VERSION con el nuevo número (ej: 32).
 *   2. Ejecutar: node pwa/sync-version.mjs
 *
 * Propaga el número a service-worker.js, src/app.js e index.html para que el
 * cache-busting quede consistente en los 3 sin editarlos a mano. La salida en
 * runtime es idéntica al esquema anterior; solo cambia el número en un lugar.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const version = readFileSync(join(here, 'VERSION'), 'utf8').trim();

if (!/^\d+$/.test(version)) {
  console.error(`VERSION debe ser un número entero. Recibido: "${version}"`);
  process.exit(1);
}

const edits = [
  {
    file: 'service-worker.js',
    pattern: /const APP_ASSET_VERSION = '[^']*';/,
    replacement: `const APP_ASSET_VERSION = '${version}';`,
  },
  {
    file: 'src/app.js',
    pattern: /var APP_ASSET_VERSION = '[^']*';/,
    replacement: `var APP_ASSET_VERSION = '${version}';`,
  },
  {
    file: 'index.html',
    pattern: /\?v=\d+/g,
    replacement: `?v=${version}`,
  },
];

let hadError = false;
for (const { file, pattern, replacement } of edits) {
  const path = join(here, file);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (!pattern.test(before) && before === after) {
    console.error(`✗ No se encontró el patrón de versión en ${file}. ¿Cambió el formato?`);
    hadError = true;
    continue;
  }
  if (before === after) {
    console.log(`= ${file} ya está en v${version}`);
  } else {
    writeFileSync(path, after);
    console.log(`✓ ${file} → v${version}`);
  }
}

if (hadError) {
  process.exit(1);
}
console.log(`Listo. Versión de assets PWA: ${version}`);
