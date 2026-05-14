/* global React */
/* ============================================
   Modals — Save, PlannerAdd, IngredientFilter, Lightbox,
   PantryAddIngredient, PantryAddBundle, PantryReflect, Nickname, Logout
   ============================================ */
const { useState: useStateM, useMemo: useMemoM, useEffect: useEffectM, useRef: useRefM } = React;
const { Icon: IconM, Button: ButtonM, Chip: ChipM, Dialog: DialogM, SegmentedRow: SegmentedRowM, DateChipRail: DateChipRailM, Stepper: StepperM } = window.HC;
const DM = window.HC_DATA;

function plannerSlotText(dateISO, col) {
  const day = DM.WEEK_DATES.find(d => d.iso === dateISO);
  const colName = DM.MEAL_COLUMNS.find(c => c.id === col)?.name || "저녁";
  return day ? `${day.dow} 5/${day.d} · ${colName}` : `끼니 추가 · ${colName}`;
}

/* ---------------- Save modal ---------------- */
function SaveModal({ open, recipeId, savedSet, recipebooks = DM.RECIPEBOOKS, onClose, onConfirm, onCreateBook }) {
  const recipe = recipeId ? DM.RECIPE[recipeId] : null;
  const customs = recipebooks.filter(b => b.type === "custom");
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

        <button className="save-newbook" onClick={onCreateBook}>
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
function PlannerAddModal({ open, recipeId, defaultDate, defaultCol, defaultServings, onClose, onConfirm }) {
  const recipe = recipeId ? DM.RECIPE[recipeId] : null;
  const [dateISO, setDate] = useStateM(defaultDate || DM.TODAY_ISO);
  const [col, setCol] = useStateM(defaultCol || "col-d");
  const [servings, setServings] = useStateM(defaultServings || recipe?.baseServings || 2);

  useEffectM(() => {
    if (open) {
      setDate(defaultDate || DM.TODAY_ISO);
      setCol(defaultCol || "col-d");
      setServings(defaultServings || recipe?.baseServings || 2);
    }
  }, [open, defaultDate, defaultCol, defaultServings, recipeId]);

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

/* ---------------- Planned servings confirm (menu add pickers) ---------------- */
function PlannedServingsConfirmModal({ open, recipe, defaultDate, defaultCol, lockedSlot = false, onClose, onConfirm }) {
  const [dateISO, setDate] = useStateM(defaultDate || DM.TODAY_ISO);
  const [col, setCol] = useStateM(defaultCol || "col-d");
  const [servings, setServings] = useStateM(recipe?.baseServings || 2);
  const bodyRef = useRefM(null);
  const lockedPlannerSlot = Boolean(lockedSlot && defaultDate && defaultCol);

  useEffectM(() => {
    if (!open) return;
    setDate(defaultDate || DM.TODAY_ISO);
    setCol(defaultCol || "col-d");
    setServings(recipe?.baseServings || 2);
    if (!lockedPlannerSlot) {
      window.setTimeout(() => bodyRef.current?.querySelector(".date-chip")?.focus(), 0);
    }
  }, [open, defaultDate, defaultCol, lockedPlannerSlot, recipe?.id]);

  if (!recipe) return null;

  return (
    <DialogM
      open={open}
      onClose={onClose}
      narrow
      title="끼니로 추가"
      helper={lockedPlannerSlot ? "선택한 끼니는 그대로 두고 인분만 정하세요" : "날짜와 인분을 확인하세요"}
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM
          variant="primary"
          leftIcon="cal"
          onClick={() => onConfirm({ recipeId: recipe.id, date: dateISO, col, servings })}
        >
          플래너에 추가
        </ButtonM>
      </>}
    >
      <div className="servings-confirm" ref={bodyRef}>
        <div className="servings-confirm-preview">
          <div className="servings-confirm-thumb">
            {recipe.photo && <img src={recipe.photo} alt={recipe.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          </div>
          <div className="servings-confirm-copy">
            <div className="servings-confirm-title">{recipe.title}</div>
            <div className="servings-confirm-meta tabular">
              {recipe.cookTime || 30}분 · 기본 {recipe.baseServings || 2}인분
            </div>
          </div>
        </div>
        {lockedPlannerSlot ? (
          <div className="servings-confirm-slot-card">
            <div className="servings-confirm-slot-label">선택한 끼니</div>
            <div className="servings-confirm-slot-value tabular">{plannerSlotText(dateISO, col)}</div>
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="form-row form-row-inline">
          <label className="form-label">먹을 인분</label>
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
  const searchRef = useRefM(null);
  useEffectM(() => {
    if (open) {
      setPicked(new Set(savedFilters || []));
      setQuery("");
      setTab("전체");
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, savedFilters]);

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
          <input ref={searchRef} type="text" placeholder="재료 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
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

/* ---------------- Manual recipe ingredient picker ---------------- */
function IngredientPickerModal_ManualCreate({ open, existingIds, onClose, onConfirm }) {
  const [tab, setTab] = useStateM("전체");
  const [picked, setPicked] = useStateM(new Set());
  const [query, setQuery] = useStateM("");
  const searchRef = useRefM(null);
  const existing = useMemoM(() => new Set(existingIds || []), [existingIds]);

  useEffectM(() => {
    if (!open) return;
    setPicked(new Set());
    setQuery("");
    setTab("전체");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const items = useMemoM(() => {
    let list = DM.INGREDIENTS;
    if (tab !== "전체") list = list.filter(i => i.cat === tab);
    if (query.trim()) list = list.filter(i => i.name.includes(query.trim()));
    return list;
  }, [tab, query]);

  const selected = [...picked].map(id => DM.ING[id]).filter(Boolean);
  const toggle = (id) => {
    if (existing.has(id)) return;
    setPicked(p => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <DialogM
      open={open}
      onClose={onClose}
      wide
      title="재료 선택"
      helper="직접 만든 레시피에 넣을 재료를 고르세요"
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM
          variant="primary"
          leftIcon="plus"
          disabled={picked.size === 0}
          onClick={() => onConfirm(selected)}
        >
          {picked.size}개 재료 추가
        </ButtonM>
      </>}
    >
      <div className="filter-modal-body manual-ing-picker">
        <div className="search-bar">
          <IconM name="search" size={14} color="var(--text-3)" />
          <input ref={searchRef} type="text" placeholder="재료 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="filter-cat-row">
          {DM.CATEGORIES.map(c => (
            <ChipM key={c} active={tab === c} onClick={() => setTab(c)}>{c}</ChipM>
          ))}
        </div>

        <div className="ing-picker-selected" aria-live="polite">
          {selected.length === 0 ? (
            <span className="ing-picker-empty">선택한 재료가 없어요</span>
          ) : selected.map(i => (
            <button key={i.id} className="ing-picker-pill" onClick={() => toggle(i.id)}>
              {i.name} <IconM name="x" size={12} />
            </button>
          ))}
        </div>

        <div className="filter-grid">
          {items.map(i => {
            const on = picked.has(i.id);
            const disabled = existing.has(i.id);
            return (
              <button
                key={i.id}
                className={`filter-cell manual-ing-cell ${on ? "on" : ""} ${disabled ? "disabled" : ""}`}
                onClick={() => toggle(i.id)}
                disabled={disabled}
              >
                <IconM name={iconForCat(i.cat)} size={20} />
                <span className="filter-cell-name">{i.name}</span>
                {disabled ? (
                  <span className="filter-cell-sub">추가됨</span>
                ) : on ? (
                  <span className="filter-cell-check"><IconM name="check" size={11} /></span>
                ) : (
                  <span className="filter-cell-plus"><IconM name="plus" size={11} /></span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </DialogM>
  );
}

/* ---------------- Lightbox ---------------- */
function Lightbox({ open, photos, idx, onClose, onNav }) {
  const closeRef = useRefM(null);
  useEffectM(() => {
    if (!open) return;
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNav(-1);
      if (e.key === "ArrowRight") onNav(1);
      if (e.key === "Tab") {
        const focusables = [...document.querySelectorAll(".lightbox button")];
        if (focusables.length === 0) return;
        const current = document.activeElement;
        const idx = focusables.indexOf(current);
        const nextIdx = e.shiftKey
          ? (idx <= 0 ? focusables.length - 1 : idx - 1)
          : (idx === focusables.length - 1 ? 0 : idx + 1);
        e.preventDefault();
        focusables[nextIdx].focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, onNav]);
  if (!open || !photos || photos.length === 0) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="사진 보기" onClick={onClose}>
      <button ref={closeRef} className="lightbox-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="닫기">
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

/* ---------------- Consumed ingredients (post cooking) ---------------- */
function ConsumedIngredientSheet({ open, recipe, mealId, ingredients, pantryHeld, onClose, onConfirm }) {
  const [picked, setPicked] = useStateM(new Set());

  useEffectM(() => {
    if (!open) return;
    setPicked(new Set((ingredients || []).filter(i => i.id && pantryHeld?.has(i.id)).map(i => i.id)));
  }, [open, ingredients, pantryHeld]);

  const toggle = (id) => setPicked(p => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (!recipe) return null;

  return (
    <DialogM
      open={open}
      onClose={onClose}
      title="재료 차감"
      helper={mealId ? "플래너 요리를 완료하고 팬트리를 정리합니다" : "독립 요리에 사용한 재료를 팬트리에서 차감합니다"}
      footer={<>
        <ButtonM variant="ghost" onClick={() => onConfirm([])}>차감 없이 완료</ButtonM>
        <ButtonM variant="primary" leftIcon="check" onClick={() => onConfirm([...picked])}>
          요리 완료 ({picked.size}개 차감)
        </ButtonM>
      </>}
    >
      <div className="consumed-sheet">
        <p className="consumed-desc">
          {recipe.title}에 사용한 재료 중 팬트리에서 차감할 항목을 선택하세요.
        </p>
        <div className="consumed-list">
          {(ingredients || []).map((ing, idx) => {
            const name = ing.id ? DM.ING[ing.id]?.name : ing.name;
            const inPantry = ing.id && pantryHeld?.has(ing.id);
            const on = ing.id && picked.has(ing.id);
            return (
              <button
                key={ing.id || idx}
                className={`consumed-item ${on ? "on" : ""}`}
                type="button"
                disabled={!inPantry}
                onClick={() => inPantry && toggle(ing.id)}
              >
                <span className={`check-box ${on ? "on" : ""}`}>
                  {on && <IconM name="check" size={12} />}
                </span>
                <span className="consumed-name">{name}</span>
                <span className="consumed-amount tabular">{ing.amount}{ing.unit ? ` ${ing.unit}` : ""}</span>
                <span className={`consumed-tag ${inPantry ? "held" : ""}`}>{inPantry ? "보유" : "없음"}</span>
              </button>
            );
          })}
        </div>
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

/* ---------------- Recipebook name edit/create ---------------- */
function RecipebookNameModal({ open, mode = "create", currentTitle = "", onClose, onConfirm }) {
  const [val, setVal] = useStateM(currentTitle || "");
  const isEdit = mode === "edit";
  const normalized = val.trim();

  useEffectM(() => {
    if (open) setVal(currentTitle || "");
  }, [open, currentTitle]);

  return (
    <DialogM
      open={open}
      onClose={onClose}
      title={isEdit ? "레시피북 이름 수정" : "새 레시피북"}
      helper={isEdit ? "커스텀 레시피북의 이름만 수정합니다." : "빈 커스텀 레시피북을 만듭니다."}
      footer={<>
        <ButtonM variant="ghost" onClick={onClose}>취소</ButtonM>
        <ButtonM
          variant="primary"
          leftIcon={isEdit ? "edit" : "plus"}
          disabled={!normalized || (isEdit && normalized === currentTitle)}
          onClick={() => onConfirm(normalized)}
        >
          {isEdit ? "저장" : "만들기"}
        </ButtonM>
      </>}
    >
      <div className="form-row">
        <label className="form-label">레시피북 이름</label>
        <input
          className="text-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="예: 도시락 메뉴"
          maxLength={24}
        />
        <div className="form-help">커스텀 북 이름만 저장합니다. 설명이나 썸네일 편집은 이번 범위에서 제외됩니다.</div>
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
  PlannedServingsConfirmModal, IngredientPickerModal_ManualCreate,
  PantryAddIngredientModal, PantryAddBundleModal, PantryReflectModal,
  ConsumedIngredientSheet,
  NicknameModal, RecipebookNameModal, LogoutModal,
};
