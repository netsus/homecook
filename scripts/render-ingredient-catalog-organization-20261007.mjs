#!/usr/bin/env node
// Offline renderer. Execution belongs to the verified, backed-up full-local operation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256 } from './lib/public-nutrition-pipeline.mjs';
const root=new URL('../',import.meta.url);
const input=JSON.parse(readFileSync(new URL('docs/engineering/data/ingredient-catalog-organization-20261007.json',root),'utf8'));
const {operation_checksum,...payload}=input;
if(sha256(payload)!==operation_checksum)throw Error('CATALOG_ORGANIZATION_INPUT_CHECKSUM');
const raw=readFileSync(new URL('supabase/migrations/20261007143000_ingredient_catalog_organization.sql',root),'utf8');
if(createHash('sha256').update(raw).digest('hex')!==input.migration.sha256)throw Error('CATALOG_ORGANIZATION_SCHEMA_CHECKSUM');
const body=raw.replace(/^begin;\s*$/im,'').replace(/^commit;\s*$/im,'');
if(createHash('sha256').update(body).digest('hex')!==input.migration.body_sha256)throw Error('CATALOG_ORGANIZATION_SCHEMA_BODY_CHECKSUM');
const encoded=JSON.stringify(input);
if(encoded.includes('$catalog_org_input$')||body.includes('$catalog_org_schema$'))throw Error('CATALOG_DELIMITER_COLLISION');
const sql=readFileSync(new URL('scripts/sql/ingredient-catalog-organization-20261007.sql',root),'utf8');
process.stdout.write(`BEGIN;\nSET LOCAL ROLE postgres;\nDO $settings$ BEGIN PERFORM set_config('homecook.catalog_organization_input',$catalog_org_input$${encoded}$catalog_org_input$,true); PERFORM set_config('homecook.catalog_organization_schema',$catalog_org_schema$${body}$catalog_org_schema$,true); END $settings$;\n${sql}`);
