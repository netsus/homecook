import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {canonicalCookingCatalogSql,unchangedCookingCatalogSql} from '../scripts/lib/cooking-catalog-comparison.mjs';
import {PROTECTED_CATALOG_SQL,PROTECTED_IMMUTABLE_CATALOG_SQL,COOKED_WEIGHT_STABLE_IMMUTABLE_SQL} from '../scripts/lib/prelaunch-database.mjs';
import {COOKING_FUNCTION_SIGNATURES} from '../scripts/lib/cooking-experience-maintenance.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('original global catalog query bytes remain fixed',()=>{
 assert.equal(hash(PROTECTED_CATALOG_SQL),'2e7deb2361f3311aab30aea9687af3b296780c9543b273ec71526ef9c524c399');
 assert.equal(hash(PROTECTED_IMMUTABLE_CATALOG_SQL),'0cdb7eb817e3977a5e9b3bbefdbea7b9205d82a6045d7676a8c3faae4c4bfa65');
 assert.equal(hash(COOKED_WEIGHT_STABLE_IMMUTABLE_SQL),'017e7b65aecc350ff69ccfc816150a9f44999c93f34b7025c0af67f126f2448a');
});
test('canonical view rejects unknown SQL including trivial edits',()=>{
 for(const sql of ['',`${PROTECTED_CATALOG_SQL} `,'select 1;'])assert.throws(()=>canonicalCookingCatalogSql(sql));
 for(const sql of [PROTECTED_CATALOG_SQL,PROTECTED_IMMUTABLE_CATALOG_SQL,COOKED_WEIGHT_STABLE_IMMUTABLE_SQL])assert.match(canonicalCookingCatalogSql(sql),/sha256/);
});
test('raw remainder excludes exactly the ten fixed identities and one table',()=>{
 const sql=unchangedCookingCatalogSql(PROTECTED_CATALOG_SQL);
 const identities=[...sql.matchAll(/to_regprocedure\('([^']+)'\)/g)].map(match=>match[1]);
 assert.deepEqual(identities,COOKING_FUNCTION_SIGNATURES);
 assert.equal((sql.match(/c\.relname='cooking_execution_quantities'/g)||[]).length,1);
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM unnest/);
 assert(!sql.includes('coalesce(c.relacl'));
 assert(sql.includes('jsonb_build_array(a.attnum,a.attname'));
 assert(sql.includes('rolsuper,rolinherit,rolcreaterole,rolcreatedb'));
 for(const other of [PROTECTED_IMMUTABLE_CATALOG_SQL,COOKED_WEIGHT_STABLE_IMMUTABLE_SQL,`${PROTECTED_CATALOG_SQL} `])assert.throws(()=>unchangedCookingCatalogSql(other));
});
test('canonical default privileges keep empty and column ACLs distinct',()=>{
 const sql=canonicalCookingCatalogSql(PROTECTED_CATALOG_SQL);
 assert(sql.includes("coalesce(c.relacl,acldefault('r',c.relowner))"));
 assert(sql.includes("coalesce(nspacl,acldefault('n',nspowner))"));
 assert(!sql.includes("acldefault('c'"));
 assert(!sql.includes('nullif('));
 assert(sql.includes('a.attacl IS NULL THEN NULL'));
 assert(sql.includes("visible.attnum<=a.attnum"));
});
