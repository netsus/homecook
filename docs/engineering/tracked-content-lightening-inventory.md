# Tracked Content Lightening Inventory

상태: **10-A canonical inventory / 10-B safe removals complete**

기준 commit: `fa2aaa1fc86ddc73bf5f8fac9f8e3b4365440ddb`

이 문서는 Git 이력 재작성 없이 현재 checkout, 검색 범위, Codex 컨텍스트를 줄이기 위한
추적 콘텐츠 분류 기준이다. 크기는 `git ls-tree`의 object size를 합산했으며 로컬 생성물과
무시된 파일은 포함하지 않는다.

## 전체 추적 현황

| 경로 | 파일 수 | MiB |
| --- | ---: | ---: |
| 전체 tracked | 6,981 | 451.278 |
| `ui/designs` | 1,804 | 185.923 |
| `public` | 1,322 | 141.005 |
| `docs` | 1,121 | 70.534 |
| `tests` | 968 | 25.382 |
| `qa` | 142 | 8.585 |
| `scripts` | 450 | 7.292 |

확장자 기준으로 PNG는 1,762개/289.076MiB, WebP는 1,126개/68.740MiB,
Markdown은 1,252개/34.194MiB, HTML은 36개/19.130MiB다.

## 분류와 보존 경계

| 분류 | 경로 | 파일 수 | MiB | 근거 |
| --- | --- | ---: | ---: | --- |
| 런타임 필수 | `public/assets/funnel` | 30 | 30.255 | `/beta` 화면이 직접 참조 |
| 런타임 필수 | `public/assets/plush-v2` | 844 | 52.095 | 동적 sticker 경로 목록이 소비 |
| 테스트 필수 | `ui/designs/reference` | 91 | 3.813 | Wave1 validator가 manifest와 screenshot 존재 검증 |
| 테스트 필수 | `ui/designs/brand/mumeok` | 21 | 3.522 | brand asset 크기·SHA·runtime 사본 일치 테스트 |
| 테스트 필수 | `ui/designs/prototypes/claude-design-260505-wave1` | 30 | 1.749 | prototype lock validator의 고정 경로 |
| 테스트 필수 | `ui/designs/prototypes/homecook-baemin-prototype.html` | 1 | 2.084 | parity capture scripts 3개가 직접 사용 |
| 현재 canonical source | `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282` | 42 | 4.681 | CSoT와 53-file manifest checksum 계약 |
| 현재 canonical source | `docs/marketing/assets` | 13 | 8.759 | campaign/source 복구 원본과 manifest 계약 |
| 감사·설계 증거 | `ui/designs/evidence` | 1,391 | 156.449 | workpack/authority 완료 증거; 파일별 재분류 필요 |
| 감사·설계 증거 | `docs/design/assets` | 17 | 27.406 | 성장 기능 설계 원본이 직접 참조 |

위 경로는 디렉터리 단위로 삭제하지 않는다. 특히 `public/assets/funnel`과
`docs/marketing/assets/source`는 런타임 또는 canonical 복구 원본이므로 명시적인 계약 변경과
대체 검증 없이는 제거하지 않는다.

## 참조 그래프

```text
runtime components ───────────────> public/assets/funnel
dynamic sticker catalog ─────────> public/assets/plush-v2
brand contract tests ────────────> ui/designs/brand/mumeok
Wave1 validator ─────────────────> ui/designs/reference
                                └> ui/designs/prototypes/claude-design-260505-wave1
parity capture scripts ──────────> ui/designs/prototypes/homecook-baemin-prototype.html
CURRENT_SOURCE_OF_TRUTH ─────────> marketing-demand-validation-v2/source-0aaa282
manifest SHA/size test ──────────> docs/marketing/assets/{campaign,source}/0aaa282
workpack/authority documents ────> ui/designs/evidence + docs/design/assets
```

## 10-B 후보 순서

삭제 전 각 후보는 exact path `git grep`, import/workflow 참조, manifest 존재 검증과 관련
회귀 테스트를 다시 확인한다.

1. `ui/designs/prototypes/claude-design-260510-desktop/`
   - HTML 1개, 7.694MiB.
   - 저장소 exact path와 filename 참조가 0개다.
   - 역사적 archive이지만 현재 runtime/test/canonical 계약은 발견되지 않았다.
   - 첫 소형 삭제 PR 후보이며 신뢰도는 높다.
2. `docs/design/preview*.html`
   - 10-B에서 exact 참조 0인 초기 C2 비교물 5개를 제거했다.
3. `ui/designs/prototypes/claude-design-260512-desktop/project/*standalone*.html`
   - 10-B에서 큰 standalone bundle 1개를 제거하고 5.5KiB generation source는 보존한다.
   - modular source가 현재 `REFERENCE_LOCK`이며 standalone은 직접 실행 참조가 확인되지 않았다.
   - 재생성 가능성과 폴더 메모 의미를 한 번 더 확인한다.
4. `ui/designs/evidence/desktop-modern-redesign`
   - 182개, 50.075MiB.
   - 활성 runtime/test 직접 참조는 확인되지 않았지만 12개 파일이 참조한다. 이 중
     handoff/phase ledger는 8개이고 자체 QA JSON 3개와 현재 porting ledger 1개가 남아 있다.
   - final/ledger를 남기고 중간 phase와 byte-identical 파일부터 축약한다.

동일 Git blob은 전체 저장소에 79그룹/추가 사본 93개/9.899MiB가 있다. 대상 디자인 영역에는
59그룹/추가 사본 62개/8.386MiB가 있다. Git object는 이미 한 번만 저장하므로 이 수치는
checkout 파일 수와 검색 컨텍스트 감소 후보이며 Git object 용량 감소량으로 합산하지 않는다.

## 미확정 사항

- 문서에 기록되지 않은 수동 디자인 활용 여부
- 완료 workpack의 원본 screenshot 보존 기간
- 감사 목적에서 bitmap 원본이 필요한 최소 기간
- `desktop-modern-redesign`의 final evidence 최소 보존 집합

미확정 항목은 삭제 근거로 사용하지 않는다. 10-B는 참조 0과 대체 가능한 audit pointer가
확인된 작은 후보부터 별도 PR로 진행한다.

## 10-B removal receipts

### `claude-design-260510-desktop` standalone archive

- 제거 대상: `homecook desktop prototype _standalone_.html` 1개
- 제거량: 8,067,786 bytes / 7.694MiB
- 제거 후 tracked 기준: 6,981개 / 443.591MiB
- 직접 참조: inventory의 후보 기록 외 runtime/test/workflow exact path·filename 참조 0
- 동적 탐색: prototype HTML을 자동 열거하는 실행 경로 0
- 복구: Git commit `59779af90`과 현재 삭제 전 blob `0968acd11a122f5dc32c856e79d2275575dab8af`
- 보존 경계: `public/assets/funnel`, current parity prototype, Wave1 lock, canonical marketing source는 미변경

### `claude-design-260512-desktop` generated standalone bundle

- 제거 대상: `homecook desktop prototype (standalone).html` 1개
- 제거량: 5,457,164 bytes / 5.204MiB
- 누적 제거 후 tracked 기준: 6,980개 / 438.386MiB
- 현재 authority: `components/web/REFERENCE_LOCK.md`가 modular HTML/CSS를 지정하고 README도
  `homecook desktop prototype.html`과 imports를 primary source로 지정
- 직접 실행 참조: runtime/test/workflow/capture에서 0; chat와 `_notes_wave1.md`의 역사 언급만 존재
- 보존: `homecook-standalone-src.html`, modular sources, handoff/phase ledger 전체
- 복구: commit `45dade473902b49d85fc975d7edb6e925fb0c6cc`, blob
  `38c62c58baf3089065cec763ad353b59c59ffe97`, SHA-256
  `45cc8f3efbf17f4fd0a7e32d6dd905babd41f4e3cd7a29e68b726d7746fff104`

### `claude-design-260505` superseded Baemin prototype copy

- 제거 대상: `claude-design-260505/homecook-baemin-prototype.html` 1개
- 제거량: 2,185,389 bytes / 2.084MiB
- 누적 제거 후 tracked 기준: 6,979개 / 436.302MiB
- 대체 기준: `ui/designs/prototypes/homecook-baemin-prototype.html`
- 동등성: 두 HTML의 whitespace 제거 SHA-256이
  `7ca07209e395d80e4eabbd325eb0324b9db1c0ab406b309053b7434032b050e3`으로 동일
- 참조 정리: byte-identical port ledger 2개를 retained top-level path로 갱신
- 복구: commit `ff0c46847d2ac90aa2197e4720a53940bc02cadc`, blob
  `f407442ee676a37241a90ee0982183f83ac434d7`, SHA-256
  `52e8ad1c923b8c8f626c9c4c45145fea369038aa570f531330a004faad3f4792`

### Initial C2 design preview HTML set

- 제거 대상: `docs/design/preview*.html` 5개
- 제거량: 154,092 bytes / 0.147MiB
- 누적 제거 후 tracked 기준: 6,974개 / 436.158MiB
- 참조: exact path와 고유 basename의 runtime/test/workflow/dynamic consumer 0
- 대체 기준: 현재 `docs/design/design-tokens.md`, `docs/design/mobile-ux-rules.md`,
  `ui/designs/BAEMIN_STYLE_DIRECTION.md`와 구현 화면
- 복구: commit `68904d804`; 삭제 전 blob/SHA-256은 다음과 같다.
  - `preview.html`: `444c999953b29231c00d13d36f17d2e27a461274` / `36442d03de177dd44d71d41625b772970a9a09d244f12cce6463e61879f22620`
  - `preview-b.html`: `db9ad80efa829a3dbdedff6e08b8ac74a456724e` / `bf6d835af30a7a71c43eb30187c58127b5721b739b6eaa357c661b40c94604e0`
  - `preview-b-photo.html`: `800c46df313ee0365f7eaa58a2fbeab454bb4722` / `f18afc33754b41fa270c4f19abccee703b8c56dcae377f8a10d6d1f6b2611001`
  - `preview-tokens.html`: `afa61ede9899c9878f4a463464e8d7267b069ce5` / `a9f7ed43df73e6d8bada54e7ca6443b2d9be0a85e06ddc0c22461ad507b7a988`
  - `preview-recipe-title.html`: `1447fbafa958e8603bf18ce6af7ceee26aaf6cb7` / `716b9747aaa21dfd70cbb1497600d69a73933941a5591e3be0f7d4bf53190073`

## 10-B closeout

| 항목 | 10-A 기준 | 10-B 완료 master | 변화 |
| --- | ---: | ---: | ---: |
| tracked 파일 | 6,981 | 6,974 | **-7 net** |
| tracked 크기 | 451.278MiB | 436.158MiB | **-15.121MiB net** |
| 제거한 콘텐츠 | - | 8파일 / 15.130MiB | inventory 문서 1개 추가 때문에 net 파일 수는 -7 |

10-B는 runtime/test/workflow consumer가 없거나 retained source와 의미가 동일한 후보만 제거했다.
`desktop-modern-redesign` 50.075MiB는 12개 감사·ledger 참조가 남아 미사용으로 판정하지
않는다. 동일 blob 사본도 경로 존재 계약과 감사 의미가 섞여 있어 일괄 삭제하지 않는다.
이 두 범위는 10-C에서 최소 manifest/checksum 전환 가능성을 먼저 감사한다.

## 10-C cleanup receipts

### One-shot brand icon edge generator

- 제거 대상: `scripts/generate-mumeok-icon-edges.mjs` 1개
- 제거량: 16,171 bytes / 15.792KiB
- runtime/package/workflow/test/runbook/import 참조: 0
- 보존: 생성 결과인 `ui/designs/brand/mumeok/exports`, `public/brand`, `app/favicon.ico`,
  관련 baseline fixture와 visual evidence 전체
- 복구: commit `ca4a4b4d2c138045373055bb117035380ddf9bd0`, blob
  `f498bdf5454d9ce212309b3043014daf62d1ac44`, SHA-256
  `aafe66096141ef1c89fd48a774d3974b1cf2a0eb6cd27d50cd6c936814a0cad6`

### Redundant cook-mode vision crops

- 제거 대상: `overview-1440.png`, `mobile-layout-430.png`
- 제거량: 398,792 bytes / 0.380MiB / 2파일
- 직접·동적 참조: 0
- 픽셀 동등성: retained `overview-1440-full.png`, `mobile-layout-430-full.png`의 top crop과
  각각 pixel-for-pixel 동일하며 full 이미지가 더 넓은 세로 범위를 보존
- 복구: commit `cc64f63c3de7ee335b8c134c92798ab616cb1b0a`
  - overview blob `7fce8c0a5001308935e31000cd5ebcc2af85976f`, SHA-256 `801c89b26476632e21ab017b7be96d90a0e5516e287b4de7d5fdf3b3ac4db537`
  - mobile blob `4813fcb624d15de70d9fe9dd9aadaa4d1dd4406d`, SHA-256 `d69ea214702ed320f00a131726486747444c3ddcd14129a496908a6c1749a9dd`

## 재현 명령

```bash
git -c core.quotePath=false ls-tree -r \
  --format='%(objectname)%x09%(objectsize)%x09%(path)' origin/master
git grep -I -n -- '<exact path or filename>' origin/master -- \
  app components lib public tests scripts .github .workflow-v2 docs ui
```
