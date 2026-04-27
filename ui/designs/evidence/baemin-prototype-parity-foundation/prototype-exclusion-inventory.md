# Prototype-Only Exclusion Inventory

Items listed here are present in the prototype (`ui/designs/prototypes/homecook-baemin-prototype.html` and `ui/designs/prototypes/baemin-redesign/`) but **excluded from production parity scoring** unless a future explicit approval gate promotes them.

Source: h7 direction gate `Prototype-Only Exclusions` + concrete prototype inspection.

## Fonts

| Item | Prototype usage | Exclusion reason |
| --- | --- | --- |
| `Jua` (BMJua replacement) | Brand headings, logo `homecook_`, category section titles | New font dependency. Requires license review, loading-cost analysis, and explicit user approval. |
| `fontBrand: "Jua"` token | `--font-brand` in prototype tokens | Not in production font stack. Production uses `--font-body` for all text. |

## Screens / Routes

| Item | Prototype location | Exclusion reason |
| --- | --- | --- |
| `PANTRY` screen | `screens/pantry.jsx` | Not in current production slice roadmap. Future official slice `13-pantry-core`. |
| `MYPAGE` screen | `screens/mypage.jsx` | Not in current production slice roadmap. Future official slices `17a/17b/17c`. |

## Navigation / Chrome

| Item | Prototype location | Exclusion reason |
| --- | --- | --- |
| Bottom tab bar (4 tabs: home/planner/pantry/mypage) | `components.jsx::BottomTab` | Production does not have a bottom tab bar. Requires route structure and UX decision gate. |
| Pantry tab in bottom nav | BottomTab active state | PANTRY screen excluded. |
| MyPage tab in bottom nav | BottomTab active state | MYPAGE screen excluded. |
| Bottom tab badge (notification dot) | BottomTab badge variant | No notification system in production scope. |

## RECIPE_DETAIL Features

| Item | Prototype location | Exclusion reason |
| --- | --- | --- |
| Tabs (overview / ingredients / reviews) | `screens/detail.jsx` tab navigation | Production RECIPE_DETAIL uses single-scroll layout per `docs/화면정의서-v1.5.1.md`. No tabs. |
| Reviews section / review cards | `screens/detail.jsx` reviews tab | No review system in official docs. |
| Review count badge | Detail meta section | No review data model. |
| Star rating input (user review) | Reviews tab | No review API. |

## Visual Assets

| Item | Prototype location | Exclusion reason |
| --- | --- | --- |
| Prototype-only illustration/emoji placeholders | Various screen empty states, hero images | Production uses its own recipe image/emoji system. Prototype placeholders are demo data. |
| Prototype-only marketing assets | Home promotional banner, theme imagery | No marketing asset pipeline in production. |
| Brand logo with Jua font rendering | AppBar brand mode | Depends on Jua font exclusion above. |
| Prototype social login provider icons | LoginGateModal social buttons | Production uses its own OAuth provider assets. |

## Interaction Patterns

| Item | Prototype location | Exclusion reason |
| --- | --- | --- |
| Pantry-coupled planner features | Planner screen pantry integration | PANTRY screen excluded; coupling not available. |
| Unsupported planner functionality | Prototype planner extras beyond official docs | Production functionality limited to official `docs/api문서-v1.2.2.md` and `docs/화면정의서-v1.5.1.md`. |
| Bottom tab navigation gestures | Tab switching, active state transitions | Bottom tab bar excluded. |
| Prototype-specific sort as tab-like control | SortSheet in prototype | Production SortSheet uses sheet overlay per h5 modal system. Semantic drift from prototype's tab-like appearance is noted but not scored as a deficit. |

## Parity Scoring Impact

- Excluded items are **not scored as deficits** in visual-verdict scoring.
- If a prototype capture includes an excluded element (e.g., bottom tab bar visible), the scorer notes "excluded element visible in prototype layer" and does not penalize the after layer for its absence.
- Promoting any excluded item requires a separate user approval gate and potentially a contract-evolution PR.
