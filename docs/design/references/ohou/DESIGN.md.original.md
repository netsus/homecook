# 라이프스타일 슈퍼앱, 오늘의집

## Mission
Create implementation-ready, token-driven UI guidance for 라이프스타일 슈퍼앱, 오늘의집 that is optimized for consistency, accessibility, and fast delivery across e-commerce storefront.

## Brand
- Product/brand: 라이프스타일 슈퍼앱, 오늘의집
- URL: https://ohou.se/
- Audience: online shoppers and consumers
- Product surface: e-commerce storefront

## Style Foundations
- Visual style: clean, functional, implementation-oriented
- Main font style: `font.family.primary=Pretendard Variable`, `font.family.stack=Pretendard Variable, Noto Sans KR, Apple SD Gothic Neo, 맑은 고딕, Malgun Gothic, sans-serif`, `font.size.base=15px`, `font.weight.base=400`, `font.lineHeight.base=15px`
- Typography scale: `font.size.xs=0px`, `font.size.sm=10px`, `font.size.md=12px`, `font.size.lg=14px`, `font.size.xl=15px`, `font.size.2xl=16px`, `font.size.3xl=18px`, `font.size.4xl=30px`
- Color palette: `color.text.primary=#424242`, `color.text.secondary=#2f3438`, `color.surface.base=#000000`, `color.text.inverse=#ffffff`, `color.surface.muted=#f7f9fa`, `color.surface.strong=#1da2ff`
- Spacing scale: `space.1=1px`, `space.2=2px`, `space.3=4px`, `space.4=5px`, `space.5=6px`, `space.6=8px`, `space.7=9px`, `space.8=10px`
- Radius/shadow/motion tokens: `radius.xs=4px`, `radius.sm=16px`, `radius.md=24px` | `shadow.1=rgba(63, 71, 77, 0.15) 0px 2px 5px 0px` | `motion.duration.instant=100ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
Concise, confident, implementation-focused.

## Rules: Do
- Use semantic tokens, not raw hex values, in component guidance.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure
- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Include known page component density: links (112), buttons (51), inputs (20), cards (13), lists (5), navigation (2).


## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.
