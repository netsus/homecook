import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCookingSchemaDump as canonical} from '../scripts/lib/cooking-schema-restore-comparison.mjs';
const block=(type,name,body)=>`--\n-- Name: ${name}; Type: ${type}; Schema: public; Owner: postgres\n--\n${body}\n`;
test('independent GRANT ordering preserves every entry and REVOKE boundary',()=>{
 const a=block('ACL','t','REVOKE ALL ON TABLE public.t FROM PUBLIC;\nGRANT SELECT ON TABLE public.t TO anon;\nGRANT SELECT ON TABLE public.t TO authenticated;');
 const b=block('ACL','t','REVOKE ALL ON TABLE public.t FROM PUBLIC;\nGRANT SELECT ON TABLE public.t TO authenticated;\nGRANT SELECT ON TABLE public.t TO anon;');
 assert.equal(canonical(a),canonical(b));
 assert.notEqual(canonical(a),canonical(b.replace('SELECT','ALL')));
 assert.notEqual(canonical(a),canonical(b.replace('REVOKE ALL ON TABLE public.t FROM PUBLIC;','')));
});
test('overlapping GRANT and REVOKE order stays significant',()=>{
 const grant='GRANT SELECT ON TABLE public.t TO anon;',revoke='REVOKE SELECT ON TABLE public.t FROM anon;';
 assert.notEqual(canonical(block('ACL','t',`${grant}\n${revoke}`)),canonical(block('ACL','t',`${revoke}\n${grant}`)));
});
test('RLS role ordering preserves membership and predicates',()=>{
 const a=block('POLICY','read','CREATE POLICY read ON public.t TO authenticated, anon USING (true);');
 const b=a.replace('authenticated, anon','anon, authenticated');
 assert.equal(canonical(a),canonical(b));
 assert.notEqual(canonical(a),canonical(b.replace('anon, authenticated','anon')));
 assert.notEqual(canonical(a),canonical(b.replace('(true)','(false)')));
});
test('only reviewed varchar-array check deparsing is normalized',()=>{
 const body="    CONSTRAINT cooking_sessions_contract_version_check CHECK (contract_version = ANY ((ARRAY['legacy_v1'::character varying, 'snapshot_v2'::character varying])::text[])))";
 const a=block('TABLE','cooking_sessions',body);
 const b=a.replace("((ARRAY['legacy_v1'::character varying, 'snapshot_v2'::character varying])::text[])","(ARRAY[('legacy_v1'::character varying)::text, ('snapshot_v2'::character varying)::text])");
 assert.equal(canonical(a),canonical(b));
 assert.notEqual(canonical(a),canonical(b.replace('snapshot_v2','other')));
 assert.notEqual(canonical(a.replace('cooking_sessions_contract_version_check','unknown_check')),canonical(b.replace('cooking_sessions_contract_version_check','unknown_check')));
});
test('function bodies including SQL-looking lines remain byte-sensitive',()=>{
 const a=block('FUNCTION','f()','CREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $$\nGRANT SELECT ON TABLE public.t TO anon;\nREVOKE ALL ON TABLE public.t FROM PUBLIC;\n$$;');
 const b=a.replace('GRANT SELECT ON TABLE public.t TO anon;\nREVOKE ALL ON TABLE public.t FROM PUBLIC;','REVOKE ALL ON TABLE public.t FROM PUBLIC;\nGRANT SELECT ON TABLE public.t TO anon;');
 assert.notEqual(canonical(a),canonical(b));
});

test('dump-looking content inside a function string stays byte-sensitive',()=>{
 const a=block('FUNCTION','f()',"CREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $body$ SELECT $value$\n-- Dumped by pg_dump version A\n\\restrict A\n$value$; $body$;");
 assert.notEqual(canonical(a),canonical(a.replaceAll('version A','version B')));
 assert.notEqual(canonical(a),canonical(a.replaceAll('restrict A','restrict B')));
});
test('default-ACL revocation order is preserved',()=>{
 const grant='ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO anon;',revoke='ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE SELECT ON TABLES FROM anon;';
 assert.notEqual(canonical(block('DEFAULT ACL','t',`${grant}\n${revoke}`)),canonical(block('DEFAULT ACL','t',`${revoke}\n${grant}`)));
});

test('a fake object header inside a function body fails closed',()=>{
 const body='CREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $body$ SELECT $value$\n--\n-- Name: fake; Type: ACL; Schema: public; Owner: postgres\n--\nGRANT SELECT ON TABLE public.t TO anon;\nGRANT SELECT ON TABLE public.t TO authenticated;\n$value$; $body$;';
 assert.throws(()=>canonical(block('FUNCTION','f()',body)),/truncated function/u);
 assert.throws(()=>canonical(block('FUNCTION','f()',body.replace('TO anon','TO other'))),/truncated function/u);
});
