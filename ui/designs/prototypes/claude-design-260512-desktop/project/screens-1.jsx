/* global React */
/* ============================================
   HOME + RECIPE_DETAIL — spec v1.5.2
   ============================================ */
const { useState: useS1, useMemo: useMemo1, useEffect: useEffect1, useRef: useRef1 } = React;
const {
  Icon, Button, Chip, Tag, PhotoCard, Dialog, StatePanel, HomeSkeletonGrid,
  SortDropdown, Stepper, ScreenHeader, ProviderButtonList,
} = window.HC;
const D1 = window.HC_DATA;

/* ============================================
   LOGIN (§auth)
   ============================================ */
function LoginScreen({ onLogin, onGuest }) {
  return (
    <main className="screen login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-brand">
          <span className="dot" />
          HOMECOOK
        </div>
        <div className="login-card-copy">
          <h1 className="login-card-title" id="login-title">집밥 루틴을 이어가려면 로그인하세요</h1>
          <p className="login-card-sub">저장한 레시피, 플래너, 팬트리를 같은 계정으로 관리할 수 있어요.</p>
        </div>
        <ProviderButtonList onSelect={onLogin} />
        <div className="login-divider"><span>또는</span></div>
        <Button variant="ghost" full onClick={onGuest}>로그인 없이 둘러보기</Button>
      </section>
    </main>
  );
}

/* ============================================
   HOME (§1)
   ============================================ */
const THEME_RECIPE_IDS = {
  t1: ["r2", "r3", "r4", "r6"],
  t2: ["r3", "r6", "r7", "r8"],
  t3: ["r5", "r6", "r8"],
  t4: ["r2", "r3", "r6", "r7"],
  t5: ["r2", "r3", "r7"],
  t6: ["r1", "r4", "r8"],
};

function HomeScreen({ savedSet, onSaveToggle, onOpenRecipe, onOpenFilter, savedFilters, stateOverride, onStateOverride, toast }) {
  const [sort, setSort] = useS1("views");
  const [query, setQuery] = useS1("");
  const [searchFocused, setSearchFocused] = useS1(false);
  const [themeId, setThemeId] = useS1(null);
  const selectedTheme = D1.THEMES.find(t => t.id === themeId);

  // Apply ingredient filters
  const filteredRecipes = useMemo1(() => {
    let list = D1.RECIPES;
    if (themeId && THEME_RECIPE_IDS[themeId]) {
      const ids = new Set(THEME_RECIPE_IDS[themeId]);
      list = list.filter(r => ids.has(r.id));
    }
    if (savedFilters && savedFilters.size > 0) {
      list = list.filter(r => {
        const ids = new Set(r.ingredients.map(i => i.id).filter(Boolean));
        return [...savedFilters].every(f => ids.has(f));
      });
    }
    if (query.trim()) {
      const q = query.trim();
      list = list.filter(r => r.title.includes(q));
    }
    const sorted = [...list];
    if (sort === "views") sorted.sort((a,b) => b.views - a.views);
    if (sort === "likes") sorted.sort((a,b) => b.likes - a.likes);
    if (sort === "saves") sorted.sort((a,b) => b.saves - a.saves);
    if (sort === "newest") sorted.sort((a,b) => b.id.localeCompare(a.id));
    return sorted;
  }, [sort, savedFilters, query, themeId]);

  /* loading / empty / error state demo toggle */
  const state = stateOverride || (filteredRecipes.length === 0 ? "empty" : "ok");

  return (
    <main className="screen">
      {/* State demo toggle */}
      <div className="state-toggle">
        <div className="state-toggle-label">화면 상태</div>
        <div className="state-toggle-chips">
          {[
            { v: null, label: "기본" },
            { v: "loading", label: "로딩" },
            { v: "empty", label: "빈 상태" },
            { v: "error", label: "오류" },
          ].map(o => (
            <button
              key={o.label}
              className={`state-toggle-chip ${(stateOverride || "ok") === (o.v || "ok") ? "active" : ""}`}
              onClick={() => onStateOverride(o.v)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {/* Discovery panel */}
      <section className="discovery">
        <h1 className="discovery-title">오늘 뭐 먹지?</h1>
        <p className="discovery-sub">레시피 제목으로 검색하거나, 재료로 좁혀 보세요.</p>

        <div className="discovery-search-row">
          <div className={`search-bar ${searchFocused ? "focused" : ""}`}>
            <Icon name="search" size={18} color="var(--text-3)" />
            <input
              type="text"
              placeholder="레시피 제목 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery("")}>
                <Icon name="x" size={14} color="var(--text-3)" />
              </button>
            )}
          </div>

          <div className="discovery-filter-row">
            <Button variant="secondary" leftIcon="filter" onClick={onOpenFilter}>
              재료로 검색
            </Button>
            {savedFilters && savedFilters.size > 0 && (
              <div className="discovery-filter-tags">
                {[...savedFilters].slice(0, 4).map(fid => (
                  <Chip
                    key={fid}
                    active
                    removable
                    onRemove={() => onSaveToggle?.()}
                  >{D1.ING[fid]?.name || fid}</Chip>
                ))}
                {savedFilters.size > 4 && (
                  <span className="tag">+ {savedFilters.size - 4}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Theme carousel — spec §1: compact horizontal carousel strip, 1.5장 peek */}
      <ThemeCarousel
        selectedThemeId={themeId}
        onPickTheme={(id) => {
          setThemeId(current => current === id ? null : id);
          onStateOverride?.(null);
        }}
      />

      {/* 모든 레시피 */}
      <section className="all-recipes">
        <div className="all-recipes-head">
          <div>
            <h2 className="h2">{selectedTheme ? selectedTheme.title : "모든 레시피"}</h2>
            <div className="text-meta">{filteredRecipes.length}개{selectedTheme ? " · 테마 결과" : ""}</div>
          </div>
          <div className="all-recipes-actions">
            {selectedTheme && (
              <button className="theme-filter-reset" type="button" onClick={() => setThemeId(null)}>
                <Icon name="x" size={13} /> 테마 해제
              </button>
            )}
            <SortDropdown
              value={sort}
              onChange={setSort}
              options={[
                { value: "views",  label: "조회순" },
                { value: "likes",  label: "좋아요순" },
                { value: "saves",  label: "저장순" },
                { value: "newest", label: "최신순" },
              ]}
            />
          </div>
        </div>

        {state === "loading" && <HomeSkeletonGrid rows={2} />}
        {state === "empty" && (
          <StatePanel
            icon="search"
            title="조건에 맞는 레시피가 없어요"
            desc="다른 키워드를 시도하거나 필터를 초기화해 주세요."
            action={<Button variant="secondary" leftIcon="reset" onClick={() => { setQuery(""); onSaveToggle?.("clear-all"); }}>필터 초기화</Button>}
          />
        )}
        {state === "error" && (
          <StatePanel
            icon="alert"
            title="레시피를 불러오지 못했어요"
            desc="네트워크 연결을 확인하고 다시 시도해 주세요."
            action={<Button variant="primary" leftIcon="refresh" onClick={() => onStateOverride(null)}>다시 시도</Button>}
          />
        )}
        {state === "ok" && (
          <div className="home-grid">
            {filteredRecipes.map(r => (
              <PhotoCard
                key={r.id} recipe={r}
                saved={savedSet.has(r.id)}
                onSave={() => onSaveToggle(r.id)}
                onClick={() => onOpenRecipe(r.id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ThemeCarousel({ selectedThemeId, onPickTheme }) {
  const rail = useRef1(null);
  const scroll = (dir) => {
    if (!rail.current) return;
    rail.current.scrollBy({ left: dir * 360, behavior: "smooth" });
  };
  return (
    <section className="theme-strip">
      <div className="theme-strip-head">
        <h2 className="h2">이번 주 인기 테마</h2>
        <div className="theme-strip-controls">
          <button className="rail-nav" onClick={() => scroll(-1)} aria-label="이전">
            <Icon name="chevL" size={16} />
          </button>
          <button className="rail-nav" onClick={() => scroll(1)} aria-label="다음">
            <Icon name="chevR" size={16} />
          </button>
        </div>
      </div>
      <div className="theme-rail" ref={rail}>
        {D1.THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-card ${selectedThemeId === t.id ? "active" : ""}`}
            aria-pressed={selectedThemeId === t.id}
            onClick={() => onPickTheme(t.id)}
          >
            <div className="theme-card-thumb">
              <img src={t.thumb} alt={t.title}
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <div className="theme-card-overlay">
                <div className="theme-card-title">{t.title}</div>
                <div className="theme-card-count">{t.count}개 레시피</div>
              </div>
            </div>
          </button>
        ))}
        <div className="theme-rail-gradient" />
      </div>
    </section>
  );
}

/* ============================================
   RECIPE_DETAIL (§3)
   ============================================ */
function RecipeDetailScreen({ recipeId, onBack, savedSet, onSaveToggle, onOpenLightbox, onOpenPlannerAdd, onOpenSave, onCook, toast, pantryHeld }) {
  const recipe = D1.RECIPE[recipeId];
  const [servings, setServings] = useS1(recipe?.baseServings || 2);
  const [liked, setLiked] = useS1(false);

  if (!recipe) return null;

  /* 인분 조절: 재료량 즉시 변경 */
  const factor = servings / recipe.baseServings;
  const formatAmount = (amt) => {
    if (typeof amt !== "number") return amt;
    const v = amt * factor;
    if (v >= 100) return Math.round(v);
    if (v >= 10) return v.toFixed(1).replace(/\.0$/, "");
    return v.toFixed(2).replace(/\.?0+$/, "");
  };

  const isSaved = savedSet.has(recipe.id);
  const pantryHasMap = recipe.ingredients.map(ing => ({
    ing,
    held: ing.id ? pantryHeld.has(ing.id) : false,
  }));
  const heldCount = pantryHasMap.filter(x => x.held).length;

  /* photos: 메인 + 같은 카테고리 레시피 사진 3개 (mosaic) */
  const photoSet = useMemo1(() => {
    const others = D1.RECIPES.filter(r => r.id !== recipe.id).slice(0, 3);
    return [recipe.photo, ...others.map(o => o.photo)];
  }, [recipe.id]);

  return (
    <main className="screen">
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} />
          탐색
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{recipe.title}</span>
      </div>

      <div className="recipe-layout">
        {/* Left column — photos + body */}
        <div className="recipe-main">

          {/* Photo mosaic */}
          <div className="recipe-photos">
            <button className="recipe-photo-main" onClick={() => onOpenLightbox(photoSet, 0)}>
              <img src={photoSet[0]} alt={recipe.title}
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </button>
            <div className="recipe-photo-side">
              {photoSet.slice(1, 4).map((p, i) => (
                <button key={i} className="recipe-photo-thumb" onClick={() => onOpenLightbox(photoSet, i + 1)}>
                  <img src={p} alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  {i === 2 && (
                    <span className="recipe-photo-more">
                      <Icon name="grid" size={14} />
                      사진 전체
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Title + tags */}
          <div className="recipe-titleblock">
            <h1 className="h1">{recipe.title}</h1>
            <div className="recipe-tag-row">
              {recipe.tags.map(t => <Tag key={t}>{t}</Tag>)}
              <Tag variant="brand">{recipe.source}</Tag>
            </div>
          </div>

          {/* Overview meta */}
          <div className="recipe-meta-row">
            <div className="metric">
              <div className="num tabular">{recipe.baseServings}인분</div>
              <div className="lbl">기본</div>
            </div>
            <div className="metric-divider" />
            <div className="metric">
              <div className="num tabular">{recipe.ingredients.length}</div>
              <div className="lbl">재료</div>
            </div>
            <div className="metric-divider" />
            <div className="metric">
              <div className="num tabular">{recipe.steps.length}</div>
              <div className="lbl">조리 단계</div>
            </div>
            <div className="metric-divider" />
            <div className="metric">
              <div className="num tabular">{recipe.cookTime}분</div>
              <div className="lbl">소요</div>
            </div>
          </div>

          {/* Secondary action row */}
          <div className="recipe-secondary">
            <div className="secondary-meta">
              <Icon name="cal" size={14} color="var(--text-3)" />
              <span className="text-meta">플래너 등록 <strong className="tabular">{recipe.plannerAdds.toLocaleString()}</strong></span>
            </div>
            <div className="secondary-actions">
              <button className="icon-action" onClick={() => toast("링크를 복사했어요")}>
                <Icon name="share" size={16} />
                <span>공유</span>
              </button>
              <button className={`icon-action ${liked ? "on" : ""}`} onClick={() => { setLiked(!liked); toast(liked ? "좋아요를 취소했어요" : "좋아요!"); }}>
                <Icon name={liked ? "heartF" : "heart"} size={16} color={liked ? "var(--like)" : ""} />
                <span className="tabular">{recipe.likes + (liked ? 1 : 0)}</span>
              </button>
              <button className={`icon-action ${isSaved ? "on" : ""}`} onClick={onOpenSave}>
                <Icon name={isSaved ? "bookmarkF" : "bookmark"} size={16} color={isSaved ? "var(--brand)" : ""} />
                <span>{isSaved ? "저장됨" : "저장"}</span>
              </button>
            </div>
          </div>

          {/* Helper copy + description */}
          <p className="reading-lead">{recipe.description}</p>

          {/* Servings stepper */}
          <div className="recipe-servings-block">
            <div className="recipe-servings-label">
              <div className="h3">인분 조절</div>
              <div className="text-meta">아래 재료량이 즉시 바뀝니다</div>
            </div>
            <Stepper value={servings} onChange={setServings} min={1} max={10} unit="인분" />
          </div>

          {/* Ingredients */}
          <section className="reading-section">
            <h2 className="h2">재료</h2>
            <ul className="ing-list">
              {pantryHasMap.map((row, idx) => {
                const i = row.ing;
                const name = i.id ? D1.ING[i.id]?.name : i.name;
                return (
                  <li key={idx} className={`ing-row ${row.held ? "held" : ""}`}>
                    <span className="ing-name">
                      {name}
                      {row.held && (
                        <span className="ing-held-mark">
                          <Icon name="check" size={11} />
                          팬트리
                        </span>
                      )}
                    </span>
                    <span className="ing-amount tabular">
                      {formatAmount(i.amount)}{i.unit ? ` ${i.unit}` : ""}
                      {i.note && <span className="ing-note"> · {i.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="pantry-summary">
              <Icon name="check" size={13} color="var(--brand-deep)" />
              <span><strong className="tabular">{heldCount}</strong>개는 팬트리에 있어요</span>
            </div>
          </section>

          {/* Steps */}
          <section className="reading-section">
            <h2 className="h2">조리 순서</h2>
            <ol className="step-list">
              {recipe.steps.map((s, idx) => (
                <li key={idx} className="step-row">
                  <span className={`step-num cook-${methodColor(s.method)}`}>{idx + 1}</span>
                  <div className="step-body">
                    <div className="step-method-row">
                      <span className={`step-method-pill cook-${methodColor(s.method)}-pill`}>{s.method}</span>
                    </div>
                    <p className="step-text">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right action rail */}
        <aside className="recipe-rail">
          <div className="rail-card">
            <div className="rail-section">
              <div className="rail-title">{servings}인분 기준</div>
              <div className="rail-sub">재료 {recipe.ingredients.length}개 · 단계 {recipe.steps.length}개</div>
            </div>
            <div className="rail-section">
              <Button variant="primary" full leftIcon="cal" onClick={() => onOpenPlannerAdd(recipe.id, servings)}>
                플래너에 추가
              </Button>
              <div style={{ height: 8 }} />
              <Button variant="secondary" full leftIcon="pot" onClick={() => onCook(recipe.id, servings)}>
                요리하기
              </Button>
            </div>
            <div className="rail-section">
              <div className="rail-stat-row">
                <span className="text-meta">좋아요</span>
                <span className="tabular">{(recipe.likes + (liked ? 1 : 0)).toLocaleString()}</span>
              </div>
              <div className="rail-stat-row">
                <span className="text-meta">저장</span>
                <span className="tabular">{recipe.saves.toLocaleString()}</span>
              </div>
              <div className="rail-stat-row">
                <span className="text-meta">플래너 등록</span>
                <span className="tabular">{recipe.plannerAdds.toLocaleString()}</span>
              </div>
            </div>
            <div className="rail-section">
              <div className="rail-help">
                <Icon name="info" size={13} color="var(--text-3)" />
                <span>요리모드 진입 후에는 인분을 바꿀 수 없어요.</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function methodColor(m) {
  if (m.includes("볶")) return "stir";
  if (m.includes("끓")) return "boil";
  if (m.includes("굽")) return "grill";
  if (m.includes("찌")) return "steam";
  if (m.includes("튀")) return "fry";
  if (m.includes("데치")) return "blanch";
  if (m.includes("무치")) return "mix";
  return "prep";
}

window.HC_S1 = { LoginScreen, HomeScreen, RecipeDetailScreen };
