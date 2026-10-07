#!/usr/bin/env node
// Rendering only. Actual writes require verified local target and backup.
import { readFileSync } from 'node:fs';
import { sha256 } from './lib/public-nutrition-pipeline.mjs';
const root = new URL('../', import.meta.url);
const input = JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-catalog-cleanup-20261006.json', root), 'utf8'));
const { operation_checksum, ...payload } = input;
if (sha256(payload) !== operation_checksum) throw new Error('CATALOG_CLEANUP_CHECKSUM_MISMATCH');
const encoded = JSON.stringify(input);
if (encoded.includes('$catalog_input$')) throw new Error('CATALOG_INPUT_DELIMITER_COLLISION');
const sql = readFileSync(new URL('scripts/sql/ingredient-catalog-cleanup-20261006.sql', root), 'utf8');
process.stdout.write(`BEGIN;\nDO $input$ BEGIN PERFORM set_config('homecook.catalog_cleanup_input', $catalog_input$${encoded}$catalog_input$, true); END $input$;\n${sql}`);
