#!/usr/bin/env node
// Render the reviewed, data-only operation; never connect to a database here.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-nutrition-curation-20260919.json', root), 'utf8'));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const { operation_checksum: checksum, ...payload } = input;
if (createHash('sha256').update(canonical(payload)).digest('hex') !== checksum) throw new Error('CURATION_INPUT_CHECKSUM_MISMATCH');
const encoded = JSON.stringify(input);
if (encoded.includes('$curation_input$')) throw new Error('CURATION_INPUT_DELIMITER_COLLISION');
const sql = readFileSync(fileURLToPath(new URL('scripts/sql/ingredient-curation-20260919.sql', root)), 'utf8');
process.stdout.write(`BEGIN;\nDO $input_setting$ BEGIN PERFORM set_config('homecook.ingredient_curation_input', $curation_input$${encoded}$curation_input$, true); END $input_setting$;\n${sql}`);
