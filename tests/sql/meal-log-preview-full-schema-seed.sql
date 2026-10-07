begin;set local request.jwt.claim.role='service_role';select public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',true);
insert into public.nutrient_definitions (code, label, unit, display_order, is_core) values
  ('energy_kcal', '열량', 'kcal', 1, true),
  ('carbohydrate_g', '탄수화물', 'g', 2, true),
  ('protein_g', '단백질', 'g', 3, true),
  ('fat_g', '지방', 'g', 4, true),
  ('sodium_mg', '나트륨', 'mg', 5, true),
  ('sugars_g', '당류', 'g', 6, false),
  ('saturated_fat_g', '포화지방', 'g', 7, false),
  ('fiber_g', '식이섬유', 'g', 8, false);
      insert into public.nutrition_sources(
        id,provider_code,dataset_name,source_kind,source_version,data_basis_date,fetched_at,
        freshness_checked_at,freshness_status,priority_rank,source_url,license_name,license_url,
        manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active
      ) values(
        'bb000000-0000-4000-8000-000000000001','STAGE3N','stage3 nutrition','nutrition_dataset','1','2026-08-10',now(),now(),
        'current',1,'https://example.test/nutrition','test-only','https://example.test/license',repeat('8',64),
        'approved','stage3 fixture','a1000000-0000-4000-8000-000000000001',now(),true
      );
      insert into public.nutrition_source_items(
        id,source_id,external_item_key,external_name,preparation_state,source_basis_text,
        source_basis_amount,source_basis_unit,edible_portion_percent,stable_fingerprint,review_status,
        decision_reason,reviewed_by,reviewed_at
      ) values
        ('bb000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000001','stage3-ingredient','검증 김치','raw','100 g',100,'g',100,repeat('9',64),'approved','stage3 fixture','a1000000-0000-4000-8000-000000000001',now()),
        ('bb000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001','stage3-product','stage3 product',null,'100 g',100,'g',100,repeat('a',64),'approved','stage3 fixture','a1000000-0000-4000-8000-000000000001',now());
      insert into public.nutrition_profiles(
        id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,version,
        review_status,decision_reason,reviewed_by,reviewed_at,is_active,created_by
      ) values
        ('bb000000-0000-4000-8000-000000000004','bb000000-0000-4000-8000-000000000002','ingredient_source','mass_100g',100,'g',1,'approved','stage3 fixture','a1000000-0000-4000-8000-000000000001',now(),true,'a1000000-0000-4000-8000-000000000001'),
        ('bb000000-0000-4000-8000-000000000005','bb000000-0000-4000-8000-000000000003','product_label','mass_100g',100,'g',1,'approved','stage3 fixture','a1000000-0000-4000-8000-000000000001',now(),true,'a1000000-0000-4000-8000-000000000001');
      insert into public.nutrition_values(profile_id,nutrient_code,source_nutrient_code,source_unit,amount,value_status)
      select profile_id,nutrient_code,nutrient_code,case when nutrient_code='energy_kcal' then 'kcal' when nutrient_code='sodium_mg' then 'mg' else 'g' end,amount,'observed' from (values
        ('bb000000-0000-4000-8000-000000000004'::uuid,'energy_kcal',100::numeric),
        ('bb000000-0000-4000-8000-000000000004'::uuid,'carbohydrate_g',20::numeric),
        ('bb000000-0000-4000-8000-000000000004'::uuid,'protein_g',10::numeric),
        ('bb000000-0000-4000-8000-000000000004'::uuid,'fat_g',5::numeric),
        ('bb000000-0000-4000-8000-000000000004'::uuid,'sodium_mg',50::numeric)
      ) values(profile_id,nutrient_code,amount);
      insert into public.ingredient_nutrition_profiles(
        id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,
        review_status,decision_reason,reviewed_by,reviewed_at,version,is_active
      ) values
        ('bb000000-0000-4000-8000-000000000006','a8000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000004','raw','exact_standard_name',true,'approved','stage3 fixture','a1000000-0000-4000-8000-000000000001',now(),1,true);

select public.set_account_generation_internal_writer_marker('a5000000-0000-4000-8000-000000000001',false);
commit;