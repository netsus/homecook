# Repository Source Consolidation Inventory

상태: **canonical inventory / cleanup steps 4–5**

기준 시각: 2026-09-05

Homecook 기준: `origin/master@1b008936df16dcef8f9a68a964a6ba8b4c616fce`

독립 funnel 기준: `feature/ad-hero-alignment@0aaa282552256ac9e77a5c134bb45a52e42ade33`

## 목적과 cleanup plan

이 문서는 Homecook을 랜딩의 유일한 개발·운영 source로 고정하기 전에 중복, 고유 자산,
active task, rollback 경계를 잠근다. 이 단계에서는 제품 코드, workflow, release 파일 또는
독립 저장소를 수정하거나 삭제하지 않는다.

정리 순서는 다음과 같다.

1. byte digest와 Git history로 중복 파일과 고유 파일을 분리한다.
2. 고유 광고 원본, 설계 기준, final source를 Homecook의 tracked canonical 위치에 먼저 보존한다.
3. Homecook 참조를 canonical 위치로 바꾸고 origin merge를 확인한다.
4. 독립 저장소를 사용하는 active task와 process가 모두 끝났는지 다시 확인한다.
5. remote가 없는 독립 Git history를 bundle 또는 mirror로 보존하고 복구 검증을 통과한다.
6. 위 조건을 모두 만족한 뒤에만 독립 저장소 삭제 또는 archive 전환을 별도로 판단한다.

기존 동작 보호 기준은 Homecook 제품 코드, CI workflow, production release 파일의 diff가
0인 것이다. 이 inventory 자체에는 새 dependency와 public contract 변경이 없다.

## Canonical source 판정

Homecook은 다음 운영 surface를 모두 가진다.

- `/beta` route와 marketing screen
- 앱 공용 style과 accessibility 처리
- marketing API, DB, server validation, tests
- `docs/marketing/` 운영 문서
- `ui/designs/evidence/marketing-demand-validation-v2/` 최종 비교 evidence
- `public/assets/funnel/` 운영 자산

현재 Homecook runtime은 독립 `mumeok-funnel` 경로를 읽지 않는다. 따라서 Homecook을
유일한 개발·운영 source로 삼는다. 독립 저장소는 아래 보존 조건이 끝날 때까지
**active remote-less archive candidate**로만 분류한다.

## Git 및 사용 상태

| 항목 | Homecook | 독립 funnel |
| --- | --- | --- |
| 기준 commit | `1b008936df16dcef8f9a68a964a6ba8b4c616fce` | `0aaa282552256ac9e77a5c134bb45a52e42ade33` |
| 기준 tree | `80183010c27f92f793dc92edbfff5a1fbf009a81` | `27052a41ee4a097ff8bcb29751238c07aa408861` |
| branch | detached exact master worktree | `feature/ad-hero-alignment` |
| tracked 상태 | clean | clean |
| remote | `origin` 있음 | 없음 |
| history | GitHub origin으로 복구 가능 | 23 commits, 단일 local worktree만 존재 |

독립 저장소의 `.omx/state/current-task-baseline.json`은
`feature/ad-hero-alignment`와 `feature/sites-mobile-landing-baseline`을 active로 기록한다.
조사 시점에는 해당 경로를 working directory로 사용하는 Codex/CUA process도 있었다.
따라서 step 5 또는 6에서 이 경로를 이동, prune, 삭제하면 안 된다.

## Digest inventory

독립 저장소 tracked 파일 120개의 현재 byte digest를 Homecook 현재 tree와 과거 prototype
commit에 대조했다.

| 분류 | 파일 수 | bytes | 처리 기준 |
| --- | ---: | ---: | --- |
| Homecook current tree와 동일 | 21 | 21,872,101 | canonical import가 필요 없는 중복 후보 |
| Homecook 과거 prototype commit과 동일 | 44 | 896,281 | Git history로 복구 가능한 standalone 중복 후보 |
| 독립 funnel에만 있는 tracked 파일 | 55 | 13,305,277 | 선행 import 없이는 제거 금지 |

현재 tree와 동일한 21개는 annotation 1개, brand 2개, character 6개, food 9개,
Hero D 1개, product 1개, share 1개다. 과거 prototype과 동일한 44개는 device frame,
mobile runtime, standalone scaffold, script와 test가 중심이다.

## 반드시 먼저 보존할 고유 파일

독립 funnel에만 있는 tracked 파일 55개는 다음 그룹이다.

| 그룹 | 파일 수 | bytes | 제안 canonical 위치 |
| --- | ---: | ---: | --- |
| final design baseline | 24 | 2,068,973 | `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/` |
| 광고 export | 7 | 6,344,161 | `docs/marketing/assets/campaign/` |
| 광고 source/decor | 4 | 2,812,762 | `docs/marketing/assets/source/` |
| Hero A/B/C solution·visual | 6 | 1,769,977 | final source evidence 아래 |
| final `Prototype.tsx`와 CSS | 2 | 104,654 | final source evidence 아래 |
| design QA와 product decisions | 2 | 87,116 | final source evidence 아래 |
| 광고 generator와 test | 2 | 27,394 | 재생산 필요성을 확인한 뒤 script 또는 archive로 분리 |
| 나머지 standalone 변경 | 8 | 90,240 | 운영 비의존을 재확인한 뒤 archive 또는 제거 |

ignored 원본도 Git rollback이 없으므로 별도 취급한다. 파일별 상대경로, bytes, SHA-256,
분류와 보존 결정은 `repository-source-consolidation-ignored-sources.json`과
`repository-source-consolidation-ignored-evidence.json`에 고정한다.

- source-like ignored 파일은 23개, 31,653,096 bytes다.
- 이 중 8개, 11,163,820 bytes는 Homecook current tree와 동일하다. landing board 4개와
  별도 한글 이름 복제 4개가 같은 `landing-a.png`~`landing-d.png` digest에 대응한다.
- 나머지 원본 15개, 20,489,276 bytes는 다른 Git 저장소에 없는 유일 원본이다. 화면 원본,
  wireframe, 결과 이미지, character source가 포함된다.
- ignored `evidence/`는 169개, 40,176,619 bytes다. 이 중 23개, 2,067,609 bytes는
  tracked final baseline과 동일하다.
- 나머지 evidence 146개, 38,109,010 bytes는 고유하다. 최소 final 광고 비교 묶음을 보존하고
  나머지 보존 정책을 명시하기 전에는 삭제하지 않는다.

고유 binary를 import할 때는 SHA-256 manifest를 함께 만들고, 추적된 Homecook commit이
origin에 merge된 뒤 원본 제거를 검토한다.

## 현재 참조와 전환 조건

Homecook의 source-of-truth, design 문서, workpack과 evidence가 과거 prototype SHA와
독립 절대 경로를 비교 근거로 참조한다. 운영 runtime 의존은 아니지만 독립 폴더를 없애기
전에는 참조를 Homecook tracked canonical 경로와 exact digest로 바꿔야 한다.

step 5의 완료 조건은 다음과 같다.

- 고유 원본, 광고 deliverable, final source와 baseline이 Homecook tracked 위치에 존재한다.
- 참조 문서와 검증 경로가 독립 절대 경로를 사용하지 않는다.
- 중복 제거 뒤에도 운영 `/beta` 및 관련 회귀 검사가 통과한다.
- canonical import commit이 origin에 merge되어 다른 clone에서 복구 가능하다.
- active task와 해당 경로를 사용하는 process가 0이다.

마지막 두 조건을 만족하지 못하면 독립 저장소는 삭제하지 않고 archive candidate로 유지한다.

## Step 5 보존 및 전환 결정

고유 파일은 Homecook이 소유하는 다음 canonical 위치로 먼저 복사하고, 파일별 bytes와 SHA-256은
`ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/manifest.json`에 고정한다.

- final source, visual baseline, prototype code와 설계 판단:
  `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/`
- 광고 deliverable: `docs/marketing/assets/campaign/0aaa282/`
- 광고 generator·test·source/decor 원본: `docs/marketing/assets/source/0aaa282/`

Homecook 문서와 Stage 4 capture manifest는 위 tracked 경로만 사용한다. 역사적 제품 계약의
source prototype commit `63f8ef2a019c6d260a96a42fab9d67f727d93557` 참조는 provenance로
유지하며, 현재 visual authority는 독립 폴더 위치가 아니라 repository-owned
`source-0aaa282/`와 그 manifest다.

독립 저장소의 remote-less Git history와 ignored 고유 원본은 저장소 밖 복구 archive로
보존했다. 비밀이나 archive 실경로를 문서에 넣지 않고
`docs/engineering/repository-source-consolidation-archive-receipt.json`에 다음 digest와 검증
결과만 기록한다.

- complete Git bundle: `40a8f6ff3d21d5f2d90b74f7dedf329f7cb86a7204651acf73fcf789816b60fc`
- ignored unique archive: `840763a848696dc1d606730e5c65661e796e008a6abe4f31a2128f45aa563a15`
- 검증: `git bundle verify`, restore clone, `git fsck --full --strict`, ignored manifest match 통과

receipt capture 시 독립 저장소를 사용하는 active task와 process가 남아 있었다. 따라서
독립 `mumeok-funnel` 저장소는 **삭제·이동·archive 전환하지 않고 현재 위치에 유지**한다.
canonical import가 origin에 merge되고 active task/process가 0이며 위 archive digest와 restore
검증을 다시 통과하기 전에는 삭제를 재검토하지 않는다.

## Rollback 기준

- Homecook 운영 rollback 기준은 `1b008936df16dcef8f9a68a964a6ba8b4c616fce`와 merge
  parent `4817b8b213b264485d75939ec764596727d1131c`,
  `94eb67c777390c7b7925e4b3a388f81a2f68ce45`이다.
- final visual/source 비교 기준은 독립 commit `0aaa282552256ac9e77a5c134bb45a52e42ade33`이다.
- 독립 commit은 Homecook object database에 없고 remote도 없다. 폴더 삭제 전 `git bundle --all`
  또는 mirror backup을 안정된 비-cache 위치에 만들고 `git bundle verify`, clone, `git fsck`,
  SHA-256 검증을 통과해야 한다.
- branch tips와 tree SHA를 backup manifest에 기록한다.
- `.artifacts`, `.omx`, 임시 폴더는 step 7 정리 대상이므로 유일 rollback 저장 위치로 쓰지 않는다.

## 제거 후보와 금지 경계

선행 import와 active-use 해제가 끝난 뒤의 후보는 다음과 같다.

- current tree와 동일한 tracked 21개
- Git history로 복구 가능한 historical-identical 44개
- standalone hosting, Vite, mobile device-frame runtime
- generated `dist`, `node_modules`, `test-results`
- tracked baseline과 동일한 ignored evidence 23개

다음은 현재 제거 금지다.

- tracked 고유 55개
- manifest에 `unique`로 고정된 ignored 고유 원본 15개와 고유 evidence 146개
- active task가 사용하는 독립 repository와 그 Git history
- Homecook production release source, release evidence, 운영 checkout

## Step 4 검증 기록

- Homecook exact master commit과 clean worktree 확인
- 독립 funnel clean tracked tree, branch, commit 수, remote 부재 확인
- tracked 120개 digest 대조 및 파일 수·byte 합계 확인
- ignored source-like 23개와 evidence 169개의 파일별 SHA-256 manifest 확인
- Homecook runtime의 독립 경로 비의존 확인
- Codex task와 process의 active-use 확인
- 제품 코드, workflow, release 파일, 독립 저장소 변경 없음
