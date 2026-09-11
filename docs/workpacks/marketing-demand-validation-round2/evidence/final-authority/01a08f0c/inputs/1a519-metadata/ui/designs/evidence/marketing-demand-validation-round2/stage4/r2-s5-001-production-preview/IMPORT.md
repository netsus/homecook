# 고정 production 미리보기 보관

원본23파일을 내용 변경 없이 보존했다. `build-copy.mjs`, `serve-copy.mjs`, `verify.mjs`는 비실행 재현 원문으로 각각 `.mjs.txt` 이름에 보관했다. 필요 시 별도 임시 디렉터리에 `.txt`를 제거한 이름으로 복사해 검토한다. 제품/검증 코드의 lint 대상을 바꾸거나 규칙을 완화하지 않았다.

README의 메모리 모드 한계와 빌드 시도 구분을 유지한다. 불확정 신청 복구는 별도 [route-mocked 브라우저](../r2-s5-001-browser/README.md)와 [실제 API/DB 전체28](../r2-s5-001-actual-ui/README.md)에서 각각 검증했다. 이 미리보기의 완료 표시는 새로고침 시 초기화되며 실접수 증거가 아니다.

소스/compiled-tree 해시는 HEAD62eff252의 고정 복사본을 가리킨다. 이후 문서만 추가된 commit에서 제품을 다시 빌드하거나 실행했다고 표현하지 않는다.
