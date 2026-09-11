# R2-S5-001 고정 비저장 production 미리보기

- [집밥 기록](http://127.0.0.1:3126/beta/r2/recording)
- [집밥 관리](http://127.0.0.1:3126/beta/r2/homeflow)

실제 HEAD `62eff252cdd537c9a849caf1881ac490687abac3`의 추적 runtime/source/config 2,465개를 git archive로 별도 임시 디렉터리에 가져와 각각 원본 git bytes와 비교했다. 실제 `app/beta/r2/[topic]/page.tsx`를 그대로 사용하며 fixture page 교체가 없다. 기존 의존성을 symlink로 참조하고 새 의존성은 설치하지 않았다. 루트 `.next`와 3100/3118/3124 서버는 변경하지 않았다.

기본 빌드와 동일한 Next production build를 소유 복사본 안에서 실행했다. 컴파일, 내장 lint 및 typecheck, 87개 페이지 생성까지 최종 exit 0이다. 첫 시도는 복사 범위에 scripts/qa가 없어 실패했다. 두 번째 시도는 production compile/typecheck/페이지 생성은 완료됐지만, 임시 경로에서 pnpm ESLint 플러그인 경로가 해석되지 않았다. 두 로그를 각각 `build-first-copy-missing-imports.log`, `build-second-copy-lint-resolution.log`로 보존한다. 기존 eslint-config-next 의존성 경로를 NODE_PATH로 제공해 같은 복사본을 재빌드했고 최종 `build.log`에는 그 오류가 없다. 제품·Next·ESLint 설정 및 skip flag는 바꾸지 않았다. 복사본 두 수정 파일의 별도 lint 결과는 `lint-resolution.json`이며 전체 저장소 CI/lint와 구분한다.

고정 빌드 정보:

- Build ID: `ojaiIGyjDlOMvWFrlUvf9`
- Source tree SHA256: `ad80ffc80d83bf017391eaf3a2da825b59bf069a3d7cc1976bddc0498f0c79ed`
- Compiled tree SHA256: `bb836c65288d4a57917d3ee96788a177e9442df2987a287567ad757b0cc56c9c`
- Compiled file 수: 830. 브라우저 검증 후 전체 hash 재비교 결과 불일치 0.
- 소유 디렉터리: `/var/folders/3z/y96spzj121b8vg6xflzxfyww0000gn/T/r2-s5-production-0JV9l2`
- 실행 wrapper PID: 66451, Next child PID: 66453, 유지 세션: 48056.
- Binding: `127.0.0.1:3126`. 사용자/조정자 확인용으로 실행을 유지한다.

`MUMEOK_ROUND2_LOCAL_PREVIEW=true`, collection/lead enabled=false로 실행한 공식 로컬 메모리 미리보기다. 환경 비밀·DB·provider 설정은 주입하지 않았다. 두 주제에서 각 활동을 새 브라우저 문맥으로 독립 실행하여 6조건이 완료됐고, 메뉴 완료 표시가 하나만 생기며 새로고침하면 사라지는 것을 확인했다. localStorage/sessionStorage/IndexedDB 생성 0, 실제 POST 0, 외부 요청 0, pageerror 0이다. 응답은 `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, Set-Cookie 없음이다. 관련 관찰은 `verification.json`, `headers.json`이다.

메뉴/각 활동의 390px PNG 8장은 보조 캡처다. 이메일 입력칸과 가짜 이메일 안내 문단은 보존 이미지에서만 가렸다. 실제 production 프리뷰가 고정되어 있다는 증거이며, 실제 API/DB/provider 처리나 R2-S5-001 불확정 결과 복구를 이 메모리 프리뷰에서 검증했다는 의미가 아니다. 그 복구 검증은 별도 route-mocked browser evidence 범위다. 독립 Stage5/final authority 승인이 아니다.
