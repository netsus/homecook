# Token / Material / Reference Mapping Scope

This document defines which prototype tokens map to which production tokens for parity scoring purposes. It does **not** change any token values. Scored parity slices use this mapping to decide which production token to target when implementing visual parity.

Source: `ui/designs/prototypes/baemin-redesign/HANDOFF.md` section 2.

## Color Tokens

| Prototype token | Prototype value | Production token | Current production value | Parity action | Notes |
| --- | --- | --- | --- | --- | --- |
| `mint` | `#2AC1BC` | `--brand` | `#ED7470` | Already updated to `#ED7470` via h6 token-values slice. Parity slices compare against current production value, not prototype mint. | Brand value is a user-approved decision; parity does not re-litigate. |
| `mintDeep` | `#20A8A4` | `--brand-deep` | `#C84C48` | Same as above. Compare against production value. | |
| `mintSoft` | `#E6F8F7` | `--brand-soft` | `#FDEBEA` | Same as above. Compare against production value. | |
| `teal` | `#12B886` | `--olive` | `#1f6b52` | Compare against production value. | Prototype "teal" maps to production "olive" for accent semantics. |
| `ink` | `#212529` | `--foreground` | `#1a1a2e` | Compare against production value. | Subtle difference; parity score should not penalize this approved divergence. |
| `text2` | `#495057` | `--text-2` | `#495057` | Identical. | |
| `text3` | `#868E96` | `--text-3` | `#868E96` | Identical. | |
| `text4` | `#ADB5BD` | `--text-4` | `#ADB5BD` | Identical. | |
| `border` | `#DEE2E6` | `--line` | `rgba(0,0,0,0.07)` | Evaluate visual equivalence; solid vs rgba may differ subtly on tinted backgrounds. | |
| `surface` | `#FFFFFF` | `--surface` | `#FFFFFF` | Identical. | |
| `surfaceFill` | `#F8F9FA` | `--surface-fill` | `#F8F9FA` | Identical. | |
| `surfaceSubtle` | `#F1F3F5` | `--surface-subtle` | `#F1F3F5` | Identical. | |
| `background` | `#FFFFFF` | `--background` | `#fff9f2` | Approved production divergence. Warm cream vs white is user-decided. Parity score notes but does not penalize. | |
| `red` | `#FF6B6B` | (ad-hoc red usage) | N/A | Map to context-appropriate existing token or literal. | No dedicated `--danger` token in production yet. |
| `cook-*` | same as production | `--cook-*` | same | Identical. No change needed. | |

## Shadow Tokens

| Prototype token | Prototype value | Production token | Production value | Notes |
| --- | --- | --- | --- | --- |
| `shadow-natural` | `0 1px 3px rgba(0,0,0,0.04)` | `--shadow-1` | `0 1px 3px rgba(0,0,0,0.04)` | Identical |
| `shadow-deep` | `0 2px 8px rgba(0,0,0,0.08)` | `--shadow-2` | `0 2px 8px rgba(0,0,0,0.08)` | Identical |
| `shadow-crisp` | `0 8px 24px rgba(0,0,0,0.16)` | `--shadow-3` | `0 8px 24px rgba(0,0,0,0.16)` | Identical |
| `shadow-sharp` | `0 4px 12px rgba(0,0,0,0.10)` | (none) | N/A | No production equivalent yet. Parity slices may introduce if needed. |
| `shadow-outlined` | `0 4px 16px rgba(0,0,0,0.12)` | (none) | N/A | No production equivalent yet. |

## Radius Tokens

| Prototype token | Value | Production token | Production value | Notes |
| --- | --- | --- | --- | --- |
| `radius-xs` | `4px` | (none) | N/A | Not in production. Parity slices may add if needed for badge/pill. |
| `radius-sm` | `8px` | `--radius-sm` | `8px` | Identical |
| `radius-md` | `12px` | `--radius-md` | `12px` | Identical |
| `radius-lg` | `16px` | `--radius-lg` | `16px` | Identical |
| `radius-pill` | `9999px` | `--radius-full` | `9999px` | Same value, different name |

## Spacing Tokens

Production `--space-*` tokens match prototype `space-*` values identically. No mapping gap.

## Font Tokens

| Prototype token | Stack | Production token | Production stack | Parity action |
| --- | --- | --- | --- | --- |
| `fontUI` | system sans-serif | `--font-body` | "Avenir Next", "Pretendard", system sans-serif | Compatible. Parity uses production stack. |
| `fontBrand` | `"Jua"` | (none) | N/A | **Excluded.** Jua is a prototype-only font. See `prototype-exclusion-inventory.md`. |

## Approved Production Divergences

These differences between prototype and production are user-approved or structurally necessary. Parity scoring notes them but does not penalize:

1. **Brand color family**: Production uses `#ED7470` (warm coral) instead of prototype's `#2AC1BC` (mint). Approved via h6 `baemin-style-token-values`.
2. **Background tone**: Production `#fff9f2` (warm cream) vs prototype `#FFFFFF` (pure white). User preference.
3. **Foreground tone**: Production `#1a1a2e` vs prototype `#212529`. Minimal visual difference.
4. **Font stack**: Production uses Avenir Next / Pretendard instead of system-only. No Jua.
5. **Olive vs teal**: Production `--olive #1f6b52` vs prototype `teal #12B886`. Both serve as accent green.
