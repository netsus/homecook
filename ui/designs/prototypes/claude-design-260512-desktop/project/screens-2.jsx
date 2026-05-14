/* global React */
/* ============================================
   PLANNER + PANTRY + MYPAGE — spec v1.5.2
   ============================================ */
const { useState: useS2, useMemo: useMemo2 } = React;
const {
  Icon, Button, Chip, Tag, StatePanel, PhotoCard,
  ScreenHeader, SegmentedRow,
} = window.HC;
const D2 = window.HC_DATA;

/* ============================================
   PLANNER_WEEK (§4)
   ============================================ */
function PlannerWeekScreen({ meals, onOpenAdd, onOpenMeal, onOpenShopping, stateOverride, onStateOverride }) {
  const isEmpty = stateOverride === "empty" || meals.length === 0;

  const mealMap = useMemo2(() => {
    const m = {};
    meals.forEach(meal => {
      const key = `${meal.date}__${meal.col}`;
      (m[key] ||= []).push(meal);
    });
    return m;
  }, [meals]);

  const summary = useMemo2(() => {
    const total = meals.length;
    const cookedDone = meals.filter(m => m.status === "cooked").length;
    const shopped = meals.filter(m => m.status === "shopped").length;
    const registered = meals.filter(m => m.status === "registered").length;
    return { total, cookedDone, shopped, registered };
  }, [meals]);

  return (
    <main className="screen">
      <div className="planner-page-head">
        <div>
          <h1 className="h1">주간 플래너</h1>
          <div className="text-meta tabular" style={{ marginTop: 6 }}>5월 11일(월) — 5월 17일(일)</div>
        </div>
        <div className="row gap-2">
          <Button variant="tertiary" leftIcon="chevL">이전 주</Button>
          <Button variant="tertiary" rightIcon="chevR">다음 주</Button>
          <Button variant="primary" leftIcon="cart" onClick={onOpenShopping}>
            장보기 미리보기
          </Button>
        </div>
      </div>

      {/* State demo */}
      <div className="state-toggle">
        <div className="state-toggle-label">화면 상태</div>
        <div className="state-toggle-chips">
          <button className={`state-toggle-chip ${(stateOverride || "ok") === "ok" ? "active" : ""}`} onClick={() => onStateOverride(null)}>기본</button>
          <button className={`state-toggle-chip ${stateOverride === "empty" ? "active" : ""}`} onClick={() => onStateOverride("empty")}>빈 주</button>
        </div>
      </div>

      <div className="planner-layout">
        {/* Sidebar */}
        <aside className="planner-side">
          <section className="planner-side-section">
            <div className="planner-side-title">이번 주 요약</div>
            <div className="planner-stat"><span>등록된 끼니</span><strong className="tabular">{summary.total}개</strong></div>
            <div className="planner-stat"><span>장본 끼니</span><strong className="tabular">{summary.shopped + summary.cookedDone}</strong></div>
            <div className="planner-stat"><span>요리 완료</span><strong className="tabular">{summary.cookedDone}</strong></div>
          </section>

          <section className="planner-side-section">
            <div className="planner-side-title">빠른 추가</div>
            <div className="col gap-2">
              <button className="planner-quick" onClick={() => onOpenAdd(D2.TODAY_ISO, "col-d")}>
                <Icon name="plus" size={14} /> 오늘 저녁
              </button>
              <button className="planner-quick" onClick={() => onOpenAdd("2026-05-13", "col-d")}>
                <Icon name="plus" size={14} /> 내일 저녁
              </button>
              <button className="planner-quick" onClick={() => onOpenAdd("2026-05-16", "col-l")}>
                <Icon name="plus" size={14} /> 주말 점심
              </button>
            </div>
          </section>

          <section className="planner-side-section">
            <div className="planner-side-title">최근 추가한 레시피</div>
            <div className="col gap-2">
              {D2.RECIPES.slice(0, 3).map(r => (
                <button key={r.id} className="planner-mini" onClick={() => onOpenAdd(null, null, r.id)}>
                  <div className="planner-mini-thumb">
                    <img src={r.photo} alt={r.title}
                      onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </div>
                  <div className="col" style={{ minWidth: 0 }}>
                    <div className="planner-mini-title">{r.title}</div>
                    <div className="planner-mini-meta tabular">{r.cookTime}분</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        {/* Grid */}
        {isEmpty ? (
          <div className="planner-empty">
            <StatePanel
              icon="cal"
              title="이번 주는 아직 비어 있어요"
              desc="끼니를 추가해 한 주 식단을 계획해 보세요."
              action={<Button variant="primary" leftIcon="plus" onClick={() => onOpenAdd(D2.TODAY_ISO, "col-d")}>끼니 추가</Button>}
            />
          </div>
        ) : (
          <div className="planner-grid">
            <div className="planner-head timehead" />
            {D2.WEEK_DATES.map(d => (
              <div key={d.iso} className={`planner-head ${d.iso === D2.TODAY_ISO ? "today" : ""}`}>
                <div className="planner-head-dow">{d.dow}</div>
                <div className="planner-head-date day-num tabular">5/{d.d}</div>
              </div>
            ))}

            {D2.MEAL_COLUMNS.map(col => (
              <React.Fragment key={col.id}>
                <div className="planner-time">{col.name}</div>
                {D2.WEEK_DATES.map(d => {
                  const k = `${d.iso}__${col.id}`;
                  const cellMeals = mealMap[k] || [];
                  return (
                    <div key={d.iso} className={`planner-cell ${d.iso === D2.TODAY_ISO ? "today-col" : ""}`}>
                      {cellMeals.map(m => {
                        const r = D2.RECIPE[m.recipeId];
                        return (
                          <button key={m.id} className={`planner-meal status-${m.status}`} onClick={() => onOpenMeal(m.id)}>
                            <div className="planner-meal-thumb">
                              <img src={r?.photo} alt={r?.title}
                                onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            </div>
                            <div className="planner-meal-title">{r?.title}</div>
                            <div className="planner-meal-meta tabular">{m.servings}인분</div>
                          </button>
                        );
                      })}
                      <button className="planner-add" onClick={() => onOpenAdd(d.iso, col.id)} aria-label="추가">
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="planner-legend">
        <span className="planner-legend-item"><span className="planner-legend-dot status-registered" /> 등록됨</span>
        <span className="planner-legend-item"><span className="planner-legend-dot status-shopped" /> 장본 끼니</span>
        <span className="planner-legend-item"><span className="planner-legend-dot status-cooked" /> 요리 완료</span>
      </div>
    </main>
  );
}

/* ============================================
   PANTRY (§9)
   ============================================ */
function PantryScreen({ pantryHeld, onTogglePantry, onOpenAddIngredient, onOpenAddBundle, toast }) {
  const [tab, setTab] = useS2("veg");
  const [query, setQuery] = useS2("");
  const [showOut, setShowOut] = useS2(true);
  const tabs = D2.PANTRY_GROUPS;

  const currentGroup = D2.PANTRY_GROUPS.find(g => g.id === tab);
  const items = useMemo2(() => {
    let list = D2.INGREDIENTS.filter(i => currentGroup?.cats.includes(i.cat));
    if (query.trim()) list = list.filter(i => i.name.includes(query.trim()));
    if (!showOut) list = list.filter(i => pantryHeld.has(i.id));
    return list;
  }, [tab, query, showOut, pantryHeld]);

  const heldCount = items.filter(i => pantryHeld.has(i.id)).length;
  const outCount  = items.filter(i => !pantryHeld.has(i.id)).length;

  const onTabKeyDown = (e, id) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === id);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(idx + dir + tabs.length) % tabs.length];
    setTab(next.id);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-pantry-tab="${next.id}"]`)?.focus();
    });
  };

  return (
    <main className="screen">
      <div className="pantry-head">
        <div>
          <h1 className="h1">팬트리</h1>
          <p className="screen-lead">현재 갖고 있는 재료를 표시해 두면 장보기·레시피에서 자동으로 반영됩니다.</p>
        </div>
        <div className="row gap-2">
          <Button variant="tertiary" leftIcon="copy" onClick={onOpenAddBundle}>번들로 추가</Button>
          <Button variant="primary"   leftIcon="plus" onClick={onOpenAddIngredient}>재료 추가</Button>
        </div>
      </div>

      <div className="pantry-cat-tabs" role="tablist" aria-label="팬트리 카테고리">
        {tabs.map(g => {
          const heldHere = D2.INGREDIENTS.filter(i => g.cats.includes(i.cat) && pantryHeld.has(i.id)).length;
          const totalHere = D2.INGREDIENTS.filter(i => g.cats.includes(i.cat)).length;
          return (
            <button
              key={g.id}
              className={`pantry-cat-tab ${tab === g.id ? "active" : ""}`}
              role="tab"
              aria-selected={tab === g.id}
              aria-controls="pantry-panel"
              data-pantry-tab={g.id}
              onClick={() => setTab(g.id)}
              onKeyDown={(e) => onTabKeyDown(e, g.id)}
            >
              <span className="pantry-cat-tab-label">{g.title}</span>
              <span className="pantry-cat-tab-count tabular">{heldHere}/{totalHere}</span>
            </button>
          );
        })}
      </div>

      <div className="pantry-toolbar">
        <div className="pantry-search">
          <Icon name="search" size={14} color="var(--text-3)" />
          <input
            type="text"
            placeholder={`${currentGroup?.title}에서 검색`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")}>
              <Icon name="x" size={12} color="var(--text-3)" />
            </button>
          )}
        </div>
        <div className="pantry-toolbar-right">
          <label className="pantry-toggle-row">
            <input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} />
            <span>없는 재료도 표시</span>
          </label>
          <div className="text-meta tabular">
            보유 {heldCount} · 부족 {outCount}
          </div>
        </div>
      </div>

      <section id="pantry-panel" className="pantry-panel" role="tabpanel" aria-label={currentGroup?.title}>
        {items.length === 0 ? (
          <StatePanel
            icon="fridge"
            title="여기에는 아직 재료가 없어요"
            desc="자주 쓰는 재료를 미리 등록해 두세요."
            action={<Button variant="primary" leftIcon="plus" onClick={onOpenAddIngredient}>재료 추가</Button>}
          />
        ) : (
          <div className="pantry-grid">
            {items.map(i => {
              const held = pantryHeld.has(i.id);
              return (
                <button key={i.id} type="button" className={`pantry-card ${held ? "" : "out"}`} onClick={() => onTogglePantry(i.id)}>
                  <div className="pantry-card-tag">
                    <span className={`pantry-card-tag-pill ${held ? "held" : "out"}`}>
                      {held ? "보유" : "없음"}
                    </span>
                  </div>
                  <div className="pantry-card-icon">
                    <Icon name={iconForIngredient(i)} size={28} color={held ? "var(--text-2)" : "var(--text-4)"} />
                  </div>
                  <div className="pantry-card-name">{i.name}</div>
                  <div className="pantry-card-meta">{i.cat}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function iconForIngredient(i) {
  if (i.cat === "채소") return "veg";
  if (i.cat === "육류") return "meat";
  if (i.cat === "해산물") return "fish";
  if (i.cat === "양념") return "seasoning";
  if (i.cat === "곡물") return "grain";
  return "egg";
}

/* ============================================
   MYPAGE (§13)
   ============================================ */
function MyPageScreen({
  onGoRecipebooks,
  onGoShoppingLists,
  onGoLeftovers,
  onGoAteList,
  onOpenSettings,
  onOpenNickname,
  onOpenLogout,
  onOpenRecipe,
  onDeleteAccount,
  onSaveToggle,
  account,
  savedSet,
}) {
  const tabs = [
    { id: "saved", label: "저장한 레시피", icon: "bookmark" },
    { id: "account", label: "계정 관리", icon: "user" },
    { id: "notif", label: "알림 설정", icon: "bell" },
    { id: "help", label: "도움말", icon: "question" },
  ];
  const [activeTab, setActiveTab] = useS2("saved");
  const stats = {
    saved: D2.RECIPEBOOKS.find(b => b.id === "rb-saved")?.count || 0,
    cooked: 26,
    plannerDone: 14,
  };

  const onTabKeyDown = (e, id) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === id);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(idx + dir + tabs.length) % tabs.length];
    setActiveTab(next.id);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-mypage-tab="${next.id}"]`)?.focus();
    });
  };

  return (
    <main className="screen mypage">
      <section className="my-hero">
        <div className="my-avatar">{account.initials}</div>
        <div className="my-hero-text">
          <div className="my-nickname">
            <span className="h2">{account.nickname}</span>
            <button className="my-nick-edit" onClick={onOpenNickname} aria-label="닉네임 수정">
              <Icon name="edit" size={13} />
            </button>
          </div>
          <div className="my-provider">
            <span className={`my-provider-badge prov-${account.provider}`}>{providerLabel(account.provider)}</span>
            <span className="text-meta">로그인 됨</span>
          </div>
        </div>
        <div className="my-stats">
          <div className="my-stat">
            <div className="my-stat-num tabular">{stats.saved}</div>
            <div className="my-stat-lbl">저장한 레시피</div>
          </div>
          <div className="my-stat-divider" />
          <div className="my-stat">
            <div className="my-stat-num tabular">{stats.cooked}</div>
            <div className="my-stat-lbl">다 먹은 끼니</div>
          </div>
          <div className="my-stat-divider" />
          <div className="my-stat">
            <div className="my-stat-num tabular">{stats.plannerDone}</div>
            <div className="my-stat-lbl">플래너 등록</div>
          </div>
        </div>
      </section>

      <div className="mypage-tabs" role="tablist" aria-label="마이페이지 세부 메뉴">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`mypage-tab ${activeTab === tab.id ? "active" : ""}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`mypage-panel-${tab.id}`}
            data-mypage-tab={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => onTabKeyDown(e, tab.id)}
          >
            <Icon name={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      <section
        className="mypage-panel"
        id={`mypage-panel-${activeTab}`}
        role="tabpanel"
        aria-label={tabs.find(t => t.id === activeTab)?.label}
      >
        {activeTab === "saved" && (
          <MyPageSavedPanel
            savedSet={savedSet}
            onSaveToggle={onSaveToggle}
            onOpenRecipe={onOpenRecipe}
            onGoRecipebooks={onGoRecipebooks}
            onGoShoppingLists={onGoShoppingLists}
          />
        )}
        {activeTab === "account" && (
          <MyPageAccountPanel
            account={account}
            onOpenNickname={onOpenNickname}
            onOpenLogout={onOpenLogout}
            onOpenSettings={onOpenSettings}
            onDeleteAccount={onDeleteAccount}
          />
        )}
        {activeTab === "notif" && <MyPageNotifPanel />}
        {activeTab === "help" && <MyPageHelpPanel />}
      </section>
    </main>
  );
}

function MyPageSavedPanel({ savedSet, onSaveToggle, onOpenRecipe, onGoRecipebooks, onGoShoppingLists }) {
  const savedRecipes = D2.RECIPES.filter(r => savedSet?.has(r.id));
  return (
    <div className="mypage-panel-grid">
      <ScreenHeader
        title="저장한 레시피"
        lead={`${D2.RECIPEBOOKS.find(b => b.id === "rb-saved")?.count || savedRecipes.length}개의 레시피를 저장했어요.`}
      />
      {savedRecipes.length > 0 ? (
        <div className="mypage-saved-grid">
          {savedRecipes.map(recipe => (
            <PhotoCard
              key={recipe.id}
              recipe={recipe}
              saved={savedSet?.has(recipe.id)}
              onClick={() => onOpenRecipe(recipe.id)}
              onSave={() => onSaveToggle(recipe.id)}
            />
          ))}
        </div>
      ) : (
        <StatePanel
          icon="bookmark"
          title="저장한 레시피가 없어요"
          desc="홈에서 마음에 드는 레시피를 저장해보세요."
        />
      )}

      <button className="mypage-quick-nav" type="button" onClick={onGoRecipebooks}>
        <span className="meta-icon"><Icon name="book" size={16} /></span>
        <span className="mypage-quick-nav-body">
          <span className="mypage-quick-nav-title">레시피북 관리</span>
          <span className="mypage-quick-nav-desc">내가 추가한 · 저장한 · 좋아요한 · 커스텀 북 6개</span>
        </span>
        <Icon name="chevR" size={16} color="var(--text-4)" />
      </button>

      <button className="mypage-quick-nav" type="button" onClick={onGoShoppingLists}>
        <span className="meta-icon"><Icon name="cart" size={16} /></span>
        <span className="mypage-quick-nav-body">
          <span className="mypage-quick-nav-title">장보기 내역</span>
          <span className="mypage-quick-nav-desc">진행 중 · 완료된 장보기 {D2.SHOPPING_LISTS.length}개</span>
        </span>
        <Icon name="chevR" size={16} color="var(--text-4)" />
      </button>
    </div>
  );
}

function MyPageAccountPanel({ account, onOpenNickname, onOpenLogout, onOpenSettings, onDeleteAccount }) {
  return (
    <div className="mypage-panel-grid">
      <ScreenHeader title="계정 관리" lead="프로필, 로그인 상태, 계정 작업을 한곳에서 관리합니다." />

      <section className="mypage-account-section">
        <h2 className="my-section-title">프로필</h2>
        <div className="account-profile-card">
          <div className="my-avatar small">{account.initials}</div>
          <div className="account-profile-info">
            <div className="account-profile-name">{account.nickname}</div>
            <div className="account-profile-provider">{providerLabel(account.provider)} 로그인</div>
          </div>
          <Button variant="tertiary" leftIcon="edit" onClick={onOpenNickname}>닉네임 변경</Button>
        </div>
      </section>

      <section className="mypage-account-section">
        <h2 className="my-section-title">계정 작업</h2>
        <div className="meta-list">
          <button className="meta-row" type="button" onClick={onOpenLogout}>
            <div className="meta-icon"><Icon name="logout" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">로그아웃</div>
              <div className="meta-sub">{providerLabel(account.provider)} 계정에서 로그아웃합니다.</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
          <button className="meta-row" type="button" onClick={onOpenSettings}>
            <div className="meta-icon"><Icon name="settings" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">전체 설정</div>
              <div className="meta-sub">알림, 단위, 테마, 끼니 컬럼을 관리합니다.</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        </div>
      </section>

      <section className="mypage-account-section settings-danger">
        <div className="settings-danger-title">계정 삭제</div>
        <div className="settings-danger-desc">모든 레시피북, 플래너, 장보기 기록이 영구적으로 삭제됩니다.</div>
        <Button variant="danger" leftIcon="trash" onClick={onDeleteAccount}>계정 삭제하기</Button>
      </section>
    </div>
  );
}

function MyPageNotifPanel() {
  const [prefs, setPrefs] = useS2({
    cook: true,
    shopping: true,
    planner: false,
    email: true,
  });
  const toggle = (key) => setPrefs(p => ({ ...p, [key]: !p[key] }));
  return (
    <div className="mypage-panel-grid">
      <ScreenHeader title="알림 설정" lead="요리 시간, 장보기, 주간 리포트 알림을 조정합니다." />
      <section className="settings-section">
        <h2 className="settings-section-title">푸시 알림</h2>
        <div className="settings-card">
          <MyPageNotifRow title="요리 시간 알림" desc="등록한 끼니 30분 전에 알려드려요." on={prefs.cook} onChange={() => toggle("cook")} />
          <MyPageNotifRow title="장보기 리마인드" desc="장보기가 미완료 상태일 때 오전에 알려드려요." on={prefs.shopping} onChange={() => toggle("shopping")} />
          <MyPageNotifRow title="플래너 요약" desc="매주 월요일에 이번 주 식단을 요약해드려요." on={prefs.planner} onChange={() => toggle("planner")} />
        </div>
      </section>
      <section className="settings-section">
        <h2 className="settings-section-title">이메일</h2>
        <div className="settings-card">
          <MyPageNotifRow title="주간 리포트" desc="이번 주 요리 기록과 저장한 레시피를 이메일로 받아요." on={prefs.email} onChange={() => toggle("email")} />
        </div>
      </section>
    </div>
  );
}

function MyPageNotifRow({ title, desc, on, onChange }) {
  return (
    <div className="notif-row">
      <div className="notif-info">
        <div className="notif-title">{title}</div>
        <div className="notif-desc">{desc}</div>
      </div>
      <MyPageSwitch on={on} onChange={onChange} />
    </div>
  );
}

function MyPageSwitch({ on, onChange }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={onChange} role="switch" aria-checked={on}>
      <span className="switch-thumb" />
    </button>
  );
}

function MyPageHelpPanel() {
  const [openId, setOpenId] = useS2(0);
  return (
    <div className="mypage-panel-grid">
      <ScreenHeader title="도움말" lead="자주 묻는 질문과 문의 채널을 확인하세요." />
      <section className="settings-section">
        <h2 className="settings-section-title">자주 묻는 질문</h2>
        <div className="settings-card faq-list">
          {D2.FAQ_ITEMS.map((item, idx) => {
            const open = openId === idx;
            return (
              <div className="faq-item" key={item.q}>
                <button
                  className="faq-question"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-answer-${idx}`}
                  onClick={() => setOpenId(open ? null : idx)}
                >
                  <Icon name="question" size={14} color="var(--text-3)" />
                  {item.q}
                  <Icon className={`faq-chevron ${open ? "open" : ""}`} name="chevR" size={14} color="var(--text-4)" />
                </button>
                {open && (
                  <div className="faq-answer" id={`faq-answer-${idx}`}>{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="settings-section">
        <h2 className="settings-section-title">문의</h2>
        <div className="faq-contact">
          <div className="faq-contact-row">이메일 문의: help@homecook.kr</div>
          <div className="faq-contact-row">카카오톡 채널: @홈쿡</div>
        </div>
      </section>
    </div>
  );
}

function providerLabel(p) {
  if (p === "kakao") return "카카오";
  if (p === "naver") return "네이버";
  if (p === "google") return "구글";
  return p;
}

/* ============================================
   RECIPEBOOKS list (§13a)
   ============================================ */
function RecipebooksScreen({ onBack, onOpenBook, onCreateBook }) {
  const sys = D2.RECIPEBOOKS.filter(b => b.type !== "custom");
  const custom = D2.RECIPEBOOKS.filter(b => b.type === "custom");
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 마이페이지
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">레시피북</span>
      </div>

      <ScreenHeader
        title="레시피북"
        lead="자동 분류된 시스템 북 3개와 커스텀 북을 한곳에서 관리합니다."
        right={<Button variant="primary" leftIcon="plus" onClick={onCreateBook}>새 레시피북</Button>}
      />

      <section className="my-section">
        <h2 className="my-section-title">자동 분류</h2>
        <div className="recipebook-list">
          {sys.map(b => <RecipebookCardH key={b.id} book={b} onClick={() => onOpenBook(b.id)} />)}
        </div>
      </section>

      <section className="my-section">
        <h2 className="my-section-title">커스텀</h2>
        <div className="recipebook-list">
          {custom.map(b => <RecipebookCardH key={b.id} book={b} onClick={() => onOpenBook(b.id)} />)}
        </div>
      </section>
    </main>
  );
}

function recipebookTypeLabel(type) {
  if (type === "my_added") return "내가 추가한";
  if (type === "saved") return "저장됨";
  if (type === "liked") return "좋아요";
  return "커스텀";
}

function RecipebookCardH({ book, onClick }) {
  const thumbs = [...book.thumbs];
  while (thumbs.length < 4) thumbs.push(book.thumbs[thumbs.length % book.thumbs.length] || D2.FOOD.bowl);
  return (
    <button className="recipebook-card-h" onClick={onClick}>
      <div className="recipebook-card-mosaic-sq" aria-hidden="true">
        {thumbs.slice(0, 4).map((t, i) => (
          <div key={i} className="recipebook-mosaic-cell-sq">
            <img src={t} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>
        ))}
      </div>
      <div className="recipebook-card-info">
        <div className="recipebook-card-title">{book.title}</div>
        <div className="recipebook-card-count tabular">{book.count}개 레시피 · {recipebookTypeLabel(book.type)}</div>
        {book.type === "custom" && <span className="recipebook-card-badge">커스텀</span>}
      </div>
      <Icon name="chevR" size={16} color="var(--text-4)" />
    </button>
  );
}

window.HC_S2 = { PlannerWeekScreen, PantryScreen, MyPageScreen, RecipebooksScreen };
