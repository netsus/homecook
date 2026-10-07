#!/usr/bin/env node
// Render only: importing or running this file never opens a DB connection.
import { readFileSync } from 'node:fs';
import { sha256 } from './lib/public-nutrition-pipeline.mjs';
const root = new URL('../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-nutrition-curation-20261006-followup.json', root), 'utf8'));
const { operation_checksum, ...body } = input;
if (sha256(body) !== operation_checksum) throw new Error('CURATION_INPUT_CHECKSUM_MISMATCH');
const { payload_checksum, ...patch } = input.patch;
if (sha256(patch) !== payload_checksum) throw new Error('CURATION_PATCH_CHECKSUM_MISMATCH');
const encoded = JSON.stringify(input);
if (encoded.includes('$curation_input$')) throw new Error('CURATION_INPUT_DELIMITER_COLLISION');
const sql = readFileSync(new URL('scripts/sql/ingredient-curation-20261006-followup.sql', root), 'utf8');
process.stdout.write(`BEGIN;\nDO $input_setting$ BEGIN PERFORM set_config('homecook.ingredient_curation_input', $curation_input$${encoded}$curation_input$, true); END $input_setting$;\n${sql}`);
