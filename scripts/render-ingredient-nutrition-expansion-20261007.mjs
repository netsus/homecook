#!/usr/bin/env node
// Offline renderer only. No database connection or mutation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256 } from './lib/public-nutrition-pipeline.mjs';
const root = new URL('../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-nutrition-expansion-20261007.json', root), 'utf8'));
const { operation_checksum, ...payload } = input;
if (sha256(payload) !== operation_checksum) throw Error('EXPANSION_INPUT_CHECKSUM');
const { payload_checksum, ...patch } = input.patch;
if (sha256(patch) !== payload_checksum) throw Error('EXPANSION_PATCH_CHECKSUM');
const raw = readFileSync(new URL('supabase/migrations/20261007210000_ingredient_source_name_capacity.sql', root), 'utf8');
const body = raw.replace(/^begin;\s*$/im, '').replace(/^commit;\s*$/im, '');
for (const [text, expected] of [[raw, input.migration.sha256], [body, input.migration.body_sha256]]) {
  if (createHash('sha256').update(text).digest('hex') !== expected) throw Error('EXPANSION_SCHEMA_CHECKSUM');
}
if (body.includes('$expansion_schema$')) throw Error('EXPANSION_SCHEMA_DELIMITER');
const encoded = JSON.stringify(input);
if (encoded.includes('$finalization_input$')) throw Error('EXPANSION_DELIMITER_COLLISION');
const sql = readFileSync(new URL('scripts/sql/ingredient-nutrition-expansion-20261007.sql', root), 'utf8');
process.stdout.write(`BEGIN;\nSET LOCAL ROLE postgres;\nDO $settings$ BEGIN PERFORM set_config('homecook.nutrition_expansion_input',$finalization_input$${encoded}$finalization_input$,true); PERFORM set_config('homecook.nutrition_expansion_schema',$expansion_schema$${body}$expansion_schema$,true); END $settings$;\n${sql}`);
