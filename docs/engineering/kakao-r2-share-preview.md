# 카카오 R2 공유 미리보기

2026-09-12 사용자 제공 링크는 `/beta/r2/homeflow?result=spontaneous`, `/beta/r2/recording?result=eyeballing-master`다. 이미지와 제목이 기본 서비스 카드로 남는 문제를 확인했다.

현재 Next 15 기본 HTML 제한 수집기 목록에는 `facebookexternalhit`은 있지만 독립 `kakaotalk-scrap`은 없다. homeflow 응답에서 카카오 단독 User-Agent일 때 OG 태그가 head 밖으로 스트리밍되는 문제를 실측했다. `htmlLimitedBots`는 Next의 기본 목록을 보존하고 kakaotalk/kakaostory를 추가한다. 일반 브라우저 streaming, CSP/보안 헤더와 서버 수집 계약은 그대로다.

배포 검증은 사용자 제공 두 exact URL과 카카오 단독/복합 User-Agent를 사용해 첫 head에 주제별 title, description, og:image가 하나씩 존재하는지 확인한다. 카카오 서버에 이미 저장된 이전 미리보기는 공식 OG 캐시 초기화 도구에서 해당 URL만 갱신해야 할 수 있다. 기존 대화 내용을 삭제하거나 테스트 메시지를 대신 전송하지 않는다.

이번 config 변경은 수집기 응답 형식만 바꾼다. runtime/DB/Turnstile 코드·키·control·보안 헤더의 동일성을 확인하고 기존 R2 readiness의 원본 증거/검증 시각을 유지한 채 새 배포 SHA에 연결한다.
