# Project Profile Template

## Purpose

이 문서는 workflow core와 분리된 프로젝트 전용 규칙 묶음이다.
다른 프로젝트로 v2를 옮길 때 이 파일부터 복제해 채운다.

## 1. Project Summary

- 프로젝트 이름:
- 제품 유형:
- 핵심 리스크:

## 2. Source Of Truth

- 요구사항:
- 화면 정의:
- API 문서:
- DB/Schema 문서:
- 디자인 시스템 문서:

공식 문서 우선순위와 충돌 해소 규칙도 같이 적는다.

## 3. Contract Rules

- API envelope:
- 에러 구조:
- 금지된 임의 필드/상태/엔드포인트:
- 문서 변경 없이 허용되는 범위:

## 4. Domain Invariants

- 상태 전이:
- 권한/소유권 규칙:
- read-only 규칙:
- 데이터 정합성 규칙:

## 5. UI Delivery Defaults

- 필수 상태:
- unauthorized 처리:
- return-to-action 규칙:
- 디자인 token 규칙:

## 6. Verification Defaults

- 기본 lint/type/test 명령:
- product 변경 시 필수 검증:
- docs/governance 변경 시 최소 검증:

## 7. External Smoke Checklist

- auth/provider:
- payment/provider:
- infra/env:

프로젝트에 없는 항목은 `N/A` 근거와 함께 명시한다.

## 8. Branch And PR Defaults

- 허용 브랜치 prefix:
- Draft 사용 기준:
- Required approval 의미:
- PR template 작성 기준:

## 9. Preset Mapping

- 어떤 작업이 어떤 preset으로 기본 라우팅되는지 적는다.

## 10. Forbidden Shortcuts

- 이 프로젝트에서 절대 허용하지 않는 우회 방법을 적는다.
