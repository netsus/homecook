# MYPAGE_PROGRESS -- compact progress insert

> 기준 문서: 화면정의서 v1.5.14 SS 19 / 요구사항기준선 v1.7.7 progress contract / API 문서 v1.2.16 SS 12-9
> 슬라이스: `33b-mypage-progress-ui`
> 관련 화면: `MYPAGE`
> 생성일: 2026-06-10
> 정적 prototype: `ui/designs/prototypes/33b-mypage-progress-ui/index.html`

---

## 화면 개요

MYPAGE 프로필 영역에서 기존 하드코딩 level subtitle을 제거하고, 실제 `GET /api/v1/users/me/progress` 응답을 compact progress card로 표시한다. 이 UI는 사용자에게 "집밥 기록이 쌓인다"는 느낌을 주되, 게임 대시보드처럼 과장하지 않는다.

- 위치: 닉네임/로그인 제공자 아래 또는 프로필 영역 하단
- 크기: 기존 MYPAGE account section을 크게 늘리지 않는 compact block
- 성격: 조회 전용
- 실패 정책: progress 영역만 soft-fail
- 후속 확장: 33c에서 badge/quest/toast/tutorial을 추가할 수 있음

---

## 정보 구조

```
프로필 row
  avatar
  nickname
  provider label
  settings button

compact progress card
  level label: Lv.<current_level>
  support copy: 다음 레벨까지 <xp_to_next_level> XP
  progress bar: progress_percent
  small meta: 누적 <total_xp> XP
```

서버 응답 필드만 사용한다. 클라이언트 계산은 하지 않는다.

---

## 모바일 와이어프레임 390px

```
+--------------------------------------+
| avatar  집밥러                 설정  |
|         카카오 로그인                |
|                                      |
| +----------------------------------+ |
| | Lv.6                         13% | |
| | 다음 레벨까지 130 XP             | |
| | [======-----------------------]  | |
| | 누적 520 XP                     | |
| +----------------------------------+ |
+--------------------------------------+
| [레시피북] [장보기 기록]             |
+--------------------------------------+
```

## 모바일 와이어프레임 320px

```
+------------------------------+
| avatar  집밥러          설정 |
|         카카오 로그인        |
|                              |
| +--------------------------+ |
| | Lv.6                 13% | |
| | 다음 레벨까지 130 XP     | |
| | [====----------------]  | |
| | 누적 520 XP             | |
| +--------------------------+ |
+------------------------------+
```

320px에서는 label과 percent만 한 줄 양끝 정렬하고, 긴 설명은 다음 줄에 둔다. XP 문구가 길어지면 줄바꿈을 허용한다.

---

## 데스크톱 와이어프레임

```
+------------------------------------------------+
| avatar  집밥러               Lv.6       13%    |
|         카카오 로그인        다음 레벨까지 130 XP |
|                              [====----------]  |
+------------------------------------------------+
```

데스크톱은 profile row와 progress card를 같은 account panel 안에서 우측 또는 하단에 배치할 수 있다. 기존 recipebook/shopping history 정보 구조를 밀어내지 않는 것이 우선이다.

---

## 상태별 표현

| 상태 | 표현 | 규칙 |
| --- | --- | --- |
| loading | progress card 높이의 skeleton bar | profile/recipebook skeleton과 별도 |
| success | level, copy, bar, total XP | 서버 응답 그대로 표시 |
| zero-progress | `Lv.1`, `누적 0 XP`, progress 0% | empty가 아니라 정상 시작 상태 |
| error | `성장 기록을 잠시 불러오지 못했어요` | MYPAGE core 유지, 재시도 버튼은 선택 |
| unauthorized | 기존 MYPAGE 로그인 게이트 | progress 별도 표시 없음 |
| read-only | 액션 없음 | 편집/claim/reward 버튼 금지 |

---

## Tone

- 좋은 방향:
  - 작고 조용한 progress card
  - 따뜻한 집밥 기록 느낌
  - 레벨은 "성장 상태"로 보이고, 경쟁 등급처럼 보이지 않음
- 피할 방향:
  - 금속 badge, 과한 glow, 보상 상자, rank tier ladder
  - 퀘스트 CTA, badge CTA, toast preview
  - 숫자가 큰 게임 HUD처럼 보이는 구성

---

## Responsive Rules

- progress card min-width에 의존하지 않는다.
- 320px에서 card 내부 padding은 12px까지 줄일 수 있다.
- percent와 level label은 한 줄에 유지하되, 설명 copy는 줄바꿈 가능하다.
- progress bar는 고정 height 6-8px로 유지한다.
- hover/focus/pressed state가 layout shift를 만들면 안 된다.
- 전체 화면에 horizontal scroll이 생기면 blocker다.

---

## Accessibility

- progress bar는 `role="progressbar"`와 `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow=<progress_percent>`를 가진다.
- screen reader label은 `Lv.<current_level>, 다음 레벨까지 <xp_to_next_level> XP, 진행률 <progress_percent>%` 정도로 읽힌다.
- error copy는 alert처럼 과하게 방해하지 않는다. MYPAGE core 사용을 막지 않기 때문이다.
- 색상만으로 진행 상태를 전달하지 않고 percent/text를 함께 둔다.

---

## Implementation Notes

- 권장 component: `components/mypage/mypage-progress-card.tsx`
- 권장 API helper: `lib/api/user-progress.ts`
- progress endpoint failure는 component state로 격리한다.
- MYPAGE profile fetch와 progress fetch를 강하게 결합하지 않는다.
- 33c hook을 위해 component 내부 DOM을 과도하게 추상화하지 않는다. 후속 slice에서 필요한 CTA/slot을 추가한다.

---

## Stage 4 Evidence Checklist

- [ ] `ui/designs/evidence/33b-mypage-progress-ui/mobile-390.png`
- [ ] `ui/designs/evidence/33b-mypage-progress-ui/mobile-320.png`
- [ ] `ui/designs/evidence/33b-mypage-progress-ui/desktop-1440.png`
- [ ] progress error screenshot 또는 equivalent browser evidence
- [ ] hardcoded level subtitle 제거 evidence
