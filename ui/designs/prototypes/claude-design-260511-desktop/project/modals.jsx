/* global React */
/* ============================================
   Modals — Save, PlannerAdd, IngredientFilter, Lightbox,
   PantryAddIngredient, PantryAddBundle, PantryReflect, Nickname, Logout
   ============================================ */
const { useState: useStateM, useMemo: useMemoM, useEffect: useEffectM } = React;
const { Icon: IconM, Button: ButtonM, Chip: ChipM, Dialog: DialogM, SegmentedRow: SegmentedRowM, DateChipRail: DateChipRailM, Stepper: StepperM } = window.HC;
const DM = window.HC_DATA;

/* ---------------- Save modal ---------------- */
function SaveModal({ open, recipeId, savedSet, onClose, onConfirm, toast }) {
  const recipe = recipeId ? DM.RECIPE[recipeId] : null;
  const customs = DM.RECIPEBOOKS.filter(b => b.type === "custom");
  const [picked, setPicked] = useStateM(new Set(["rb-saved"]));
  useEffectM(() => { if (open) setPicked(new Set(["rb-saved"])); }, [open, recipeId]);
  const toggle = (id) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!recipe) return null;
  return (
    <DialogM
      open={open} onClose={onClose}
      title="레시피 저장"
      helper={recipe.title}
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM variant="primary" leftIcon="bookmark" onClick={() => { onConfirm(recipeId, [...picked]); }}>{picked.size}개 북에 저장</ButtonM>
      </>}
    >
      <div className="save-modal-body">
        <p className="reading-lead" style={{ marginBottom: 16 }}>저장할 레시피북을 선택하세요.</p>

        <div className="save-section-title">기본</div>
        <div className="save-book-list">
          <SaveRow checked={picked.has("rb-saved")} onToggle={() => toggle("rb-saved")} title="저장한 레시피" count={38} icon="bookmark" />
        </div>

        <div className="save-section-title" style={{ marginTop: 18 }}>커스텀</div>
        <div className="save-book-list">
          {customs.map(b => (
            <SaveRow key={b.id} checked={picked.has(b.id)} onToggle={() => toggle(b.id)} title={b.title} count={b.count} icon="book" />
          ))}
        </div>

        <button className="save-newbook" onClick={() => toast("새 레시피북 만들기 (데모)")}>
          <IconM name="plus" size={14} /> 새 레시피북 만들기
        </button>
      </div>
    </DialogM>
  );
}

function SaveRow({ checked, onToggle, title, count, icon }) {
  return (
    <button className={`save-row ${checked ? "on" : ""}`} onClick={onToggle}>
      <span className="save-row-icon"><IconM name={icon} size={14} /></span>
      <span className="save-row-title">{title}</span>
      <span className="save-row-count tabular">{count}</span>
      <span className={`check-box ${checked ? "on" : ""}`}>
        {checked && <IconM name="check" size={12} />}
      </span>
    </button>
  );
}

/* ---------------- Planner add modal ---------------- */
function PlannerAddModal({ open, recipeId, defaultDate, defaultCol, onClose, onConfirm }) {
  const recipe = recipeId ? DM.RECIPE[recipeId] : null;
  const [dateISO, setDate] = useStateM(defaultDate || DM.TODAY_ISO);
  const [col, setCol] = useStateM(defaultCol || "col-d");
  const [servings, setServings] = useStateM(recipe?.baseServings || 2);

  useEffectM(() => {
    if (open) {
      setDate(defaultDate || DM.TODAY_ISO);
      setCol(defaultCol || "col-d");
      setServings(recipe?.baseServings || 2);
    }
  }, [open, defaultDate, defaultCol, recipeId]);

  if (!recipe) return null;

  return (
    <DialogM
      open={open} onClose={onClose}
      title="플래너에 추가"
      helper={recipe.title}
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM variant="primary" leftIcon="cal" onClick={() => onConfirm({ recipeId, date: dateISO, col, servings })}>플래너에 추가</ButtonM>
      </>}
    >
      <div className="planner-add-body">
        <div className="form-row">
          <label className="form-label">요일</label>
          <DateChipRailM value={dateISO} onChange={setDate} dates={DM.WEEK_DATES} />
        </div>
        <div className="form-row">
          <label className="form-label">끼니</label>
          <SegmentedRowM
            value={col}
            onChange={setCol}
            options={DM.MEAL_COLUMNS.map(c => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div className="form-row form-row-inline">
          <label className="form-label">인분</label>
          <StepperM value={servings} onChange={setServings} min={1} max={10} unit="인분" />
        </div>
      </div>
    </DialogM>
  );
}

/* ---------------- INGREDIENT_FILTER_MODAL ---------------- */
function IngredientFilterModal({ open, savedFilters, onClose, onApply }) {
  const [tab, setTab] = useStateM("전체");
  const [picked, setPicked] = useStateM(new Set());
  const [query, setQuery] = useStateM("");
  useEffectM(() => { if (open) { setPicked(new Set(savedFilters || [])); setQuery(""); setTab("전체"); } }, [open, savedFilters]);

  const items = useMemoM(() => {
    let list = DM.INGREDIENTS;
    if (tab !== "전체") list = list.filter(i => i.cat === tab);
    if (query.trim()) list = list.filter(i => i.name.includes(query.trim()));
    return list;
  }, [tab, query]);

  const toggle = (id) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <DialogM
      open={open} onClose={onClose}
      wide
      title="재료로 레시피 찾기"
      helper={`${picked.size}개 선택`}
      footer={<>
        <ButtonM variant="ghost" onClick={() => setPicked(new Set())}>초기화</ButtonM>
        <ButtonM variant="primary" leftIcon="filter" onClick={() => onApply(picked)}>{picked.size}개 적용</ButtonM>
      </>}
    >
      <div className="filter-modal-body">
        <div className="search-bar">
          <IconM name="search" size={14} color="var(--text-3)" />
          <input type="text" placeholder="재료 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="filter-cat-row">
          {DM.CATEGORIES.map(c => (
            <ChipM key={c} active={tab === c} onClick={() => setTab(c)}>{c}</ChipM>
          ))}
        </div>

        <div className="filter-grid">
          {items.map(i => {
            const on = picked.has(i.id);
            return (
              <button key={i.id} className={`filter-cell ${on ? "on" : ""}`} onClick={() => toggle(i.id)}>
                <IconM name={iconForCat(i.cat)} size={20} />
                <span className="filter-cell-name">{i.name}</span>
                {on && <span className="filter-cell-check"><IconM name="check" size={11} /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </DialogM>
  );
}

function iconForCat(c) {
  if (c === "채소") return "veg";
  if (c === "육류") return "meat";
  if (c === "해산물") return "fish";
  if (c === "양념") return "seasoning";
  if (c === "곡물") return "grain";
  return "egg";
}

/* ---------------- Lightbox ---------------- */
function Lightbox({ open, photos, idx, onClose, onNav }) {
  useEffectM(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNav(-1);
      if (e.key === "ArrowRight") onNav(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, onNav]);
  if (!open || !photos || photos.length === 0) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="닫기">
        <IconM name="x" size={20} />
      </button>
      <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); onNav(-1); }} aria-label="이전">
        <IconM name="chevL" size={20} />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="lightbox-frame">
        <img className="lightbox-img" src={photos[idx]} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>
      <button className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); onNav(1); }} aria-label="다음">
        <IconM name="chevR" size={20} />
      </button>
      <div className="lightbox-counter tabular">{idx + 1} / {photos.length}</div>
    </div>
  );
}

/* ---------------- Pantry add ingredient ---------------- */
function PantryAddIngredientModal({ open, pantryHeld, onClose, onConfirm }) {
  const [picked, setPicked] = useStateM(new Set());
  const [tab, setTab] = useStateM("전체");
  const [query, setQuery] = useStateM("");
  useEffectM(() => { if (open) { setPicked(new Set()); setTab("전체"); setQuery(""); } }, [open]);

  const items = useMemoM(() => {
    let list = DM.INGREDIENTS.filter(i => !pantryHeld.has(i.id));
    if (tab !== "전체") list = list.filter(i => i.cat === tab);
    if (query.trim()) list = list.filter(i => i.name.includes(query.trim()));
    return list;
  }, [tab, query, pantryHeld]);

  const toggle = (id) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <DialogM
      open={open} onClose={onClose} wide
      title="팬트리에 재료 추가"
      helper={`현재 보유 ${pantryHeld.size}개`}
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM variant="primary" leftIcon="plus" disabled={picked.size === 0} onClick={() => onConfirm([...picked])}>{picked.size}개 추가</ButtonM>
      </>}
    >
      <div className="filter-modal-body">
        <div className="search-bar">
          <IconM name="search" size={14} color="var(--text-3)" />
          <input type="text" placeholder="재료 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="filter-cat-row">
          {DM.CATEGORIES.map(c => (
            <ChipM key={c} active={tab === c} onClick={() => setTab(c)}>{c}</ChipM>
          ))}
        </div>
        {items.length === 0 ? (
          <div className="empty-mini">모든 재료가 이미 팬트리에 있어요.</div>
        ) : (
          <div className="filter-grid">
            {items.map(i => {
              const on = picked.has(i.id);
              return (
                <button key={i.id} className={`filter-cell ${on ? "on" : ""}`} onClick={() => toggle(i.id)}>
                  <IconM name={iconForCat(i.cat)} size={20} />
                  <span className="filter-cell-name">{i.name}</span>
                  {on && <span className="filter-cell-check"><IconM name="check" size={11} /></span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DialogM>
  );
}

/* ---------------- Pantry add bundle ---------------- */
function PantryAddBundleModal({ open, pantryHeld, onClose, onConfirm }) {
  const [picked, setPicked] = useStateM(null);
  useEffectM(() => { if (open) setPicked(null); }, [open]);

  return (
    <DialogM
      open={open} onClose={onClose}
      title="번들로 한꺼번에 추가"
      helper="자주 쓰는 재료 묶음을 선택하세요"
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM variant="primary" leftIcon="copy" disabled={!picked} onClick={() => onConfirm(picked)}>번들 추가</ButtonM>
      </>}
    >
      <div className="col gap-3">
        {DM.PANTRY_BUNDLES.map(b => {
          const missing = b.picks.filter(p => !pantryHeld.has(p));
          const on = picked === b.id;
          return (
            <button key={b.id} className={`bundle-card ${on ? "on" : ""}`} onClick={() => setPicked(b.id)}>
              <div className="bundle-card-head">
                <div className="bundle-card-title">{b.title}</div>
                <div className="bundle-card-meta tabular">{missing.length} / {b.picks.length} 추가</div>
              </div>
              <div className="bundle-card-tags">
                {b.picks.slice(0, 8).map(pid => {
                  const ing = DM.ING[pid];
                  const have = pantryHeld.has(pid);
                  return (
                    <span key={pid} className={`bundle-tag ${have ? "have" : ""}`}>
                      {ing?.name}{have ? " ✓" : ""}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </DialogM>
  );
}

/* ---------------- Pantry reflect (post shopping) ---------------- */
function PantryReflectModal({ open, items, onClose, onConfirm }) {
  const [picked, setPicked] = useStateM(new Set());
  useEffectM(() => { if (open) setPicked(new Set((items || []).map(i => i.ing))); }, [open, items]);
  const toggle = (id) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <DialogM
      open={open} onClose={onClose}
      title="팬트리에 반영할까요?"
      helper="장본 재료를 팬트리에 자동으로 추가합니다"
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>나중에</ButtonM>
        <ButtonM variant="primary" leftIcon="check" onClick={() => onConfirm([...picked])}>{picked.size}개 반영</ButtonM>
      </>}
    >
      <div className="col gap-1">
        {(items || []).map(i => {
          const on = picked.has(i.ing);
          return (
            <button key={i.id} className={`save-row ${on ? "on" : ""}`} onClick={() => toggle(i.ing)}>
              <span className="save-row-icon"><IconM name="fridge" size={14} /></span>
              <span className="save-row-title">{i.name}</span>
              <span className="save-row-count tabular">{i.amount || ""}</span>
              <span className={`check-box ${on ? "on" : ""}`}>{on && <IconM name="check" size={12} />}</span>
            </button>
          );
        })}
        {(!items || items.length === 0) && <div className="empty-mini">반영할 새 재료가 없어요.</div>}
      </div>
    </DialogM>
  );
}

/* ---------------- Nickname edit ---------------- */
function NicknameModal({ open, current, onClose, onConfirm }) {
  const [val, setVal] = useStateM(current || "");
  useEffectM(() => { if (open) setVal(current || ""); }, [open, current]);
  return (
    <DialogM
      open={open} onClose={onClose}
      title="닉네임 변경"
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM variant="primary" disabled={!val.trim() || val.trim() === current} onClick={() => onConfirm(val.trim())}>변경</ButtonM>
      </>}
    >
      <div className="form-row">
        <label className="form-label">새 닉네임</label>
        <input className="text-input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="닉네임 입력" maxLength={20} />
        <div className="form-help">한글·영문·숫자 2-20자</div>
      </div>
    </DialogM>
  );
}

/* ---------------- Logout confirm ---------------- */
function LogoutModal({ open, provider, onClose, onConfirm }) {
  const label = provider === "kakao" ? "카카오" : provider === "naver" ? "네이버" : "구글";
  return (
    <DialogM
      open={open} onClose={onClose}
      title="로그아웃 할까요?"
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM variant="primary" leftIcon="logout" onClick={onConfirm}>로그아웃</ButtonM>
      </>}
    >
      <p className="reading">{label} 계정에서 로그아웃합니다. 저장한 데이터는 그대로 유지돼요.</p>
    </DialogM>
  );
}

window.HC_MODALS = {
  SaveModal, PlannerAddModal, IngredientFilterModal, Lightbox,
  PantryAddIngredientModal, PantryAddBundleModal, PantryReflectModal,
  NicknameModal, LogoutModal,
};
