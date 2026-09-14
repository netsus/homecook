# 캐릭터 배경 제거 기록

- 2026-09-12 내장 ImageGen으로 광고 인물과 캐릭터 6종을 배경 제거한 파생본으로 제작했다.
- 최초 출력의 체크무늬 배경은 실제 알파가 없어 제외했다. 재시도 결과의 알파 채널(최소 0, 최대 255)을 검사한 뒤 WebP로 변환했다.
- 원본 사용자 파일과 기존 파란 배경 WebP는 보존했다. 현재 사용 경로와 변환 크기는 [manifest](./homeflow-transparent-manifest.json)에 기록한다.
- 투명화 과정의 생성 결과이며 원본 픽셀과 완전히 같은 마스크라고 주장하지 않는다.

## hero-ad

```text
Make the background transparent. Keep only the illustrated woman with her phone. Preserve her drawing exactly. Transparent PNG cutout.
```

## spontaneous

```text
Make the background transparent. Keep the existing character, refrigerator, frying pan, green onion and lightbulb exactly as they are. Transparent PNG cutout.
```

## mental

```text
Make the background transparent. Keep the existing character and all its props exactly as they are. Transparent PNG cutout.
```

## memo

```text
Make the background transparent. Keep the existing character and all its props exactly as they are. Transparent PNG cutout.
```

## scheduled

```text
Make the background transparent. Keep the existing character and all its props exactly as they are. Transparent PNG cutout.
```

## invitation

```text
Make the background transparent. Keep the existing character and all its props exactly as they are. Transparent PNG cutout.
```

## success

```text
Make the background transparent. Keep the existing character and all its props exactly as they are. Transparent PNG cutout.
```

