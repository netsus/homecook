# Desktop Web Primitive Reference Lock

Source prototype:

- `ui/designs/prototypes/claude-design-260512-desktop/project/styles.css`
- `ui/designs/prototypes/claude-design-260512-desktop/project/styles-phase1.css`
- `ui/designs/prototypes/claude-design-260512-desktop/project/homecook desktop prototype.html`

These primitives lock the desktop `1024px+` visual system for the MVP port. Later slices must reuse these primitives instead of hand-tuning one-off variants.

## Shared Tokens

- Brand: `#00A1FF`
- Brand deep: `#0085db`
- Brand wash: `rgba(0, 161, 255, 0.06)`
- Text 1: `#2f3438`
- Text 2: `#424242`
- Text 3: `#8a8e93`
- Text 4: `#cfd4d8`
- Background: `#ffffff`
- Alt background: `#f7f9fa`
- Surface: `#ffffff`
- Image placeholder: `#EAEDEF`
- Line: `rgba(0, 0, 0, 0.08)`
- Divider: `#eef0f2`
- Radius: `4px / 8px / 16px / 24px / 9999px`
- Card shadow: `rgba(63, 71, 77, 0.15) 0px 2px 5px 0px`
- Float shadow: `rgba(63, 71, 77, 0.18) 0px 8px 24px 0px`
- Font: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
- Navigation height: `64px`
- Content max: `1200px`
- Wide content max: `1440px`

## WebShell

- Reference: `.app-shell`, `.page`, `.container`, `.container-wide`
- Scope: `1024px+` desktop only
- Shell background: `#ffffff`
- Text color: `#424242`
- Font size: `15px`
- Line height: `1.5`
- Letter spacing: `0`
- Page top padding: `64px`
- Container: `max-width: 1200px; padding: 0 32px`
- Wide container: `max-width: 1440px; padding: 0 32px`

## WebTopNav

- Reference: `.topnav`, `.topnav-inner`, `.topnav-brand`, `.topnav-tab`
- Height: `64px`
- Position: fixed top
- Background: `rgba(255, 255, 255, 0.96)`
- Backdrop filter: `blur(12px)`
- Border bottom: `1px solid rgba(0, 0, 0, 0.08)`
- Inner max width: `1440px`
- Inner padding: `0 32px`
- Inner gap: `40px`
- Brand font: `22px / 800 / -0.4px`
- Brand color: `#00A1FF`
- Tab padding: `10px 16px`
- Tab radius: `8px`
- Tab font: `15px / 500 / -0.3px`
- Active tab: brand color and `700` weight
- Hover: `#f7f9fa` background, `#2f3438` text

## WebPageHeader

- Reference: `.section-head`, heading helpers
- Layout: flex, space-between, aligned flex-end
- Gap: `24px`
- Margin bottom: `20px`
- Title font: `28px / 700 / 1.3 / -0.3px`
- Description font: `13px / #8a8e93 / -0.3px`

## WebButton

- Reference: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-tertiary`, `.btn-ghost`
- Medium: `44px` height, `0 20px` padding, `15px / 600 / -0.3px`
- Small: `36px` height, `0 14px` padding, `13px / 600`
- Large: `52px` height, `0 28px` padding, `16px / 600`
- Gap: `6px`
- Radius: `8px`
- Active transform: `scale(0.98)`
- Primary: `#00A1FF`, hover `#0085db`, white text
- Secondary: `1px solid #00A1FF`, hover `rgba(0, 161, 255, 0.06)`
- Tertiary: `#f7f9fa`, hover `#eef0f2`, text `#424242`
- Ghost: transparent, hover `#f7f9fa`
- Disabled: opacity `0.4`

## WebIconButton

- Reference: `.btn-icon`
- Size: `40px x 40px`
- Radius: `9999px`
- Background: `rgba(255, 255, 255, 0.92)`
- Color: `#2f3438`
- Hover: white background, card shadow

## WebChip

- Reference: `.chip`
- Height: `34px`
- Padding: `0 14px`
- Gap: `6px`
- Radius: `9999px`
- Background: `#f7f9fa`
- Text: `14px / 500 / -0.3px / #424242`
- Hover: `#eef0f2`
- Active: `#00A1FF` background, white text

## WebTabs

- Reference: `.tabs`, `.tab`
- Container border-bottom: `1px solid #eef0f2`
- Tab padding: `14px 20px`
- Tab font: `15px / 500 / -0.3px`
- Inactive text: `#8a8e93`
- Active border: `2px solid #00A1FF`
- Active text: `#00A1FF`
- Active weight: `700`

## WebToolbar

- Reference: toolbar/filter rows in prototype screens
- Layout: flex, center aligned, space-between
- Gap: `16px`
- Min width: `0`

## WebCard

- Reference: `.product-card`, `.rail-card`, `.meta-card`
- Background: `#ffffff`
- Border: `1px solid rgba(0, 0, 0, 0.08)`
- Radius: `16px`
- Hover border: `rgba(0, 0, 0, 0.12)`
- Hover shadow: card shadow
- Body padding: `18px 20px`

## WebRecipeCard

- Reference: `.photo-card`
- Radius: `16px`
- Thumbnail ratio: `4 / 3`
- Placeholder: `#EAEDEF`
- Hover image transform: `scale(1.05)` over `300ms ease-out`
- Hover shadow: card shadow
- Gradient overlay: `linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)`
- Title: `15px / 600 / 1.4 / -0.3px`
- Title clamp: `2` lines
- Meta: `13px / #8a8e93 / -0.3px`, gap `8px`

## WebListRow

- Reference: `.meta-card`, list row patterns
- Display: flex, center aligned, space-between
- Gap: `16px`
- Padding: `18px 20px`
- Border: `1px solid rgba(0, 0, 0, 0.08)`
- Radius: `16px`
- Background: white
- Hover: alt background or card shadow depending on usage

## WebDialog

- Reference: `.dialog`, `.dialog-wide`, `.dialog-narrow`
- Default width: `min(520px, calc(100vw - 64px))`
- Wide width: `min(720px, calc(100vw - 64px))`
- Narrow width: `min(440px, calc(100vw - 64px))`
- Max height: `calc(100vh - 80px)`
- Radius: `16px`
- Border: `1px solid rgba(0, 0, 0, 0.08)`
- Shadow: float shadow
- Header padding: `20px 24px`
- Title: `18px / 700 / -0.3px`
- Body padding: `20px 24px`
- Footer padding: `16px 24px`
- Footer gap: `8px`

## WebModal

- Reference: `.scrim`
- Position: fixed inset `0`
- Z index: `200`
- Padding: `40px 24px`
- Background: `rgba(0, 0, 0, 0.42)`
- Backdrop filter: `blur(1px)`
- Dialog alignment: centered
- Animation: fade-in `0.15s ease-out`

## WebCTA

- Reference: sticky action/footer patterns
- Position: sticky bottom
- Border top: `1px solid #eef0f2`
- Background: `rgba(255, 255, 255, 0.96)`
- Padding: `16px 24px`
- Gap: `8px`
- Alignment: flex-end
- Shadow: card shadow

## WebEmptyState

- Reference: `.state-panel`
- Padding: `64px 24px`
- Gap: `12px`
- Background: white
- Border: `1px solid rgba(0, 0, 0, 0.08)`
- Radius: `16px`
- Icon: `64px x 64px`, pill, placeholder background
- Title: `17px / 700 / -0.3px`
- Description: `14px / #8a8e93`, max width `360px`

## WebErrorState

- Reference: `.state-panel.error` derived state
- Same layout as `WebEmptyState`
- Icon background: `rgba(255, 59, 48, 0.08)`
- Icon color: `#ff3b30`

## WebSkeleton

- Reference: `.skel`
- Background: `linear-gradient(90deg, #EAEDEF 0%, #f3f5f6 50%, #EAEDEF 100%)`
- Background size: `600px 100%`
- Animation: shimmer `1.4s linear infinite`
- Radius: `8px`
