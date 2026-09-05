# Tracked Content Lightening Inventory

상태: **10-A canonical inventory**

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
   - HTML 5개, 약 0.15MiB.
   - exact path 참조 0개인 초기 C2 비교물이다.
   - 현재 토큰/화면 기준과 시각 비교 후 제거 후보로 삼는다.
3. `ui/designs/prototypes/claude-design-260512-desktop/project/*standalone*.html`
   - 2개, 합계 5.208MiB이며 큰 standalone bundle은 5.204MiB다.
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
- 제거 후 tracked 기준: 6,980개 / 443.584MiB
- 직접 참조: inventory의 후보 기록 외 runtime/test/workflow exact path·filename 참조 0
- 동적 탐색: prototype HTML을 자동 열거하는 실행 경로 0
- 복구: Git commit `59779af90`과 현재 삭제 전 blob `0968acd11a122f5dc32c856e79d2275575dab8af`
- 보존 경계: `public/assets/funnel`, current parity prototype, Wave1 lock, canonical marketing source는 미변경

## 재현 명령

```bash
git -c core.quotePath=false ls-tree -r \
  --format='%(objectname)%x09%(objectsize)%x09%(path)' origin/master
git grep -I -n -- '<exact path or filename>' origin/master -- \
  app components lib public tests scripts .github .workflow-v2 docs ui
```
