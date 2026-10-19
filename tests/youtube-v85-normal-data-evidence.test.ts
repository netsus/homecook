import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {V85_NORMAL_TABLES,v85NormalTableProjection,readV85NormalTables,assertV85AcceptedNormalTables} from '../scripts/lib/youtube-v85-normal-data-evidence.mjs';

const tables=()=>V85_NORMAL_TABLES.map(table=>({table,count:0,sha256:'a'.repeat(64)}));
describe('exact whole-column DB232 normal-data table evidence',()=>{
  it('uses PostgreSQL JSONB array spacing and all 41 tables in fixed order',()=>{
    const data=tables(),postgres='['+data.map(e=>`["${e.table}", "${e.sha256}"]`).join(', ')+']';
    expect(v85NormalTableProjection(data)).toBe(createHash('sha256').update(postgres).digest('hex'));
    expect(()=>assertV85AcceptedNormalTables(data)).toThrow();
  });
  it('rejects omitted, duplicated, reordered, extra-column and invalid-count evidence',()=>{
    const mutations:Array<(v:ReturnType<typeof tables>)=>unknown>=[v=>v.pop(),v=>v.reverse(),v=>{v[1]=v[0];},
      v=>{v[0].count=-1;},v=>{v[0].count=Number.MAX_SAFE_INTEGER+1;},v=>{Object.assign(v[0],{rawRows:[]});},v=>{v[0].sha256='not-a-sha';}];
    for(const mutate of mutations){
      const data=tables();mutate(data);expect(()=>v85NormalTableProjection(data)).toThrow();
    }
  });
  it('decomposes the actual exported chunk projection and checks the database recomposition',async()=>{
    const data=tables(),value={tables:data.map(e=>[e.table,e.sha256]),counts:data.map(e=>[e.table,e.count]),normalDataSha256:v85NormalTableProjection(data)};
    const query=vi.fn(async(sql:string)=>{expect(sql).toContain('SELECT');return JSON.stringify(value);});
    expect(await readV85NormalTables(query)).toEqual({tables:data,normalDataSha256:value.normalDataSha256});
    const sql=query.mock.calls[0][0];
    expect(sql).toContain('WITH projection AS MATERIALIZED');expect(sql).toContain('quantity-v4-row-sha256-chunks-v1');
    expect(sql).toContain('to_jsonb(t)::text');expect(sql).toContain('FROM public.recipes t');
    value.normalDataSha256='b'.repeat(64);await expect(readV85NormalTables(query)).rejects.toThrow();
    value.normalDataSha256=v85NormalTableProjection(data);value.counts.reverse();await expect(readV85NormalTables(query)).rejects.toThrow();
  });
});
