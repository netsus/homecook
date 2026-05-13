/* global React */
/* ============================================
   Shared primitives — line icons + atoms
   ============================================ */
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

/* ---------------- Line Icons (24×24, stroke 1.8) ---------------- */
const ICON_PATHS = {
  search:   "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm9 16-4.35-4.35",
  x:        "M6 6l12 12M18 6 6 18",
  plus:     "M12 5v14M5 12h14",
  minus:    "M5 12h14",
  check:    "M5 12l4.5 4.5L19 7",
  chevR:    "M9 6l6 6-6 6",
  chevL:    "M15 6l-6 6 6 6",
  chevD:    "M6 9l6 6 6-6",
  chevU:    "M6 15l6-6 6 6",
  heart:    "M12 20s-7-4.5-9.5-9C.7 6.4 4 3 7.2 3c1.8 0 3.5 1 4.8 2.4C13.3 4 15 3 16.8 3 20 3 23.3 6.4 21.5 11 19 15.5 12 20 12 20Z",
  heartF:   "M12 20s-7-4.5-9.5-9C.7 6.4 4 3 7.2 3c1.8 0 3.5 1 4.8 2.4C13.3 4 15 3 16.8 3 20 3 23.3 6.4 21.5 11 19 15.5 12 20 12 20Z",
  bookmark: "M6 4h12v17l-6-4-6 4V4Z",
  bookmarkF:"M6 4h12v17l-6-4-6 4V4Z",
  bell:     "M6 16h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v4L6 16Zm4 2a2 2 0 0 0 4 0",
  user:     "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  lock:     "M7 10V8a5 5 0 0 1 10 0v2M6 10h12v11H6V10Zm6 5v2",
  share:    "M16 8a3 3 0 1 0-2.83-4M8 14a3 3 0 1 0 0-4M16 20a3 3 0 1 0-2.83-4M10 13l5 3M10 11l5-3",
  cart:     "M5 6h15l-1.5 9H8L6 4H3M8 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  bag:      "M6 8h12l-1 12H7L6 8Zm3-3a3 3 0 0 1 6 0",
  fire:     "M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-9Z",
  flame:    "M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-9Z",
  pot:      "M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6Zm3-3v-2m5 2v-3m5 3v-2m-13 5h16",
  utensil:  "M5 3v6a2 2 0 1 0 4 0V3M7 9v12M16 3c-2 0-3 2-3 5s1 5 3 5v8",
  book:     "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Zm3 0v17",
  bookOpen: "M3 5l9 2v13L3 18V5Zm18 0-9 2v13l9-2V5Z",
  fridge:   "M6 3h12v18H6V3Zm0 8h12M9 7v2M9 14v3",
  calendar: "M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4",
  cal:      "M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4",
  home:     "M4 12 12 4l8 8v8h-5v-6h-6v6H4v-8Z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3a8 8 0 0 0-.2-2l2-1.5-2-3.5L17 6a8 8 0 0 0-3.5-2L13 1.5h-2L10.5 4A8 8 0 0 0 7 6L4.2 5l-2 3.5L4.2 10A8 8 0 0 0 4 12c0 .7 0 1.3.2 2L2.2 15.5l2 3.5L7 18a8 8 0 0 0 3.5 2L11 22.5h2l.5-2.5A8 8 0 0 0 17 18l2.8 1 2-3.5-2-1.5c.2-.7.2-1.3.2-2Z",
  edit:     "M4 20l4-1 11-11-3-3L5 16l-1 4Z",
  trash:    "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  more:     "M6 12h0M12 12h0M18 12h0",
  dots:     "M6 12h.01M12 12h.01M18 12h.01",
  drag:     "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  logout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  doc:      "M7 3h8l4 4v14H7V3Zm8 0v4h4",
  question: "M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 18v.01",
  info:     "M12 7v.01M12 11v6M12 22A10 10 0 1 1 12 2a10 10 0 0 1 0 20Z",
  alert:    "M12 9v4m0 4v.01M12 2 22 20H2L12 2Z",
  refresh:  "M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5",
  filter:   "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
  sort:     "M4 7h16M7 12h10M10 17h4",
  sortDesc: "M4 7h16M7 12h10M10 17h4",
  eye:      "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  link:     "M9 15l6-6m-3-1 1.5-1.5a4 4 0 0 1 5.7 5.7L18 14.5m-7 4L9.5 20a4 4 0 0 1-5.7-5.7L5 13",
  youtube:  "M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm7 2 5 3-5 3V9Z",
  globe:    "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm0-20c2.5 3 4 6.5 4 10s-1.5 7-4 10c-2.5-3-4-6.5-4-10s1.5-7 4-10ZM2 12h20",
  star:     "M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3Z",
  starF:    "M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3Z",
  arrowR:   "M5 12h14M13 5l7 7-7 7",
  arrowL:   "M19 12H5M11 5l-7 7 7 7",
  swap:     "M7 4 4 7l3 3M4 7h13a4 4 0 0 1 0 8h-3M17 20l3-3-3-3M20 17H7a4 4 0 0 1 0-8h3",
  copy:     "M9 3h11v11M14 7H4v14h14V11",
  list:     "M4 6h16M4 12h16M4 18h16",
  grid:     "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  veg:      "M12 4c4 0 7 3 7 7 0 5-4 9-7 9s-7-4-7-9c0-4 3-7 7-7Zm0 0v16",
  meat:     "M8 4c5-1 9 1 11 5l1 4-3 4c-3 3-7 4-10 1-2-2-3-5-2-9 .5-3 2-4 3-5Z",
  fish:     "M3 12c3-5 8-7 13-7 3 0 5 1 5 3v8c0 2-2 3-5 3-5 0-10-2-13-7Zm15-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  seasoning:"M9 3h6v4l1 2v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l1-2V3Zm0 6h6",
  grain:    "M12 3c2 3 2 7 0 11-2-4-2-8 0-11Zm-5 4c2 2 3 5 3 8-3 0-5-2-6-5l3-3Zm10 0c-2 2-3 5-3 8 3 0 5-2 6-5l-3-3ZM12 14v7",
  egg:      "M12 3c4 0 7 6 7 11a7 7 0 1 1-14 0c0-5 3-11 7-11Z",
  reset:    "M3 12a9 9 0 1 0 3-6.7M3 5v5h5",
  arrowUp:  "M12 19V5M5 12l7-7 7 7",
  arrowDown:"M12 5v14M5 12l7 7 7-7",
};

function Icon({ name, size = 18, stroke = 1.8, fill, color, style, ...rest }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  const isFilled = name.endsWith("F");
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={isFilled ? (fill || color || "currentColor") : "none"}
      stroke={color || "currentColor"} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

/* ---------------- TopNav ---------------- */
function TopNav({ tab, onTab, account }) {
  const tabs = [
    { id: "HOME",         label: "탐색" },
    { id: "PLANNER_WEEK", label: "플래너" },
    { id: "PANTRY",       label: "팬트리" },
    { id: "MYPAGE",       label: "마이페이지" },
  ];
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <button className="topnav-brand" onClick={() => onTab("HOME")}>
          <span className="dot" />
          HOMECOOK
        </button>
        <nav className="topnav-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`topnav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topnav-right">
          <button className="topnav-avatar" title={account?.nickname || ""}>
            {account?.initials || "JY"}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Button ---------------- */
function Button({ variant = "primary", size, full, children, leftIcon, rightIcon, ...rest }) {
  const cls = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    size === "lg" ? "btn-lg" : "",
    full ? "btn-full" : "",
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {leftIcon && <Icon name={leftIcon} size={size === "sm" ? 14 : 16} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}

/* ---------------- Chip ---------------- */
function Chip({ active, onClick, children, count, leftIcon, removable, onRemove }) {
  return (
    <button className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {leftIcon && <Icon name={leftIcon} size={14} />}
      <span>{children}</span>
      {typeof count === "number" && <span className="chip-count">{count}</span>}
      {removable && (
        <span className="chip-remove" onClick={(e) => { e.stopPropagation(); onRemove?.(); }}>
          <Icon name="x" size={12} />
        </span>
      )}
    </button>
  );
}

/* ---------------- Tag ---------------- */
function Tag({ children, variant }) {
  return <span className={`tag ${variant === "brand" ? "tag-brand" : ""}`}>{children}</span>;
}

/* ---------------- PhotoCard (HOME grid + airbnb hover) ---------------- */
function PhotoCard({ recipe, onClick, onSave, saved }) {
  return (
    <div className="photo-card" onClick={onClick}>
      <div className="photo-card-thumb">
        <img src={recipe.photo} alt={recipe.title}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <button
          className={`photo-card-save ${saved ? "saved" : ""}`}
          onClick={(e) => { e.stopPropagation(); onSave?.(); }}
          title={saved ? "저장 해제" : "저장"}
        >
          <Icon name={saved ? "bookmarkF" : "bookmark"} size={16} />
        </button>
      </div>
      <div className="photo-card-body">
        <div className="photo-card-title">{recipe.title}</div>
        <div className="photo-card-meta">
          <span>{recipe.source}</span>
          <span className="sep">·</span>
          <span className="tabular">조회 {recipe.views > 999 ? `${(recipe.views/1000).toFixed(1)}k` : recipe.views}</span>
          <span className="sep">·</span>
          <span className="tabular">저장 {recipe.saves}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dialog shell ---------------- */
function Dialog({ open, onClose, title, helper, footer, children, wide, narrow, onClickScrim = true }) {
  useEffectC(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={() => onClickScrim && onClose?.()}>
      <div className={`dialog ${wide ? "dialog-wide" : ""} ${narrow ? "dialog-narrow" : ""}`}
           onClick={(e) => e.stopPropagation()}>
        {(title || onClose) && (
          <div className="dialog-header">
            <div className="dialog-header-text">
              {title && <div className="dialog-title">{title}</div>}
              {helper && <div className="dialog-helper">{helper}</div>}
            </div>
            {onClose && (
              <button className="dialog-close" onClick={onClose} aria-label="닫기">
                <Icon name="x" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- LoginGate (desktop return-to-action) ---------------- */
function LoginGateDialog({
  open,
  onClose,
  onConfirm,
  actionLabel = "이 작업",
  title = "로그인이 필요해요",
  helper = "로그인하면 방금 하려던 작업을 이어서 완료할 수 있어요.",
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      helper={actionLabel}
      narrow
      footer={<>
        <Button variant="ghost" onClick={onClose}>나중에</Button>
        <Button variant="primary" leftIcon="user" onClick={onConfirm}>로그인하고 계속</Button>
      </>}
    >
      <div className="login-gate">
        <div className="login-gate-summary">
          <div className="login-gate-icon"><Icon name="lock" size={18} /></div>
          <div className="login-gate-copy">
            <div className="login-gate-title">{actionLabel}</div>
            <div className="login-gate-desc">{helper}</div>
          </div>
        </div>
        <div className="login-provider-list">
          <button className="login-provider kakao" onClick={onConfirm}>
            <span className="login-provider-main">
              <span className="login-provider-mark">K</span>
              카카오로 계속하기
            </span>
            <Icon name="chevR" size={14} color="var(--text-3)" />
          </button>
          <button className="login-provider" onClick={onConfirm}>
            <span className="login-provider-main">
              <span className="login-provider-mark">G</span>
              Google로 계속하기
            </span>
            <Icon name="chevR" size={14} color="var(--text-3)" />
          </button>
        </div>
        <div className="login-gate-note">
          데모에서는 로그인 후 같은 화면에서 작업을 바로 이어갑니다.
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- Toast ---------------- */
function Toast({ bus }) {
  const [msg, setMsg] = useStateC(null);
  const timerRef = useRefC(null);
  useEffectC(() => {
    return bus.sub((m) => {
      setMsg(m);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMsg(null), 2400);
    });
  }, [bus]);
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

/* ---------------- Empty / Error / Skeleton ---------------- */
function StatePanel({ icon = "info", title, desc, action }) {
  return (
    <div className="state-panel">
      <div className="state-icon"><Icon name={icon} size={28} color="var(--text-3)" /></div>
      <div className="state-title">{title}</div>
      {desc && <div className="state-desc">{desc}</div>}
      {action}
    </div>
  );
}

function HomeSkeletonGrid({ rows = 2 }) {
  return (
    <div className="home-grid">
      {Array.from({ length: rows * 4 }).map((_, i) => (
        <div key={i}>
          <div className="skel skel-thumb" />
          <div style={{ height: 12 }} />
          <div className="skel skel-line" style={{ width: "85%" }} />
          <div style={{ height: 6 }} />
          <div className="skel skel-line" style={{ width: "55%" }} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Sort dropdown (desktop variant per spec §1 v1.5.0) ---------------- */
function SortDropdown({ value, options, onChange }) {
  const [open, setOpen] = useStateC(false);
  const ref = useRefC(null);
  useEffectC(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const cur = options.find(o => o.value === value);
  return (
    <div className="sort-dd" ref={ref}>
      <button className="sort-trigger" onClick={() => setOpen(o => !o)}>
        <Icon name="sort" size={14} />
        <span>{cur?.label}</span>
        <Icon name="chevD" size={14} />
      </button>
      {open && (
        <div className="sort-menu">
          {options.map(o => (
            <button
              key={o.value}
              className={`sort-item ${o.value === value ? "selected" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
              {o.value === value && <Icon name="check" size={14} color="var(--brand)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Stepper ---------------- */
function Stepper({ value, onChange, min = 1, max = 10, unit }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="감소">
        <Icon name="minus" size={14} />
      </button>
      <span className="tabular">
        <strong>{value}</strong>{unit && <span className="stepper-unit"> {unit}</span>}
      </span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="증가">
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

/* ---------------- ScreenHeader (page title row) ---------------- */
function ScreenHeader({ eyebrow, title, lead, right }) {
  return (
    <div className="screen-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {lead && <p className="screen-lead">{lead}</p>}
      </div>
      {right && <div className="screen-header-right">{right}</div>}
    </div>
  );
}

/* ---------------- SegmentedRow (끼니 선택 등) ---------------- */
function SegmentedRow({ value, options, onChange }) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button
          key={o.value}
          className={`segmented-item ${value === o.value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- DateChipRail (PlannerAddPopup) ---------------- */
function DateChipRail({ value, onChange, dates }) {
  return (
    <div className="date-chip-rail">
      {dates.map(d => {
        const isToday = d.iso === window.HC_DATA.TODAY_ISO;
        return (
          <button
            key={d.iso}
            className={`date-chip ${value === d.iso ? "active" : ""}`}
            onClick={() => onChange(d.iso)}
          >
            <span className="date-chip-dow">{d.dow}</span>
            <span className="date-chip-num tabular">5/{d.d}</span>
            {isToday && <span className="date-chip-today">오늘</span>}
          </button>
        );
      })}
    </div>
  );
}

window.HC = {
  Icon, TopNav, Button, Chip, Tag, PhotoCard,
  Dialog, LoginGateDialog, Toast, StatePanel, HomeSkeletonGrid,
  SortDropdown, Stepper, ScreenHeader, SegmentedRow, DateChipRail,
};
