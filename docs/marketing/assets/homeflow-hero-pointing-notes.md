# 첫 화면 광고 엔딩 연결

- 사용자 첨부 광고 엔딩을 imagegen으로 편집해 캐릭터가 오른쪽 안내를 가리키게 했다. 첫 결과는 체크무늬 RGB여서 미사용. 두 번째 편집에서 실제 알파를 확인했다.
- 두 번째 프롬프트: `Make the background transparent. Keep the existing character exactly as she is. Transparent PNG cutout.`
- 540×810 WebP, 96,150 bytes, 알파 0~255. 원본·이전 파생본 보존. 출처는 `homeflow-hero-pointing-manifest.json`에 기록했다.
- 변경 파일: `homeflow-landing.tsx`, 해당 CSS, `homeflow-content.ts`, 자산 manifest와 대응 테스트. 기존 세 단계 목록을 안내판 형태로 재사용하고 이미지 로드 후 캐릭터 등장·세 단계 순차 표시·시작 버튼 강조를 넣었다. 기존 모션 줄이기 규칙 재사용, 새 의존성 없음.
- 검증: 단위 테스트 15개, 390×844/320×568 전체 브라우저 흐름 2개, ESLint/typecheck/diff 검사 통과. 첫 화면 무스크롤·애니메이션·모션 줄이기·자산 알파와 용량 확인.
- 로컬 UI 검증만 수행했다. 배포·master 머지·실제 제출·독립 Stage 승인은 하지 않았다.
