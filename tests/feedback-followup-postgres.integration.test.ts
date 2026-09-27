import { expect, it } from "vitest";
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateRecipeDraftNutrition } from '../lib/server/recipe-content-snapshot-future-propagation';
import draft from './fixtures/strawberry-milk-pudding-fork.json';
it.skipIf(process.env.HOMECOOK_FEEDBACK_SQL_CHECK !== '1')('validates pudding component IDs and removes depleted recent foods in isolated PostgreSQL', async () => {
const bin=process.env.HOMECOOK_TEST_POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@15/bin';
const root=mkdtempSync(join(tmpdir(),'homecook-followup-sql-'));
const data=join(root,'data'),sock=join(root,'socket');mkdirSync(sock);
const run=(name:string,args:string[],input?:string)=>execFileSync(join(bin,name),args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
const sql=(body:string)=>run('psql',['-h',sock,'-p','56429','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1'],body);
let started=false;
try {
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale']);
 run('pg_ctl',['-D',data,'-o',`-p 56429 -h '' -k ${sock}`,'-l',join(root,'postgres.log'),'-w','start']);started=true;
 const migration=readFileSync('supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql','utf8');
 const start=migration.indexOf('create function public.validate_recipe_nutrition_snapshot_payload');
 const end=migration.indexOf('$$;',start)+3;
 sql(migration.slice(start,end));
 const query={select:()=>query,in:()=>query,eq:()=>query,order:()=>query,range:async()=>({data:[],error:null})};
 const nutrition=await calculateRecipeDraftNutrition({from:()=>query} as never,{recipeId:'6e6314e6-800d-4b6e-abb5-c05171042e28',baseRecipeRevision:1,draft} as never);
 const payload={...nutrition.nutritionSnapshot,base_servings:draft.base_servings,input_hash:'a'.repeat(64),calculated_at:new Date().toISOString()};
 sql(`select public.validate_recipe_nutrition_snapshot_payload($json$${JSON.stringify(payload)}$json$::jsonb);`);
 let oldRejected=false;
 try{sql(`select public.validate_recipe_nutrition_snapshot_payload($json$${JSON.stringify(payload).replaceAll('-row-',':row:')}$json$::jsonb);`);}catch(error){oldRejected=String((error as { stderr?: unknown }).stderr).includes("INVALID_SNAPSHOT_PAYLOAD");}
 if(!oldRejected)throw new Error('Old colon row ID was not rejected');
 const source=readFileSync('supabase/migrations/20260810120000_meal_log_core.sql','utf8');
 const fnstart=source.indexOf('create or replace function public.get_recent_meal_log_sources');
 const fnend=source.indexOf('$function$;',fnstart)+11;
 sql(`create schema private;
 create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb language sql as $$select '{"account_generation":1}'::jsonb$$;
 create table public.leftover_dishes(id uuid,user_id uuid,status text,batch_status text);
 create table public.ingredients(id uuid);
 create table public.food_products(id uuid,deleted_at timestamptz,moderation_status text,visibility text,owner_user_id uuid);
 create table public.meal_log_entries(id uuid,owner_user_id uuid,account_generation bigint,deleted_at timestamptz,source_type text,cooked_batch_id uuid,food_product_id uuid,ingredient_id uuid,display_name_snapshot text,display_brand_snapshot text,actual_amount numeric,actual_unit text,consumed_local_date date,created_at timestamptz);
 ${source.slice(fnstart,fnend)}`);
 sql(readFileSync('supabase/migrations/20260928010000_meal_log_recent_available_batches.sql','utf8'));
 sql(`insert into public.leftover_dishes select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',case when i=2 then 'eaten' else 'leftover' end,case when i=3 then 'depleted' when i=2 then null else 'available' end from generate_series(1,3)i;
 insert into public.meal_log_entries select id,user_id,1,null,'cooked_batch',id,null,null,'fixture',null,100,'g',current_date,now() from public.leftover_dishes;`);
 const result=JSON.parse(sql(`select public.get_recent_meal_log_sources('10000000-0000-4000-8000-000000000001',now(),'test',1,now(),20,null,null);`).trim());
 if(result.data.items.length!==1 || !result.data.items[0].source_id.endsWith('000001'))throw new Error('Depleted recent filter failed');
 expect(draft.ingredients).toHaveLength(12);
 expect(oldRejected).toBe(true);
 expect(result.data.items).toHaveLength(1);
} finally {
 if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 rmSync(root,{recursive:true,force:true});
}

}, 30_000);
