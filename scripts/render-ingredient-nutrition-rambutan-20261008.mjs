#!/usr/bin/env node
// Offline renderer only. No database connection or mutation.
import { readFileSync } from 'node:fs';
import { sha256 } from './lib/public-nutrition-pipeline.mjs';
const root = new URL('../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-nutrition-rambutan-20261008.json', root), 'utf8'));
const { operation_checksum, ...payload } = input;
if (sha256(payload) !== operation_checksum) throw Error('RAMBUTAN_INPUT_CHECKSUM');
const { payload_checksum, ...patch } = input.patch;
if (sha256(patch) !== payload_checksum) throw Error('RAMBUTAN_PATCH_CHECKSUM');
const encoded = JSON.stringify(input);
if (encoded.includes('$finalization_input$')) throw Error('RAMBUTAN_DELIMITER_COLLISION');
const sql = readFileSync(new URL('scripts/sql/ingredient-nutrition-rambutan-20261008.sql', root), 'utf8');
process.stdout.write(`BEGIN;\nSET LOCAL ROLE postgres;\nDO $settings$ BEGIN PERFORM set_config('homecook.nutrition_rambutan_input',$finalization_input$${encoded}$finalization_input$,true); END $settings$;\n${sql}`);
