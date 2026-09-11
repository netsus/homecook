# R2-AP-002 실제 RECOVERY 200% 근거

제품 입력은 `fd9c4827cafdfe708f1ceff33ff74269a80753c9`이며 제품 파일 변경은 없다. 기존 원형 Next GET/POST → SDK/RPC → 새 고유 isolated DB 경로에서 recording의 실제409 동의갱신과 homeflow의 실제commit 응답유실을 검증했다. **2조건 × 4viewport = 8조합**이며 서로 다른8오류가 아니다.

`result.json`, `recovery-zoom-geometry.json`, `screenshots.json`을 함께 읽는다. 320×568/390×844/393×852/1280×900에서 root16→32px·RECOVERY 본문14→28px, 정적텍스트clipping0, 페이지가로overflow0, 스크롤후재시도버튼의화면내bounds/중앙·하단hit-test, 이메일·동의 또는 마지막장면보존을 확인했다. Full-page8PNG와 같은8조합의CTA viewport상세8PNG를 구분했다. 단일줄native email입력값은 별도보존검사이며 내부수평스크롤을 정적텍스트clipping검사로 대체하지 않는다. Next개발도구 N표시는 제품 UI가 아니다.

캡처당시 harness SHA는 원본 `source-manifest.json`에 있다. 마지막8unique조합 guard 추가 후에는 조정지시에따라 UI/DB를재실행하지않고 저장된원측정8개에새guard를직접적용했다(`final-readback-validation.json`). Guard는 recording4개만남은경우/중복/잘못된viewport를거부하는 RED3→GREEN4 회귀와 기존isolated안전경계10개를통과했다. 최종harness commit/hash와이차이는 `author-result.json`에 기록했다.

첫완료run의8개결과는 `first-complete-run/`에보존했다. 본문글자배율assertion을보강한두번째run은 같은진단파일에행을순차기록했으므로중간4개와이전result8이함께보일수있었다. 당시reviewer가읽은4행원문/hash는확보하지못했으며그자료를인위적으로재구성하지않았다. 현재최종8개는readback·유일조합·hash로확인해고정했다.

두run은고유hcg만사용했고최종run은`hcg_92245_74eb5e`, 종료code0 및owned cleanup assertion/3443 listener없음을확인했다. 3118·3124, 운영project/volume, 실제provider는변경하지않았다. 기존result의`apiRequests:8`은유실응답을제외한관측응답수다. 전체독립precheck/Stage5/Ready/merge/배포 승인은 아니다.
