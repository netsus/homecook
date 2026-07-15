# 실제 공공 영양데이터 + FoodSafety-30 로컬 파일럿 증거 (2026-07-15)

## 판정 경계

- 이 문서는 격리된 로컬 파일럿 증거다. production/staging 적재 승인, 사람의 최종 nutrition/conversion/piece 결정, 슬라이스 전체 closeout을 뜻하지 않는다.
- 구현 기준선은 PR #1004의 merge commit `574c078e98a080d0f4812bc593f4a6aa524efcf2`이며, implementation head `829f4e15e0a1fd038cc6323a4efb3ca71fff7800`을 포함한다.
- 실제 key, 인증 query, provider 원문 row, workbook 원문 row, approval의 ID 목록은 이 문서와 git 산출물에 넣지 않았다.

## 공식 원본 pin

### MFDS 식품영양성분DB정보 15127578

- 공식 문서: `https://www.data.go.kr/data/15127578/openapi.do`
- 공식 GET endpoint: `https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02`
- source version: data.go.kr 수정일 `2025-12-05`
- 문서 원본 취득: `2026-07-15T01:10:31Z`, `238,966` bytes
- 문서 원본 SHA-256: `aeb862c48ef36f61a653ede067b36c39f167c17fd0f062cc8cf8666ea856a89f`
- 공식 optional filter 7개를 문서 원본에서 확인했다: `FOOD_NM_KR`, `RESEARCH_YMD`, `MAKER_NM`, `FOOD_CAT1_NM`, `ITEM_REPORT_NO`, `UPDATE_DATE`, `DB_CLASS_NM`.
- 실제 API smoke는 `FOOD_NM_KR` 1개, `numOfRows=1`, `maxPages=1`로 1회만 호출했다. 한 글자 부분값에 provider total `10,958`을 반환했으므로 contains 동작임을 확인했고, 1행 수신 후 `PAGINATION_INCOMPLETE`로 중단했다.
- MFDS provider raw page는 complete batch가 아니므로 저장·승인·promotion하지 않았다. sanitized failure manifest만 남겼고 production DB writes는 0이다.
- 필터 없는 전체 302,629건은 page size 100 기준 3,027 calls이며 retry 최악 12,108 calls가 될 수 있어 실행하지 않았다.

### 농촌진흥청 국가표준식품성분 DB 10.4

- 공지: `https://www.nics.go.kr/food/kfi/notice/view?bbsSnn=41`
- Excel 안내/취득 UI: `https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562`
- 검색: `https://www.nics.go.kr/food/kfi/fct/fctFoodSrch/list`
- 공식 UI의 `downloadImg.do` POST를 1회 사용했다. 활용신청과 API key는 필요하지 않았다.
- version/release/license: `10.4`, `2026-04-28`, 3,366식품·최대 130성분, Excel 공공누리 제1유형(출처표시).
- 권장 출처: `농촌진흥청, 2026. 국가표준식품성분 DB 10.4`
- 원본 파일명: `식품성분표(10개정판).xlsx`
- 원본 취득: `2026-07-15T00:18:01Z`, `13,348,408` bytes
- 원본 파일 SHA-256: `271cc431f2991b3c0c049ec6e05fb59a040319e984ab71468184530de61dec50`
- workbook은 10 sheets이며 대상 sheet `국가표준식품성분 Database 10.4`는 3 header rows + 3,366 data rows다.
- `가식부 100g 당 (per 100g Edible Portion)`은 영양값의 산출 기준 text로만 보존했다. 가식률 100%를 뜻하지 않으므로 `edible_portion_percent`는 null이다.
- 과거 RDA V2 API 2,549행 자료와 RDA 10.0 OpenAPI 15143598은 10.4 원본 pin이 아니므로 primary로 승격하지 않았다.

### 농촌진흥청 양념재료 계량 근거

- 공식 페이지: `https://www.nics.go.kr/food/kfi/hsMarinade/list_03`
- 제한된 숫자 사실 6건은 모두 `needs_source_check` + `human_review_required`다.
- 사용자 승인은 제한 사실 검수에만 적용되며 profile/assignment 생산 승인으로 해석하지 않았다. local apply의 conversion candidate, piece candidate, active assignment는 모두 0이다.

## 실제 raw → normalize → review → promote

| 범위 | raw | normalized | rejected | quarantine/미결 | 결과 |
| --- | ---: | ---: | ---: | ---: | --- |
| RDA 10.4 전체 | 3,366 | 3,350 | 3,337 | 16 `malformed_nutrient` | blocker 3,353, promotion 차단 |
| FoodSafety-30 exact 선택 범위 | 13 | 13 | 0 | 영양 row 0 | `approved_pinned` 13 |

전체 원본 범위 pin:

- logical batch: `f5cef52a44bf8b944939a9c2fec0b7c83895ecc597a61888b006eba24d5852b2`
- raw snapshot SHA-256: `7312e30ea6a9a4c0667261a749c635c60bc78deeffc57e69d03eee64a3fe84a3`
- normalized content SHA-256: `ec0ba11966e0e8d03ab0e821f32940f7030711453855142dae645a2622d5368b`
- review checksum: `c0b542fa78652a29d109330dec3f607a28fc4b46b2680abbd8c02c1fffcbdb0d`
- `scope_selection=all_official_file_items`, count `3,366`, scope keys SHA-256 `94f4756b0adae0122c39bdaec2c05aad53383ebb13ffff9a88b65b1af63fa8b2`

최종 exact 선택 범위 pin:

- logical batch: `7ede683988d9c23d0a89416d9b237df6b01e3a2720f045b96dbf11253ff833bc`
- raw snapshot SHA-256: `c02c1b3d221c05712dbb66b70e5bd0629e3593882c4b210fe99e802a63e42d6f`
- normalized content SHA-256: `6aa63f70e26d688d0a998d18e30c0a3dea1701fc6836d8a13f5b791a509805e9`
- review checksum: `2064727516a8d4b7817d82da5ee4f0a0404412bb6089644d69597eb8e72fe9bb`
- approved handoff checksum: `457b70404e88564ab0e3d26d7d7e0d35db87babfa607b9472d1ac683538e1dcf`
- `scope_selection=selected_item_keys`, count `13`, scope keys SHA-256 `95b9fc67cd41cfb05e124a127884d5c385a796ff8a3e4251c74ec4c448b922d9`

이 13건은 FoodSafety-30의 현재 canonical ingredient 124개 중 13개다. ingredient coverage는 `13/124`이며 30개 레시피 영양 완전 커버가 아니다. disable 전 audit에서 승인 link를 하나 이상 참조하는 레시피는 `21/30`이었다.

## 격리 로컬 DB 실행

- Supabase Docker bootstrap은 이 세션이 만든 container가 `Created`에서 진행되지 않아 중단했고, 해당 container/volume만 제거했다. 기존 사용자 DB/container/volume은 변경하지 않았다.
- fallback은 이 worktree 전용 data/socket, loopback `127.0.0.1:55432`, database `homecook_public_data_pilot`의 PostgreSQL `14.5`였다. 65개 migration을 적용한 뒤 파일럿 종료 시 cluster를 stop하고 전용 PG directory를 삭제했다.
- seed 원문은 exact recipe 30개와 unique ingredient name 130개다. 현재 migration 결과의 canonical merge를 반영한 actual/expected closure는 각각 recipe `30/30`, ingredient ID `124/124`, 양방향 차이 0이다.
- approval file은 격리 로컬 파일럿 fixture일 뿐 production approval이 아니다. nutrition decision 13, conversion decision 0, piece decision 0이며 approval SHA-256은 `4cf2ccad9d48a64c1c3c10d8031c7ef8a9fcad18a77543d5f1b15cb190f84291`이다.

| 단계 | run ID | 결과 |
| --- | --- | --- |
| dry-run | `model-ea56fa3babfaff65b5998828` | recipe 30, ingredient 124, candidate 13, writes 0 |
| apply | `model-633be4a53c7d5df9c6b2301d` | applied, approved links 13, writes 106 |
| 동일 apply replay | 동일 | replayed, writes 0 |
| report | 동일 | registry checksum 검증, report checksum `15a534d83e956d0e8800b1418cb4bec49c4730844813185c8d1342507c374bb9` |
| disable | `disable-9e15e79925d7afc924286cff` | revoked 13, payload deleted 0, writes 14 |
| 동일 disable replay | 동일 | replayed, writes 0 |
| disable 뒤 동일 apply | `model-633be4a53c7d5df9c6b2301d` | replayed, writes 0, active links 0 |

disable 뒤 source item payload 13건은 보존됐고 active nutrition link, conversion assignment, piece weight는 모두 0이다.

## 실패 경계 / RLS / rollback

- raw snapshot 변조 normalize: `RAW_CHECKSUM_MISMATCH`, production writes 0.
- handoff checksum 변조: `INVALID_HANDOFF_BUNDLE`, writes 0.
- decision natural-key collision: `INVALID_APPROVAL_FILE`, writes 0.
- 위 3건 전후 model registry/source/item/link/assignment/piece count는 동일했다.
- PostgreSQL integration 9 tests가 anon/authenticated RLS 거부, security-definer search path, audit 필수값, append-only, active uniqueness, concurrent approval serialization, apply/disable replay, injected transaction rollback을 실제 DB에서 통과했다.
- full RDA bundle의 unapproved/quarantined row를 포함한 promotion은 `PROMOTION_BLOCKED`였다.

## 남은 위험과 다음 dependency

- 이번 exact bundle은 `13/124` ingredient coverage다. 남은 111 canonical ingredient와 9개 레시피에는 승인된 영양 link가 하나도 없을 수 있으며 사람이 검수한 추가 source item이 필요하다.
- 계량 evidence 6건은 계속 `needs_source_check/human_review_required`; active conversion/piece assignment는 0이다.
- production/staging load는 실행하지 않았고 별도 운영 승인이 필요하다.
- 로컬 증거는 PostgreSQL 14.5다. Supabase/production PostgreSQL 17 동등성은 확인되지 않은 위험이다.
- 다음 recipe nutrition slice는 위 exact handoff checksum과 RDA 10.4 원본 SHA를 pinned dependency로 사용하고, 완제품 MFDS 단계는 `FOOD_NM_KR` contains 결과만으로 승인하지 말고 `FOOD_NM_KR + ITEM_REPORT_NO` bounded query와 explicit review를 사용한다.
- 이전 pre-fix/percent=100 로컬 bundle은 최종 dependency가 아니다. 위 `7ede...` logical batch와 `457b...` handoff만 사용한다.
