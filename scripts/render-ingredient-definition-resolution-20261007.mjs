#!/usr/bin/env node
// Offline renderer: no database connection or mutation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256 } from './lib/public-nutrition-pipeline.mjs';
const root = new URL('../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-definition-resolution-20261007.json', root), 'utf8'));
const { operation_checksum, ...payload } = input;
if (sha256(payload) !== operation_checksum) throw Error('DEFINITION_INPUT_CHECKSUM');
const { payload_checksum, ...patch } = input.patch;
if (sha256(patch) !== payload_checksum) throw Error('DEFINITION_PATCH_CHECKSUM');
const raw = readFileSync(new URL('supabase/migrations/20261007160000_ingredient_catalog_definitions.sql', root), 'utf8');
const body = raw.replace(/^begin;\s*$/im, '').replace(/^commit;\s*$/im, '');
for (const [text, hash] of [[raw, input.migration.sha256], [body, input.migration.body_sha256]]) {
  if (createHash('sha256').update(text).digest('hex') !== hash) throw Error('DEFINITION_SCHEMA_CHECKSUM');
}
const encoded = JSON.stringify(input);
if (encoded.includes('$resolution_input$') || body.includes('$resolution_schema$')) throw Error('DEFINITION_DELIMITER_COLLISION');
const sql = readFileSync(new URL('scripts/sql/ingredient-definition-resolution-20261007.sql', root), 'utf8');
process.stdout.write(`BEGIN;\nSET LOCAL ROLE postgres;\nDO $settings$ BEGIN PERFORM set_config('homecook.definition_resolution_input',$resolution_input$${encoded}$resolution_input$,true); PERFORM set_config('homecook.definition_resolution_schema',$resolution_schema$${body}$resolution_schema$,true); END $settings$;\n${sql}`);
