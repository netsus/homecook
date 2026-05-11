// ===== app.jsx =====
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#2AC1BC",
  "showBrandFont": true,
  "density": "comfortable"
}/*EDITMODE-END*/;

// Phone-shell only: floating button that calls requestFullscreen() on tap.
// Lets users hide Android Chrome's URL bar and nav bar without an HTTPS PWA install.
function FullscreenToggle() {
  const { useState, useEffect } = React;
  const [isFs, setIsFs] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    setSupported(typeof req === 'function');
    const onChange = () =>
      setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  if (isFs || !supported) return null;
  const enter = () => {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    try { req && req.call(el).catch(() => {}); } catch (e) {}
  };
  return (
    <button onClick={enter} aria-label="전체화면"
      style={{
        position: 'fixed',
        bottom: 'calc(78px + env(safe-area-inset-bottom))',
        right: 12, zIndex: 9999,
        width: 44, height: 44, borderRadius: 22,
        background: 'rgba(33,37,41,0.72)', border: 'none', color: '#fff',
        fontSize: 18, cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
      }}>⛶</button>
  );
}

function App() {
  const { useState, useEffect } = React;
  // persisted route
  const [route, setRoute] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('screen');
      const mobileTabs = ['home', 'planner', 'pantry', 'mypage'];
      if (s && mobileTabs.includes(s)) return { tab: s };
      return JSON.parse(localStorage.getItem('hc_route')) || { tab: 'home' };
    } catch { return { tab: 'home' }; }
  });
  useEffect(() => {localStorage.setItem('hc_route', JSON.stringify(route));}, [route]);

  const [planner, setPlanner] = useState(makeInitialPlanner());
  const [pantry, setPantry] = useState(INITIAL_PANTRY);
  const [savedIds, setSavedIds] = useState(['r1', 'r2', 'r4']);
  const [recipeBooks, setRecipeBooks] = useState(() => window.RECIPEBOOK_SAMPLES || []);
  const [recipeBookSaves, setRecipeBookSaves] = useState(() => {
    const map = {};
    (window.RECIPEBOOK_SAMPLES || []).forEach(book => {
      (book.recipeIds || []).forEach(recipeId => {
        map[recipeId] = Array.from(new Set([...(map[recipeId] || []), book.id]));
      });
    });
    return map;
  });
  const [sortBy, setSortBy] = useState('latest');
  const [ingFilter, setIngFilter] = useState([]);
  // Wave 1.5 — INGREDIENT_FILTER_MODAL 의 fine-grained 재료 이름 목록.
  // 기존 ingFilter(category)와 별개로 운영. 둘 다 적용 시 AND.
  const [ingredientNames, setIngredientNames] = useState([]);
  const [profile, setProfile] = useState({ nickname: '집밥러버', email: 'user@homecook.app', authed: true });
  // Sample shopping lists (one active, one completed) — for SHOPPING_DETAIL & MyPage history
  const [shoppingLists, setShoppingLists] = useState([
    { id: 'sl_1', name: '이번 주 평일 저녁', status: 'active',
      items: [
        { name: '돼지고기', qty: '400g', section: '냉장', fromMeals: ['목 저녁'], have: false, checked: true },
        { name: '양파', qty: '2개', section: '채소', fromMeals: ['목 저녁','금 저녁'], have: false, checked: false },
        { name: '대파', qty: '1대', section: '채소', fromMeals: ['목 저녁'], have: false, checked: false },
        { name: '간장', qty: '3큰술', section: '양념', fromMeals: ['목 저녁'], have: true },
        { name: '다진마늘', qty: '1큰술', section: '양념', fromMeals: ['목 저녁','금 저녁'], have: true },
      ] },
    { id: 'sl_0', name: '지난주 장보기', status: 'completed', completedAt: '2일 전 완료',
      items: [
        { name: '두부', qty: '1모', section: '냉장', fromMeals: ['수 점심'], have: false, checked: true },
        { name: '김치', qty: '300g', section: '냉장', fromMeals: ['수 점심'], have: false, checked: true },
        { name: '간장', qty: '3큰술', section: '양념', fromMeals: ['수 점심'], have: true },
      ] },
  ]);
  const [reflectPicker, setReflectPicker] = useState(null);
  const [pantryAddSheet, setPantryAddSheet] = useState(false);
  const [pantryBundlePicker, setPantryBundlePicker] = useState(false);

  // Modals
  const [plannerAdd, setPlannerAdd] = useState(null); // { recipeId, presetDate?, presetSlot? }
  const [saveModal, setSaveModal] = useState(null);
  const [sortSheet, setSortSheet] = useState(false);
  const [loginGate, setLoginGate] = useState(false);
  const [pantryAddOpen, setPantryAddOpen] = useState(false);
  const [pantryBundleOpen, setPantryBundleOpen] = useState(false);
  const [consumedSheet, setConsumedSheet] = useState(null); // { date, slot, recipe }
  const [mealDeleteConfirm, setMealDeleteConfirm] = useState(null); // { date, slot }
  const [servingChangeConfirm, setServingChangeConfirm] = useState(null); // { date, slot, next }
  // Wave 1.5 — P0 modals
  const [ingredientFilterOpen, setIngredientFilterOpen] = useState(false);
  const [planningServings, setPlanningServings] = useState(null); // { recipeId, presetDate?, presetSlot?, source?, initialServings? }
  // Wave 1.8 — P2 desktop pickers (state-driven, desktop-only consumption)
  const [bookSelectorOpen, setBookSelectorOpen] = useState(false);
  const [bookDetailPicker, setBookDetailPicker] = useState(null); // { bookId }
  const [pantryMatchPickerOpen, setPantryMatchPickerOpen] = useState(false);
  const [consumedDialog, setConsumedDialog] = useState(null); // { recipe, defaultSelection? }
  const [toast, setToast] = useState('');

  // Tweaks
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOn, setTweaksOn] = useState(false);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOn(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOn(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Apply accent color
  useEffect(() => {
    window.T.mint = tweaks.accentColor;
  }, [tweaks.accentColor]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const toggleSaved = (id) => {
    setSavedIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };
  const savedBookIdsFor = (recipeId) => (
    recipeBookSaves[recipeId] || (savedIds.includes(recipeId) ? ['b_saved'] : [])
  );
  const applyRecipeBookSaves = (recipeId, bookIds) => {
    const nextIds = Array.from(new Set(bookIds || []));
    setRecipeBookSaves(prev => ({ ...prev, [recipeId]: nextIds }));
    setSavedIds(prev => {
      const hasSavedBook = nextIds.includes('b_saved');
      if (hasSavedBook && !prev.includes(recipeId)) return [...prev, recipeId];
      if (!hasSavedBook && prev.includes(recipeId)) return prev.filter(id => id !== recipeId);
      return prev;
    });
    showToast(nextIds.length ? `${nextIds.length}개 레시피북에 반영됐어요` : '레시피북 저장을 해제했어요');
  };
  const createRecipeBookForSave = (name) => {
    const id = 'b_new_' + Date.now();
    setRecipeBooks(prev => [...prev, { id, kind: 'custom', name, emoji: '📘', recipeIds: [] }]);
    return id;
  };

  // Routing helpers
  const goTab = (tab) => setRoute({ tab });
  const openRecipe = (id) => setRoute(prev => {
    const detailReturnTo = prev.page
      ? { tab: prev.tab || 'home', page: prev.page, pageArgs: prev.pageArgs || null }
      : null;
    return { tab: prev.tab || 'home', detail: id, page: null, pageArgs: null, detailReturnTo };
  });
  const backFromDetail = () => setRoute(prev => (
    prev.detailReturnTo
      ? { ...prev.detailReturnTo, detail: null, detailReturnTo: null }
      : { ...prev, detail: null, page: null, detailReturnTo: null }
  ));
  const goPage = (page, args = {}) => setRoute(prev => {
    const returnToModal = args.returnToModal || prev.pageArgs?.returnToModal || null;
    const returnToPage = returnToModal || args.returnToPage
      ? args.returnToPage || null
      : prev.page
        ? { page: prev.page, pageArgs: prev.pageArgs || null }
        : null;
    return {
      ...prev,
      detail: null,
      page,
      pageArgs: {
        ...args,
        ...(returnToModal ? { returnToModal } : {}),
        ...(returnToPage ? { returnToPage } : {}),
      },
    };
  });
  const backFromPage = () => setRoute(prev => {
    const args = prev.pageArgs || {};
    if (args.returnToModal?.type === 'meal-add') {
      const { date, slot } = args.returnToModal;
      return {
        tab: 'planner',
        page: null,
        pageArgs: null,
        restoreMealAdd: { date, slot, nonce: Date.now() },
      };
    }
    if (args.returnToPage?.page) {
      return {
        ...prev,
        detail: null,
        page: args.returnToPage.page,
        pageArgs: args.returnToPage.pageArgs || null,
      };
    }
    return { ...prev, detail: null, page: null, pageArgs: null };
  });

  const addPlannerMeal = (date, slot, meal) => {
    setPlanner(p => ({ ...p, [date]: { ...p[date], [slot]: appendMealToSlot(p[date]?.[slot], meal) } }));
  };

  const updatePlannerMeal = (date, slot, mealIndex, updater) => {
    setPlanner(p => ({ ...p, [date]: { ...p[date], [slot]: updateMealInSlot(p[date]?.[slot], mealIndex, updater) } }));
  };

  // Auth gate that captures return-to-action
  const requireAuth = (label, run) => {
    if (profile.authed) { run(); return; }
    goPage('login', { returnTo: { label, run } });
  };
  const completeLogin = (provider, returnTo) => {
    setProfile(p => ({ ...p, authed: true }));
    backFromPage();
    showToast(`${provider} 로그인 완료`);
    if (returnTo?.run) setTimeout(() => returnTo.run(), 60);
  };

  // Shopping-list helpers
  const toggleShoppingItem = (listId, name) => {
    setShoppingLists(ls => ls.map(l => l.id !== listId ? l : ({
      ...l, items: l.items.map(it => it.name === name ? { ...it, checked: !it.checked } : it),
    })));
  };
  const completeShopping = (listOrId) => {
    const incoming = typeof listOrId === 'object' ? listOrId : null;
    const listId = incoming?.id || listOrId;
    const base = incoming || shoppingLists.find(l => l.id === listId);
    if (!base) return;
    const completedList = {
      ...base,
      ...(incoming?.items ? { items: incoming.items } : {}),
      status: 'completed',
      completedAt: '방금 완료'
    };
    setShoppingLists(ls => {
      const exists = ls.some(l => l.id === completedList.id);
      return exists
        ? ls.map(l => l.id !== completedList.id ? l : completedList)
        : [completedList, ...ls];
    });
    setReflectPicker(completedList);
    setRoute(prev => ({ ...prev, detail: null, page: 'shopping-detail', pageArgs: { listId: completedList.id } }));
  };
  const reopenShopping = (listId) => {
    setShoppingLists(ls => ls.map(l => l.id !== listId ? l : ({ ...l, status: 'active', completedAt: null })));
    showToast('장보기를 다시 열었어요');
  };
  const reflectToPantry = (list, names) => {
    if (!names || names.length === 0) {
      setShoppingLists(ls => ls.map(l => l.id !== list.id ? l : ({ ...l, pantryReflect: [] })));
      setReflectPicker(null);
      showToast('팬트리에 반영하지 않았어요');
      return;
    }
    setPantry(p => {
      const next = { ...p };
      names.forEach(name => {
        const key = Object.keys(next).find(k => next[k].name === name) || `new_${name}`;
        const sourceSection = list?.items?.find((item) => item.name === name)?.section;
        const section = PANTRY_CATEGORIES.includes(sourceSection) ? sourceSection : '주식';
        next[key] = { name, have: true, section: next[key]?.section || section };
      });
      return next;
    });
    setShoppingLists(ls => ls.map(l => l.id !== list.id ? l : ({ ...l, pantryReflect: names })));
    setReflectPicker(null);
    showToast(`${names.length}개 재료가 팬트리에 추가됐어요`);
  };

  // Leftovers
  const openLeftoverServings = (date, slot, mealIndex = 0) => {
    const source = mealItems(planner[date]?.[slot])[mealIndex];
    if (!source) return;
    setPlanningServings({
      recipeId: source.recipeId,
      presetDate: date,
      presetSlot: slot,
      source: 'leftover',
      sourceMealIndex: mealIndex,
      initialServings: source.servings || 1,
    });
  };
  const reuseLeftover = (date, slot, mealIndex = 0, servingsOverride) => {
    const currentSource = mealItems(planner[date]?.[slot])[mealIndex];
    if (!currentSource) return;
    const usedServings = servingsOverride || currentSource.servings || 1;
    setPlanner(prev => {
      const source = mealItems(prev[date]?.[slot])[mealIndex];
      if (!source) return prev;
      return {
        ...prev,
        [date]: {
          ...prev[date],
          [slot]: appendMealToSlot(prev[date]?.[slot], {
            recipeId: source.recipeId,
            servings: usedServings,
            status: 'registered'
          })
        }
      };
    });
    showToast(`플래너에 ${usedServings}인분 다시 올렸어요`);
  };
  const markAte = (date, slot, mealIndex = 0) => {
    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, ateAt: 'now' }));
    showToast('다먹음으로 기록');
  };
  const undoAte = (date, slot, mealIndex = 0) => {
    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, ateAt: null }));
    showToast('남은 요리로 되돌렸어요');
  };
  const markPartial = (date, slot) => {
    showToast('남은 요리로 표시했어요');
  };

  // Meal actions (delete + serving change with confirm)
  const removeMeal = (date, slot, mealIndex = 0) => {
    setPlanner(p => ({ ...p, [date]: { ...p[date], [slot]: removeMealFromSlot(p[date]?.[slot], mealIndex) } }));
    showToast('끼니가 삭제됐어요');
    backFromPage();
  };
  const changeServings = (date, slot, next, mealIndex = 0) => {
    const meal = mealItems(planner[date]?.[slot])[mealIndex];
    if (!meal) return;
    if (meal.status !== 'registered') {
      setServingChangeConfirm({ date, slot, next, mealIndex });
      return;
    }
    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, servings: next }));
  };

  // Manual recipe / YT import → planner
  const [extraRecipes, setExtraRecipes] = useState([]);
  const onRecipeCreated = (recipe, presetDate, presetSlot) => {
    setExtraRecipes(rs => [...rs, recipe]);
    if (window.RECIPES && !window.RECIPES.find(r => r.id === recipe.id)) window.RECIPES.push(recipe);
    if (presetDate && presetSlot) {
      addPlannerMeal(presetDate, presetSlot, { recipeId: recipe.id, status: 'registered', servings: recipe.servings || 2 });
      showToast('레시피 등록 + 플래너 추가 완료');
      setRoute({ tab: 'planner', page: null });
    } else {
      showToast('레시피가 등록됐어요');
      setRoute({ tab: 'home', detail: recipe.id, page: null });
    }
  };

  const addPickedPantryItems = (items) => {
    const list = Array.isArray(items) ? items : [items];
    const existingNames = new Set(Object.values(pantry || {}).filter(item => item.have).map(item => item.name));
    const unique = list.filter(item => item?.name && !existingNames.has(item.name));
    if (unique.length === 0) {
      setPantryAddSheet(false);
      showToast('이미 팬트리에 있는 재료예요');
      return;
    }
    setPantry(p => {
      const next = { ...p };
      unique.forEach(item => {
        if (!item?.name) return;
        next[item.name] = { name: item.name, section: item.section, have: true };
      });
      return next;
    });
    setPantryAddSheet(false);
    showToast(`${unique.length}개 재료 추가됨`);
  };
  const addPantryNames = (names, section = '양념') => {
    const list = Array.isArray(names) ? names : [names];
    const existingNames = new Set(Object.values(pantry || {}).filter(item => item.have).map(item => item.name));
    const unique = list.filter(name => name && !existingNames.has(name));
    if (unique.length === 0) {
      setPantryBundlePicker(false);
      showToast('이미 팬트리에 있는 재료예요');
      return;
    }
    setPantry(p => {
      const next = { ...p };
      unique.forEach(name => { next[name] = { name, section, have: true }; });
      return next;
    });
    setPantryBundlePicker(false);
    showToast(unique.length + '개 일괄 추가됨');
  };
  const markCooked = (date, slot, consumed, mealIndex = 0) => {
    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, status: 'cooked' }));
    if (consumed && consumed.length) {
      setPantry(p => {
        const next = { ...p };
        consumed.forEach(name => {
          const key = Object.keys(next).find(k => next[k].name === name);
          if (key) next[key] = { ...next[key], have: false };
        });
        return next;
      });
      showToast(`🎉 요리 완료! ${consumed.length}개 재료 차감`);
    } else {
      showToast('🎉 요리 완료!');
    }
    backFromPage();
  };
  const changeStatus = (date, slot, status, mealIndex = 0) => {
    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, status }));
  };
  const confirmPlanningServings = (servings) => {
    const current = planningServings;
    if (!current) return;
    const { recipeId, presetDate, presetSlot, source, sourceMealIndex } = current;
    if (presetDate && presetSlot) {
      if (source === 'leftover') {
        reuseLeftover(presetDate, presetSlot, sourceMealIndex || 0, servings);
      } else {
        addPlannerMeal(presetDate, presetSlot, { recipeId, status: 'registered', servings });
        showToast(presetDate + ' ' + presetSlot + '에 ' + servings + '인분 추가됐어요');
      }
      setRoute({ tab: 'planner', page: null });
    }
    setPlanningServings(null);
  };

  // Content
  let content;
  const pa = route.pageArgs || {};
  if (route.page === 'login') {
    content = <LoginScreen returnTo={pa.returnTo} onBack={backFromPage} onLogin={completeLogin} />;
  } else if (route.page === 'menu-add') {
    content = <MenuAddScreen presetDate={pa.date} presetSlot={pa.slot} initialMode={pa.mode} planner={planner} pantry={pantry}
      onBack={backFromPage}
      onPickRecipe={(id) => {
        // Wave 1.5: planner slot로 추가하는 흐름은 PlanningServingsModal을 거친다.
        // slot 정보가 없으면 단순 레시피 열기로 폴백.
        if (pa.date && pa.slot) {
          setPlanningServings({ recipeId: id, presetDate: pa.date, presetSlot: pa.slot });
        } else {
          openRecipe(id); backFromPage();
        }
      }}
      onGoManual={(d, s) => goPage('manual-create', { date: d, slot: s })}
      onGoYtImport={(d, s) => goPage('yt-import', { date: d, slot: s })}
      showToast={showToast} />;
  } else if (route.page === 'manual-create') {
    content = <ManualRecipeCreateScreen presetDate={pa.date} presetSlot={pa.slot}
      onBack={backFromPage} onCreated={onRecipeCreated} showToast={showToast} />;
  } else if (route.page === 'yt-import') {
    content = <YtImportScreen presetDate={pa.date} presetSlot={pa.slot}
      onBack={backFromPage} onCreated={onRecipeCreated} showToast={showToast} />;
  } else if (route.page === 'leftovers') {
    content = <LeftoversScreen planner={planner} onBack={backFromPage}
      onReuse={openLeftoverServings} onGoAteList={() => goPage('ate-list')}
      onMarkAte={markAte} onMarkPartial={markPartial} showToast={showToast} />;
  } else if (route.page === 'ate-list') {
    content = <AteListScreen planner={planner} onBack={backFromPage}
      onGoLeftovers={() => goPage('leftovers')}
      onUndoAte={undoAte} onRecreate={(rid) => { backFromPage(); openRecipe(rid); }} />;
  } else if (route.page === 'shopping-detail') {
    const list = shoppingLists.find(l => l.id === pa.listId);
    content = <ShoppingDetailScreen list={list} onBack={backFromPage}
      onToggleItem={(name) => toggleShoppingItem(pa.listId, name)}
      onComplete={completeShopping} onReopen={reopenShopping}
      showToast={showToast} />;
  } else if (route.page === 'settings') {
    content = <SettingsScreen profile={profile} onBack={backFromPage}
      onUpdateProfile={(patch) => setProfile(p => ({ ...p, ...patch }))}
      onLogout={() => { setProfile(p => ({ ...p, authed: false })); backFromPage(); showToast('로그아웃 되었어요'); }}
      onDeleteAccount={() => { backFromPage(); showToast('탈퇴 처리됐어요 (베타)'); }}
      showToast={showToast} />;
  } else if (route.page === 'shopping-create') {
    content = <ShoppingCreateScreen planner={planner} pantry={pantry}
      presetDate={pa.date} presetSlot={pa.slot} presetMealIndex={pa.mealIndex}
      onBack={backFromPage} onComplete={completeShopping} showToast={showToast} />;
  } else if (route.page === 'cook-list') {
    content = <CookListScreen planner={planner} onBack={backFromPage}
      onStartCook={(d, s, mealIndex = 0) => goPage('cook-run', { date: d, slot: s, mealIndex })}
      onOpenMeal={(d, s) => goPage('meal-detail', { date: d, slot: s })} />;
  } else if (route.page === 'cook-run') {
    content = <CookRunScreen date={pa.date} slot={pa.slot} mealIndex={pa.mealIndex || 0} recipeId={pa.recipeId} planner={planner}
      onBack={backFromPage} onComplete={markCooked} showToast={showToast} />;
  } else if (route.page === 'meal-detail') {
    content = <MealDetailScreen date={pa.date} slot={pa.slot} planner={planner}
      onBack={backFromPage} onOpenRecipe={openRecipe}
      onStartCook={(d, s, mealIndex = 0) => goPage('cook-run', { date: d, slot: s, mealIndex })}
      onCreateShopping={(d, s, mealIndex = 0) => goPage('shopping-create', { date: d, slot: s, mealIndex })}
      onChangeStatus={changeStatus} onRemove={removeMeal} onChangeServings={changeServings} />;
  } else if (route.page === 'mypage-saved') {
    content = <MyPageSavedScreen savedIds={savedIds} onBack={backFromPage}
      onOpenRecipe={openRecipe} toggleSaved={toggleSaved} />;
  } else if (route.page === 'mypage-account') {
    content = <MyPageAccountScreen profile={profile} onBack={backFromPage}
      onUpdateProfile={(patch) => setProfile(p => ({ ...p, ...patch }))}
      onLogout={() => { setProfile(p => ({ ...p, authed: false })); backFromPage(); showToast('로그아웃 되었어요'); }}
      onDeleteAccount={() => { backFromPage(); showToast('탈퇴 처리됐어요 (베타)'); }}
      showToast={showToast} />;
  } else if (route.page === 'mypage-notif') {
    content = <MyPageNotifScreen onBack={backFromPage} />;
  } else if (route.page === 'mypage-help') {
    content = <MyPageHelpScreen onBack={backFromPage} />;
  } else if (route.page === 'mypage-recipebook') {
    content = (
      <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
        <AppBar title="레시피북" left={<button onClick={backFromPage} style={{ background:'transparent', border:'none', cursor:'pointer' }}>{Icon.chevL()}</button>} />
        <MyPageRecipebookTab
          onOpenBook={(bookId) => goPage('mypage-recipebook-detail', { bookId })}
          onCreateBook={() => showToast('레시피북 만들기 (Wave 다음)')}
          onDeleteBook={(id) => showToast('레시피북이 삭제됐어요')}
          showToast={showToast} />
      </div>
    );
  } else if (route.page === 'mypage-recipebook-detail') {
    content = <MyPageRecipebookDetailScreen
      bookId={pa.bookId}
      onBack={backFromPage}
      onOpenRecipe={openRecipe}
      onRemoveRecipe={(bookId, recipeId) => showToast('레시피북에서 제거됐어요')}
      onDeleteBook={(book) => { backFromPage(); showToast(book.name + ' 삭제됐어요'); }}
      showToast={showToast} />;
  } else if (route.page === 'mypage-shopping') {
    content = (
      <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
        <AppBar title="장보기 기록" left={<button onClick={backFromPage} style={{ background:'transparent', border:'none', cursor:'pointer' }}>{Icon.chevL()}</button>} />
        <MyPageShoppingTab
          shoppingLists={shoppingLists}
          onOpen={(id) => goPage('shopping-detail', { listId: id })} />
      </div>
    );
  } else if (route.detail) {
    content =
    <RecipeDetail
      recipeId={route.detail}
      onBack={backFromDetail}
      onOpenPlannerAdd={() => setPlannerAdd({ recipeId: route.detail })}
      onOpenSave={() => setSaveModal({ recipeId: route.detail })}
      saved={savedIds.includes(route.detail)}
      onStartCook={() => goPage('cook-run', { recipeId: route.detail })} />;



  } else if (route.tab === 'home') {
    content =
    <HomeScreen
      onOpenRecipe={openRecipe}
      onOpenSave={(recipeId) => setSaveModal({ recipeId })}
      savedIds={savedIds}
      sortBy={sortBy} setSortBy={setSortBy}
      ingFilter={ingFilter} setIngFilter={setIngFilter}
      onOpenIngredientFilter={() => setIngredientFilterOpen(true)}
      ingredientNames={ingredientNames}
      onGoPlanner={() => setRoute({ tab: 'planner', page: null })} />;


  } else if (route.tab === 'planner') {
    content =
    <PlannerScreen
      planner={planner} setPlanner={setPlanner}
      pantry={pantry}
      onOpenRecipe={openRecipe}
      onOpenMeal={(d, s) => goPage('meal-detail', { date: d, slot: s })}
      onCreateShopping={() => goPage('shopping-create')}
      onCookList={() => goPage('cook-list')}
      onMenuAdd={(date, slot, mode) => goPage('menu-add', date && slot ? { date, slot, mode, returnToModal: { type: 'meal-add', date, slot } } : { mode })}
      onGoManual={(date, slot) => goPage('manual-create', { date, slot, returnToModal: { type: 'meal-add', date, slot } })}
      onGoYtImport={(date, slot) => goPage('yt-import', { date, slot, returnToModal: { type: 'meal-add', date, slot } })}
      onGoLeftovers={(date, slot) => goPage('leftovers', { date, slot, returnToModal: { type: 'meal-add', date, slot } })}
      onPickRecipeFromMealAdd={(date, slot, recipeId) => setPlanningServings({ recipeId, presetDate: date, presetSlot: slot })}
      showToast={showToast}
      initialMealAdd={route.restoreMealAdd}
      onOpenPlannerAdd={(date, slot) => setPlannerAdd({ recipeId: 'r1', presetDate: date, presetSlot: slot })} />;


  } else if (route.tab === 'pantry') {
    content = <PantryScreen pantry={pantry} setPantry={setPantry}
      onOpenAdd={() => setPantryAddSheet(true)}
      onOpenBundle={() => setPantryBundlePicker(true)} />;
  } else if (route.tab === 'mypage') {
    content = <MyPageScreen savedIds={savedIds} onOpenRecipe={openRecipe} onGoPage={goPage}
      shoppingLists={shoppingLists} profile={profile} />;
  }

  const fontBase = tweaks.density === 'compact' ? 13 : 14;

  // Shell mode: 'webview' | 'web-mobile' | 'desktop' | 'phone'
  // 'phone' is a fullscreen-on-real-phone shell, opt-in via ?phone=1 or ?screen=<tab>.
  const [shell, setShell] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('phone') === '1' || params.has('screen')) return 'phone';
      return localStorage.getItem('hc_shell') || 'webview';
    } catch (e) { return 'webview'; }
  });
  useEffect(() => {
    if (shell === 'phone') return; // don't persist URL-driven phone mode
    try { localStorage.setItem('hc_shell', shell); } catch (e) {}
  }, [shell]);

  // Desktop content
  let desktopContent;
  if (route.detail) {
    desktopContent = (
      <DesktopRecipeDetail
        recipeId={route.detail}
        onBack={backFromDetail}
        onOpenPlannerAdd={() => setPlannerAdd({ recipeId: route.detail })}
        onOpenSave={() => setSaveModal({ recipeId: route.detail })}
        saved={savedIds.includes(route.detail)}
        onStartCook={() => goPage('cook-run', { recipeId: route.detail })}
      />
    );
  } else if (route.tab === 'home') {
    desktopContent = (
      <DesktopHome
        onOpenRecipe={openRecipe}
        onOpenSave={(recipeId) => setSaveModal({ recipeId })}
        savedIds={savedIds}
        sortBy={sortBy} setSortBy={setSortBy}
        ingFilter={ingFilter} setIngFilter={setIngFilter}
        onOpenIngredientFilter={() => setIngredientFilterOpen(true)}
        ingredientNames={ingredientNames}
        onGoPlanner={() => setRoute({ tab: 'planner', page: null })}
      />
    );
  } else if (route.tab === 'planner') {
    desktopContent = (
      <DesktopPlanner
        planner={planner}
        onOpenRecipe={openRecipe}
        onCreateShopping={() => goPage('shopping-create')}
        onCookList={() => goPage('cook-list')}
        onOpenMeal={(date, slot) => goPage('meal-detail', { date, slot })}
        onMenuAdd={(date, slot, mode) => goPage('menu-add', date && slot ? { date, slot, mode, returnToModal: { type: 'meal-add', date, slot } } : { mode })}
        onGoManual={(date, slot) => goPage('manual-create', { date, slot, returnToModal: { type: 'meal-add', date, slot } })}
        onGoYtImport={(date, slot) => goPage('yt-import', { date, slot, returnToModal: { type: 'meal-add', date, slot } })}
        onGoLeftovers={(date, slot) => goPage('leftovers', { date, slot, returnToModal: { type: 'meal-add', date, slot } })}
        pantry={pantry}
        onPickRecipeFromMealAdd={(date, slot, recipeId) => setPlanningServings({ recipeId, presetDate: date, presetSlot: slot })}
        showToast={showToast}
        initialMealAdd={route.restoreMealAdd}
        onOpenPlannerAdd={(date, slot) => setPlannerAdd({ recipeId: 'r1', presetDate: date, presetSlot: slot })}
      />
    );
  } else if (route.tab === 'pantry') {
    desktopContent = <DesktopPantry pantry={pantry} setPantry={setPantry}
      onOpenAdd={() => setPantryAddSheet(true)}
      onOpenBundle={() => setPantryBundlePicker(true)} />;
  } else if (route.tab === 'mypage') {
    desktopContent = <DesktopMyPage savedIds={savedIds} onOpenRecipe={openRecipe} onGoPage={goPage} />;
  }

  // Wave 1.5 — desktop variants for selected route.page values (P0 + P1.1)
  let desktopPageContent = null;
  if (route.page === 'menu-add') {
    desktopPageContent = <DesktopMenuAddScreen
      presetDate={pa.date} presetSlot={pa.slot} initialMode={pa.mode} planner={planner} pantry={pantry}
      onBack={backFromPage}
      onPickRecipe={(id) => {
        if (pa.date && pa.slot) setPlanningServings({ recipeId: id, presetDate: pa.date, presetSlot: pa.slot });
        else { openRecipe(id); backFromPage(); }
      }}
      onGoManual={(d, s) => goPage('manual-create', { date: d, slot: s })}
      onGoYtImport={(d, s) => goPage('yt-import', { date: d, slot: s })}
      showToast={showToast} />;
  } else if (route.page === 'shopping-create') {
    desktopPageContent = <DesktopShoppingCreateScreen
      planner={planner} pantry={pantry}
      presetDate={pa.date} presetSlot={pa.slot} presetMealIndex={pa.mealIndex}
      onBack={backFromPage} onComplete={completeShopping} showToast={showToast} />;
  } else if (route.page === 'shopping-detail') {
    const list = shoppingLists.find(l => l.id === pa.listId);
    desktopPageContent = <DesktopShoppingDetailScreen
      list={list} onBack={backFromPage}
      onToggleItem={(name) => toggleShoppingItem(pa.listId, name)}
      onComplete={completeShopping} onReopen={reopenShopping}
      showToast={showToast} />;
  } else if (route.page === 'cook-run') {
    desktopPageContent = <DesktopCookRunScreen
      date={pa.date} slot={pa.slot} mealIndex={pa.mealIndex || 0} recipeId={pa.recipeId} planner={planner}
      onBack={backFromPage} onComplete={markCooked} showToast={showToast} />;
  } else if (route.page === 'mypage-recipebook-detail') {
    desktopPageContent = <DesktopMyPageRecipebookDetail
      bookId={pa.bookId} onBack={backFromPage}
      onOpenRecipe={openRecipe}
      onRemoveRecipe={(bookId, recipeId) => showToast('레시피북에서 제거됐어요')}
      onDeleteBook={(book) => { backFromPage(); showToast(book.name + ' 삭제됐어요'); }}
      showToast={showToast} />;
  } else if (route.page === 'login') {
    // Wave 1.6 — desktop variant
    desktopPageContent = <DesktopLoginScreen returnTo={pa.returnTo} onBack={backFromPage} onLogin={completeLogin} />;
  } else if (route.page === 'settings') {
    desktopPageContent = <DesktopSettingsScreen profile={profile} onBack={backFromPage}
      onUpdateProfile={(patch) => setProfile(p => ({ ...p, ...patch }))}
      onLogout={() => { setProfile(p => ({ ...p, authed: false })); backFromPage(); showToast('로그아웃 되었어요'); }}
      onDeleteAccount={() => { backFromPage(); showToast('탈퇴 처리됐어요 (베타)'); }}
      showToast={showToast} />;
  } else if (route.page === 'meal-detail') {
    desktopPageContent = <DesktopMealDetailScreen date={pa.date} slot={pa.slot} planner={planner}
      onBack={backFromPage} onOpenRecipe={openRecipe}
      onStartCook={(d, s, mealIndex = 0) => goPage('cook-run', { date: d, slot: s, mealIndex })}
      onCreateShopping={(d, s, mealIndex = 0) => goPage('shopping-create', { date: d, slot: s, mealIndex })}
      onChangeStatus={changeStatus} onRemove={removeMeal} onChangeServings={changeServings} />;
  } else if (route.page === 'cook-list') {
    desktopPageContent = <DesktopCookListScreen planner={planner} onBack={backFromPage}
      onStartCook={(d, s, mealIndex = 0) => goPage('cook-run', { date: d, slot: s, mealIndex })}
      onOpenMeal={(d, s) => goPage('meal-detail', { date: d, slot: s })} />;
  } else if (route.page === 'leftovers') {
    // Wave 1.7 — P1.3 desktop variants
    desktopPageContent = <DesktopLeftoversScreen planner={planner} onBack={backFromPage}
      onReuse={openLeftoverServings} onGoAteList={() => goPage('ate-list')}
      onMarkAte={markAte} onMarkPartial={markPartial} showToast={showToast} />;
  } else if (route.page === 'ate-list') {
    desktopPageContent = <DesktopAteListScreen planner={planner} onBack={backFromPage}
      onGoLeftovers={() => goPage('leftovers')}
      onUndoAte={undoAte} onRecreate={(rid) => { backFromPage(); openRecipe(rid); }} />;
  } else if (route.page === 'manual-create') {
    desktopPageContent = <DesktopManualRecipeCreateScreen presetDate={pa.date} presetSlot={pa.slot}
      onBack={backFromPage} onCreated={onRecipeCreated} showToast={showToast} />;
  } else if (route.page === 'yt-import') {
    desktopPageContent = <DesktopYtImportScreen presetDate={pa.date} presetSlot={pa.slot}
      onBack={backFromPage} onCreated={onRecipeCreated} showToast={showToast} />;
  } else if (route.page === 'mypage-recipebook') {
    desktopPageContent = <DesktopMyPageRecipebookList onBack={backFromPage}
      onOpenBook={(bookId) => goPage('mypage-recipebook-detail', { bookId })}
      onCreateBook={() => showToast('레시피북 만들기 (Wave 다음)')}
      onDeleteBook={(id) => showToast('레시피북이 삭제됐어요')}
      showToast={showToast} />;
  } else if (route.page === 'mypage-shopping') {
    desktopPageContent = <DesktopMyPageShoppingList shoppingLists={shoppingLists}
      onBack={backFromPage}
      onOpen={(id) => goPage('shopping-detail', { listId: id })} />;
  }

  // ============ Top shell switcher ============
  const ShellSwitcher = () => (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9000, background: '#212529', borderRadius: 9999,
      padding: 4, display: 'flex', gap: 2,
      boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
    }}>
      {[
        ['webview', '📱 웹뷰 (앱 내장)'],
        ['web-mobile', '📲 모바일 웹'],
        ['desktop', '🖥 데스크톱 웹'],
      ].map(([k, l]) => (
        <button key={k} onClick={() => setShell(k)} style={{
          padding: '8px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer',
          background: shell === k ? '#fff' : 'transparent',
          color: shell === k ? '#212529' : 'rgba(255,255,255,0.85)',
          fontSize: 12, fontWeight: 700, fontFamily: T.fontUI,
          transition: 'all 0.15s',
        }}>{l}</button>
      ))}
    </div>
  );

  // ============ DESKTOP shell ============
  if (shell === 'desktop') {
    return (
      <div style={{ minHeight: '100vh' }}>
        <ShellSwitcher />
        <div style={{ paddingTop: 56 }}>
          <DesktopShell tab={route.tab} onTab={goTab} showLogin={() => setLoginGate(true)}>
            {route.page ? (
              desktopPageContent ? desktopPageContent : (
                /* Mobile-fallback for route.page values that don't yet have a desktop variant.
                   See HANDOFF.md 부록 C.2 for the list of fallback pages. */
                <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  {content}
                </div>
              )
            ) : desktopContent}
          </DesktopShell>
        </div>
        {plannerAdd && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500,
          }}>
            <div style={{ width: 420, maxHeight: '90vh', overflow: 'auto', borderRadius: 16, background: '#fff' }}>
              <PlannerAddPopup
                recipeId={plannerAdd.recipeId}
                planner={planner}
                onClose={() => setPlannerAdd(null)}
                onConfirm={(date, slot, qty) => {
                  addPlannerMeal(date, slot, { recipeId: plannerAdd.recipeId, status: 'registered', servings: qty });
                  setPlannerAdd(null);
                  showToast(date + ' ' + slot + '에 추가됐어요');
                }}
              />
            </div>
          </div>
        )}
        {saveModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500,
          }}>
            <div style={{ width: 420, borderRadius: 16, background: '#fff' }}>
              <SavePopup
                recipeId={saveModal.recipeId}
                saved={savedIds.includes(saveModal.recipeId)}
                savedBookIds={savedBookIdsFor(saveModal.recipeId)}
                books={recipeBooks}
                onCreateBook={createRecipeBookForSave}
                onClose={() => setSaveModal(null)}
                onConfirm={(bookIds) => {
                  applyRecipeBookSaves(saveModal.recipeId, bookIds);
                  setSaveModal(null);
                }}
              />
            </div>
          </div>
        )}
        {sortSheet && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500,
          }}>
            <div style={{ width: 360, borderRadius: 16, background: '#fff' }}>
              <SortSheet value={sortBy} onChange={setSortBy} onClose={() => setSortSheet(false)} />
            </div>
          </div>
        )}
        {loginGate && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500,
          }}>
            <div style={{ width: 420, borderRadius: 16, background: '#fff' }}>
              <LoginGate onClose={() => setLoginGate(false)} onLogin={() => { setLoginGate(false); showToast('로그인됨'); }} />
            </div>
          </div>
        )}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            background: '#212529', color: '#fff', padding: '12px 20px',
            borderRadius: 8, fontSize: 14, fontWeight: 600, zIndex: 9600,
          }}>{toast}</div>
        )}
        {/* Wave 1.8 — desktop dialog variants (replaces mobile sheets in desktop shell) */}
        {pantryAddSheet && (
          <DesktopPantryAddDialog
            pantry={pantry}
            onClose={() => setPantryAddSheet(false)}
            onAddItem={addPickedPantryItems}
            onOpenBundle={() => { setPantryAddSheet(false); setPantryBundlePicker(true); }}
          />
        )}
        {pantryBundlePicker && (
          <DesktopPantryBundleDialog
            onClose={() => setPantryBundlePicker(false)}
            onConfirm={(items) => addPantryNames(items)}
          />
        )}
        {reflectPicker && (
          <DesktopPantryReflectDialog list={reflectPicker} onClose={() => setReflectPicker(null)}
            onConfirm={(names) => reflectToPantry(reflectPicker, names)} />
        )}
        {bookSelectorOpen && (
          <DesktopRecipeBookSelectorDialog
            onClose={() => setBookSelectorOpen(false)}
            onPick={(bookId) => { setBookSelectorOpen(false); setBookDetailPicker({ bookId }); }} />
        )}
        {bookDetailPicker && (
          <DesktopRecipeBookDetailPickerDialog bookId={bookDetailPicker.bookId}
            onClose={() => setBookDetailPicker(null)}
            onPick={(rid) => { setBookDetailPicker(null); openRecipe(rid); }} />
        )}
        {pantryMatchPickerOpen && (
          <DesktopPantryMatchPickerDialog pantry={pantry}
            onClose={() => setPantryMatchPickerOpen(false)}
            onPick={(rid) => { setPantryMatchPickerOpen(false); openRecipe(rid); }} />
        )}
        {consumedDialog && (
          <DesktopConsumedIngredientDialog recipe={consumedDialog.recipe}
            defaultSelection={consumedDialog.defaultSelection}
            onClose={() => setConsumedDialog(null)}
            onConfirm={(names) => { setConsumedDialog(null); showToast(names.length + '개 재료 차감됐어요'); }} />
        )}
        {/* Wave 1.5 — P0 modals (desktop shell) */}
        {ingredientFilterOpen && (
          <DesktopIngredientFilterDialog value={ingredientNames}
            onApply={(names) => { setIngredientNames(names); setIngredientFilterOpen(false); }}
            onClose={() => setIngredientFilterOpen(false)} />
        )}
        {planningServings && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9550 }}>
            <PlanningServingsModal
              recipe={RECIPES.find(r => r.id === planningServings.recipeId)}
              presetDate={planningServings.presetDate}
              presetSlot={planningServings.presetSlot}
              initialServings={planningServings.initialServings}
              onClose={() => setPlanningServings(null)}
              onConfirm={confirmPlanningServings} />
          </div>
        )}
        {servingChangeConfirm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9550 }}>
            <ConfirmDialog
              title="인분을 변경할까요?"
              body="이 식사는 장보기/요리 흐름에 들어가 있어요. 인분을 바꾸면 장보기 수량과 차감 분량이 함께 갱신돼요."
              confirmLabel="변경하기"
              onClose={() => setServingChangeConfirm(null)}
              onConfirm={() => {
                const { date, slot, next, mealIndex } = servingChangeConfirm;
                updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, servings: next }));
                setServingChangeConfirm(null);
                showToast('인분이 변경됐어요');
              }} />
          </div>
        )}
        {tweaksOn && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} />}
      </div>
    );
  }

  // ============ PHONE shell (real-phone fullscreen, opt-in via ?phone=1 / ?screen=) ============
  if (shell === 'phone') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#fff', overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
      }}>
        <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{content}</div>
          {/* vNext S3 — BottomTab을 detail에서도 유지 */}
          <BottomTab tab={route.tab} onTab={goTab} />
          {plannerAdd && (
            <PlannerAddPopup
              recipeId={plannerAdd.recipeId} planner={planner}
              onClose={() => setPlannerAdd(null)}
              onConfirm={(date, slot, qty) => {
                addPlannerMeal(date, slot, { recipeId: plannerAdd.recipeId, status: 'registered', servings: qty });
                setPlannerAdd(null);
                showToast(date + ' ' + slot + '에 추가됐어요');
              }}
            />
          )}
          {saveModal && (
            <SavePopup recipeId={saveModal.recipeId} saved={savedIds.includes(saveModal.recipeId)}
              savedBookIds={savedBookIdsFor(saveModal.recipeId)}
              books={recipeBooks}
              onCreateBook={createRecipeBookForSave}
              onClose={() => setSaveModal(null)}
              onConfirm={(bookIds) => { applyRecipeBookSaves(saveModal.recipeId, bookIds); setSaveModal(null); }} />
          )}
          {sortSheet && <SortSheet value={sortBy} onChange={setSortBy} onClose={() => setSortSheet(false)} />}
          {loginGate && <LoginGate onClose={() => setLoginGate(false)} onLogin={() => { setLoginGate(false); showToast('로그인됨'); }} />}
          {pantryAddSheet && (
            <PantryAddSheet
              pantry={pantry}
              onClose={() => setPantryAddSheet(false)}
              onAddItem={addPickedPantryItems}
              onOpenBundle={() => { setPantryAddSheet(false); setPantryBundlePicker(true); }}
            />
          )}
          {pantryBundlePicker && (
            <PantryBundlePicker
              onClose={() => setPantryBundlePicker(false)}
              onConfirm={(items) => addPantryNames(items)}
            />
          )}
          {reflectPicker && (
            <PantryReflectPicker list={reflectPicker} onClose={() => setReflectPicker(null)}
              onConfirm={(names) => reflectToPantry(reflectPicker, names)} />
          )}
          {ingredientFilterOpen && (
            <IngredientFilterModal value={ingredientNames}
              onApply={(names) => { setIngredientNames(names); setIngredientFilterOpen(false); }}
              onClose={() => setIngredientFilterOpen(false)} />
          )}
          {planningServings && (
            <PlanningServingsModal
              recipe={RECIPES.find(r => r.id === planningServings.recipeId)}
              presetDate={planningServings.presetDate}
              presetSlot={planningServings.presetSlot}
              initialServings={planningServings.initialServings}
              onClose={() => setPlanningServings(null)}
              onConfirm={confirmPlanningServings} />
          )}
          {servingChangeConfirm && (
            <ConfirmDialog
              title="인분을 변경할까요?"
              body="이 식사는 장보기/요리 흐름에 들어가 있어요. 인분을 바꾸면 장보기 수량과 차감 분량이 함께 갱신돼요."
              confirmLabel="변경하기"
              onClose={() => setServingChangeConfirm(null)}
              onConfirm={() => {
                const { date, slot, next, mealIndex } = servingChangeConfirm;
                updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, servings: next }));
                setServingChangeConfirm(null);
                showToast('인분이 변경됐어요');
              }} />
          )}
          <Toast message={toast} />
          <FullscreenToggle />
        </div>
      </div>
    );
  }

  // ============ MOBILE rendering ============
  const isWeb = shell === 'web-mobile';
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: '80px 12px 40px', gap: 40,
      flexWrap: 'wrap', overflowX: 'hidden',
      background: '#E9ECEF',
    }}>
      <ShellSwitcher />
      <div style={{ position: 'relative' }}>
        {isWeb ? (
          <div style={{
            width: 'min(402px, calc(100vw - 24px))', background: '#fff', borderRadius: 24, overflow: 'hidden',
            boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
          }}>
            <div style={{
              height: 44, background: '#F1F3F5', borderBottom: '1px solid #DEE2E6',
              display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#FF5F57' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#FEBC2E' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, background: '#28C840' }} />
              <div style={{
                flex: 1, height: 26, background: '#fff', borderRadius: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#868E96', fontWeight: 500, marginLeft: 8,
              }}>🔒 homecook.app</div>
            </div>
            <div style={{ height: 830, position: 'relative', overflow: 'hidden', background: '#fff' }}>
              <div style={{ height: '100%', overflowY: 'auto' }}>{content}</div>
              {/* vNext S3 — BottomTab을 detail에서도 유지 */}
              <BottomTab tab={route.tab} onTab={goTab} />
              {plannerAdd && (
                <PlannerAddPopup
                  recipeId={plannerAdd.recipeId} planner={planner}
                  onClose={() => setPlannerAdd(null)}
                  onConfirm={(date, slot, qty) => {
                    addPlannerMeal(date, slot, { recipeId: plannerAdd.recipeId, status: 'registered', servings: qty });
                    setPlannerAdd(null);
                    showToast(date + ' ' + slot + '에 추가됐어요');
                  }}
                />
              )}
              {saveModal && (
                <SavePopup recipeId={saveModal.recipeId} saved={savedIds.includes(saveModal.recipeId)}
                  savedBookIds={savedBookIdsFor(saveModal.recipeId)}
                  books={recipeBooks}
                  onCreateBook={createRecipeBookForSave}
                  onClose={() => setSaveModal(null)}
                  onConfirm={(bookIds) => { applyRecipeBookSaves(saveModal.recipeId, bookIds); setSaveModal(null); }} />
              )}
              {sortSheet && <SortSheet value={sortBy} onChange={setSortBy} onClose={() => setSortSheet(false)} />}
              {loginGate && <LoginGate onClose={() => setLoginGate(false)} onLogin={() => { setLoginGate(false); showToast('로그인됨'); }} />}
              {pantryAddSheet && (
                <PantryAddSheet
                  pantry={pantry}
                  onClose={() => setPantryAddSheet(false)}
                  onAddItem={addPickedPantryItems}
                  onOpenBundle={() => { setPantryAddSheet(false); setPantryBundlePicker(true); }}
                />
              )}
              {pantryBundlePicker && (
                <PantryBundlePicker
                  onClose={() => setPantryBundlePicker(false)}
                  onConfirm={(items) => addPantryNames(items)}
                />
              )}
              {reflectPicker && (
                <PantryReflectPicker list={reflectPicker} onClose={() => setReflectPicker(null)}
                  onConfirm={(names) => reflectToPantry(reflectPicker, names)} />
              )}
              {/* Wave 1.5 — P0 modals (web-mobile shell) */}
              {ingredientFilterOpen && (
                <IngredientFilterModal value={ingredientNames}
                  onApply={(names) => { setIngredientNames(names); setIngredientFilterOpen(false); }}
                  onClose={() => setIngredientFilterOpen(false)} />
              )}
              {planningServings && (
                <PlanningServingsModal
                  recipe={RECIPES.find(r => r.id === planningServings.recipeId)}
                  presetDate={planningServings.presetDate}
                  presetSlot={planningServings.presetSlot}
                  initialServings={planningServings.initialServings}
                  onClose={() => setPlanningServings(null)}
                  onConfirm={confirmPlanningServings} />
              )}
              {servingChangeConfirm && (
                <ConfirmDialog
                  title="인분을 변경할까요?"
                  body="이 식사는 장보기/요리 흐름에 들어가 있어요. 인분을 바꾸면 장보기 수량과 차감 분량이 함께 갱신돼요."
                  confirmLabel="변경하기"
                  onClose={() => setServingChangeConfirm(null)}
                  onConfirm={() => {
                    const { date, slot, next, mealIndex } = servingChangeConfirm;
                    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, servings: next }));
                    setServingChangeConfirm(null);
                    showToast('인분이 변경됐어요');
                  }} />
              )}
              <Toast message={toast} />
            </div>
          </div>
        ) : (
          <IOSDevice>
            <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#fff' }}>
              <div style={{ height: '100%', overflowY: 'auto' }}>{content}</div>
              {/* vNext S3 — BottomTab을 detail에서도 유지 */}
              <BottomTab tab={route.tab} onTab={goTab} />
              {plannerAdd && (
                <PlannerAddPopup
                  recipeId={plannerAdd.recipeId} planner={planner}
                  onClose={() => setPlannerAdd(null)}
                  onConfirm={(date, slot, qty) => {
                    addPlannerMeal(date, slot, { recipeId: plannerAdd.recipeId, status: 'registered', servings: qty });
                    setPlannerAdd(null);
                    showToast(date + ' ' + slot + '에 추가됐어요');
                  }}
                />
              )}
              {saveModal && (
                <SavePopup recipeId={saveModal.recipeId} saved={savedIds.includes(saveModal.recipeId)}
                  savedBookIds={savedBookIdsFor(saveModal.recipeId)}
                  books={recipeBooks}
                  onCreateBook={createRecipeBookForSave}
                  onClose={() => setSaveModal(null)}
                  onConfirm={(bookIds) => { applyRecipeBookSaves(saveModal.recipeId, bookIds); setSaveModal(null); }} />
              )}
              {sortSheet && <SortSheet value={sortBy} onChange={setSortBy} onClose={() => setSortSheet(false)} />}
              {loginGate && <LoginGate onClose={() => setLoginGate(false)} onLogin={() => { setLoginGate(false); showToast('로그인됨'); }} />}
              {pantryAddSheet && (
                <PantryAddSheet
                  pantry={pantry}
                  onClose={() => setPantryAddSheet(false)}
                  onAddItem={addPickedPantryItems}
                  onOpenBundle={() => { setPantryAddSheet(false); setPantryBundlePicker(true); }}
                />
              )}
              {pantryBundlePicker && (
                <PantryBundlePicker
                  onClose={() => setPantryBundlePicker(false)}
                  onConfirm={(items) => addPantryNames(items)}
                />
              )}
              {reflectPicker && (
                <PantryReflectPicker list={reflectPicker} onClose={() => setReflectPicker(null)}
                  onConfirm={(names) => reflectToPantry(reflectPicker, names)} />
              )}
              {/* Wave 1.5 — P0 modals (webview shell) */}
              {ingredientFilterOpen && (
                <IngredientFilterModal value={ingredientNames}
                  onApply={(names) => { setIngredientNames(names); setIngredientFilterOpen(false); }}
                  onClose={() => setIngredientFilterOpen(false)} />
              )}
              {planningServings && (
                <PlanningServingsModal
                  recipe={RECIPES.find(r => r.id === planningServings.recipeId)}
                  presetDate={planningServings.presetDate}
                  presetSlot={planningServings.presetSlot}
                  initialServings={planningServings.initialServings}
                  onClose={() => setPlanningServings(null)}
                  onConfirm={confirmPlanningServings} />
              )}
              {servingChangeConfirm && (
                <ConfirmDialog
                  title="인분을 변경할까요?"
                  body="이 식사는 장보기/요리 흐름에 들어가 있어요. 인분을 바꾸면 장보기 수량과 차감 분량이 함께 갱신돼요."
                  confirmLabel="변경하기"
                  onClose={() => setServingChangeConfirm(null)}
                  onConfirm={() => {
                    const { date, slot, next, mealIndex } = servingChangeConfirm;
                    updatePlannerMeal(date, slot, mealIndex, m => ({ ...m, servings: next }));
                    setServingChangeConfirm(null);
                    showToast('인분이 변경됐어요');
                  }} />
              )}
              <Toast message={toast} />
            </div>
          </IOSDevice>
        )}
        <div style={{
          position: 'absolute', bottom: -30, left: 0, right: 0, textAlign: 'center',
          fontSize: 12, color: '#868E96',
        }}>
          {shell === 'webview' ? '웹뷰 (앱 내장) · 네이티브 헤더 가정' : '모바일 웹 · 브라우저 chrome 포함'}
          {' · '}
          {route.detail ? RECIPES.find(r => r.id === route.detail).name : { home: '홈', planner: '플래너', pantry: '팬트리', mypage: '마이페이지' }[route.tab]}
        </div>
      </div>

      <div style={{
        background: '#fff', borderRadius: 14, padding: 20, width: 260,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)', alignSelf: 'flex-start', marginTop: 20,
      }}>
        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          HOMECOOK_ PROTOTYPE
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#212529', marginBottom: 4, fontFamily: '"Jua", sans-serif', letterSpacing: 0.4 }}>
          배민 스타일 리디자인
        </div>
        <div style={{ fontSize: 12, color: '#868E96', lineHeight: 1.5, marginBottom: 16 }}>
          상단 토글로 웹뷰 / 모바일 웹 / 데스크톱 비교
        </div>
        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginBottom: 8 }}>화면 이동</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {[
            ['home', '🏠 홈', '테마/검색/필터/정렬'],
            ['planner', '📅 플래너', '주간 식단 카드'],
            ['pantry', '🧊 팬트리', '재료 보유 체크'],
            ['mypage', '👤 마이', '프로필/저장 레시피'],
          ].map(([k, l, d]) => (
            <button key={k} onClick={() => setRoute({ tab: k })} style={{
              textAlign: 'left', padding: '10px 12px',
              background: route.tab === k && !route.detail ? '#E6F8F7' : '#F8F9FA',
              border: route.tab === k && !route.detail ? '1px solid #2AC1BC' : '1px solid transparent',
              borderRadius: 8, cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>{l}</div>
              <div style={{ fontSize: 11, color: '#868E96', marginTop: 1 }}>{d}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginBottom: 8 }}>빠른 플로우</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => { setRoute({ tab: 'home', detail: 'r4' }); }}
            style={quickBtn}>🥩 제육볶음 레시피 보기</button>
          <button onClick={() => { setRoute({ tab: 'home', detail: 'r4' }); setTimeout(() => setPlannerAdd({ recipeId: 'r4' }), 300); }}
            style={quickBtn}>📥 플래너 추가 시트</button>
          <button onClick={() => { setRoute({ tab: 'home', detail: 'r4' }); setTimeout(() => setSaveModal({ recipeId: 'r4' }), 300); }}
            style={quickBtn}>🔖 저장 시트</button>
          <button onClick={() => { setRoute({ tab: 'home' }); setTimeout(() => setSortSheet(true), 200); }}
            style={quickBtn}>⇅ 정렬 시트</button>
          <button onClick={() => setLoginGate(true)}
            style={quickBtn}>🔒 로그인 게이트</button>
        </div>

        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Wave 1 바로가기</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => goPage('menu-add')}
            style={quickBtn}>🍳 식사 추가 (MENU_ADD)</button>
          <button onClick={() => {
            const id = shoppingLists[0]?.id;
            if (id) goPage('shopping-detail', { listId: id });
          }} style={quickBtn}>🛒 장보기 상세 (SHOPPING_DETAIL)</button>
          <button onClick={() => goPage('leftovers')}
            style={quickBtn}>🍱 남은 재료 (LEFTOVERS)</button>
          <button onClick={() => goPage('settings')}
            style={quickBtn}>⚙️ 설정 (SETTINGS)</button>
          <button onClick={() => goPage('mypage-recipebook')}
            style={quickBtn}>📖 레시피북 탭 (MYPAGE)</button>
          <button onClick={() => goPage('mypage-shopping')}
            style={quickBtn}>🧾 장보기 목록 탭 (MYPAGE)</button>
          <button onClick={() => goPage('mypage-recipebook-detail', { bookId: 'b_custom1' })}
            style={quickBtn}>📒 레시피북 상세 (DETAIL)</button>
          <button onClick={() => { setRoute({ tab: 'home' }); setTimeout(() => setIngredientFilterOpen(true), 200); }}
            style={quickBtn}>🔎 재료 필터 모달 (INGREDIENT_FILTER)</button>
        </div>

        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Wave 1.6 데스크톱</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => goPage('login')}
            style={quickBtn}>🔐 로그인 화면 (LOGIN page)</button>
          <button onClick={() => goPage('cook-list')}
            style={quickBtn}>🥘 요리 준비 리스트 (COOK_READY_LIST)</button>
          <button onClick={() => {
            const k = Object.keys(planner)[1];
            const slot = ['아침','점심','저녁'].find(s => planner[k]?.[s]) || '저녁';
            goPage('meal-detail', { date: k, slot });
          }} style={quickBtn}>🍽️ 끼니 상세 (MEAL_SCREEN)</button>
        </div>

        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Wave 1.7 데스크톱 (P1.3)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => goPage('leftovers')}
            style={quickBtn}>🥡 남은 요리 (LEFTOVERS)</button>
          <button onClick={() => goPage('ate-list')}
            style={quickBtn}>🍽️ 다먹은 요리 (ATE_LIST)</button>
          <button onClick={() => goPage('manual-create')}
            style={quickBtn}>✏️ 직접 등록 (MANUAL_CREATE)</button>
          <button onClick={() => goPage('yt-import')}
            style={quickBtn}>📺 유튜브 가져오기 (YT_IMPORT)</button>
          <button onClick={() => goPage('mypage-recipebook')}
            style={quickBtn}>📚 레시피북 목록 (MYPAGE_RECIPEBOOK)</button>
          <button onClick={() => goPage('mypage-shopping')}
            style={quickBtn}>🧾 장보기 기록 목록 (MYPAGE_SHOPPING)</button>
        </div>

        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Wave 1.8 데스크톱 (P2)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => setPantryAddSheet(true)}
            style={quickBtn}>➕ 재료 추가 dialog (PantryAdd)</button>
          <button onClick={() => setPantryBundlePicker(true)}
            style={quickBtn}>📦 재료 묶음 dialog (PantryBundle)</button>
          <button onClick={() => setReflectPicker(shoppingLists[1] || shoppingLists[0])}
            style={quickBtn}>🔄 팬트리 반영 dialog (PantryReflect)</button>
          <button onClick={() => setBookSelectorOpen(true)}
            style={quickBtn}>📕 레시피북 선택 dialog (BookSelector)</button>
          <button onClick={() => setPantryMatchPickerOpen(true)}
            style={quickBtn}>🧊 팬트리 매칭 dialog (PantryMatch)</button>
          <button onClick={() => setConsumedDialog({ recipe: RECIPES[0] })}
            style={quickBtn}>✓ 차감 재료 dialog (Consumed)</button>
        </div>
      </div>

      {tweaksOn && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} />}
    </div>
  );
}

// ============ Tweaks panel (extracted) ============
function TweaksPanel({ tweaks, setTweaks }) {
  return (
    <div className="tweaks-panel">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#212529' }}>Tweaks</div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#495057', fontWeight: 600, marginBottom: 6 }}>포인트 컬러</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            ['#2AC1BC', '민트'],
            ['#12B886', '틸'],
            ['#FF6B6B', '토마토'],
            ['#FFB347', '오렌지'],
            ['#343A40', '먹색'],
          ].map(([c, n]) => (
            <button key={c} onClick={() => {
              setTweaks(t => ({ ...t, accentColor: c }));
              window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { accentColor: c } }, '*');
            }} style={{
              width: 32, height: 32, borderRadius: 16, background: c,
              border: tweaks.accentColor === c ? '2px solid #212529' : '2px solid transparent',
              cursor: 'pointer',
            }} title={n} />
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#495057', fontWeight: 600 }}>
          <input type="checkbox" checked={tweaks.showBrandFont}
            onChange={e => {
              setTweaks(t => ({ ...t, showBrandFont: e.target.checked }));
              window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { showBrandFont: e.target.checked } }, '*');
            }} />
          브랜드 폰트 (Jua)
        </label>
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#495057', fontWeight: 600, marginBottom: 6 }}>밀도</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['compact', 'comfortable'].map(d => (
            <button key={d} onClick={() => {
              setTweaks(t => ({ ...t, density: d }));
              window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { density: d } }, '*');
            }} style={{
              flex: 1, padding: '6px 10px', fontSize: 11, borderRadius: 6,
              background: tweaks.density === d ? '#212529' : '#F8F9FA',
              color: tweaks.density === d ? '#fff' : '#495057',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const quickBtn = {
  textAlign: 'left', padding: '8px 10px', fontSize: 12,
  background: '#fff', border: '1px solid #DEE2E6', borderRadius: 6,
  cursor: 'pointer', color: '#495057'
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
