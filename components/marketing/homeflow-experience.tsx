"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { HOMEFLOW_INGREDIENTS, HOMEFLOW_RECIPE, HOMEFLOW_DEMO_NUTRITION, type HomeflowDemoState } from "@/lib/marketing/homeflow-content";
import styles from "./homeflow-experience.module.css";
type Props = {
    step: 1 | 2 | 3 | 4 | 5 | 6;
    demo: HomeflowDemoState;
    onDemoChange: (state: HomeflowDemoState) => void;
    onNext: () => void;
    onBack: () => void;
    busy?: boolean;
};
const HEADINGS = ["유튜브에서 레시피를 가져왔어요", "요리계획", "장보기 목록", "요리계획", "김치볶음밥", "이번주 식단"];
const ACTIONS = ["요리 계획에 추가하기", "장보기 목록 만들기", "체크하고 장보기 완료하기", "김치볶음밥 요리하기", "요리완료! 식단기록하기", "무료 베타 초대받기"];
type EntryPhase = "waiting" | "entering" | "complete";
const RECORD_ENTRY_MS = 1400;
const COOKING_STEPS = ["삼겹살·대파 볶기", "김치와 양념 넣기", "즉석밥 넣고 볶기", "버터로 마무리", "계란후라이 올리기"];
function WeekStrip() {
    return <div className={styles.week} aria-label="예시 주간 9월 7일부터 13일까지, 선택된 날짜 12일">
    {["월", "화", "수", "목", "금", "토", "일"].map((day, index) => <span key={day} className={index === 5 ? styles.today : undefined}><small>{day}</small><strong>{index + 7}</strong></span>)}
  </div>;
}
function FoodImage({ tofu = false }: {
    tofu?: boolean;
}) {
    return <Image className={styles.foodImage} src={tofu ? "/assets/ingredients/plush-v2/tofu.webp" : HOMEFLOW_RECIPE.thumbnail} width={64} height={64} alt={tofu ? "두부" : "김치볶음밥"}/>;
}
function ChevronLeft() {
    return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>;
}
function CalendarIcon() {
    return <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01" /></svg>;
}
function IngredientImage({ item }: { item: (typeof HOMEFLOW_INGREDIENTS)[number] }) {
    return <Image className={styles.ingredientImage} src={item.imageSrc} width={34} height={34} alt="" />;
}
function PantryToast() {
    const [visible, setVisible] = useState(true);
    useEffect(() => { const timer = window.setTimeout(() => setVisible(false), 2400); return () => window.clearTimeout(timer); }, []);
    return visible ? <div className={styles.pantryToast} role="status">✓ 구매한 재료를 팬트리에 추가했어요</div> : null;
}
function EntryMealRow({ meal, name, image, detail, extra, selected = false, animate = false, recording = false, onPhaseChange }: {
    meal: string; name: string; image: string; detail?: string; extra: React.ReactNode;
    selected?: boolean; animate?: boolean; recording?: boolean; onPhaseChange?: (phase: EntryPhase) => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const [phase, setPhase] = useState<EntryPhase>(animate ? "waiting" : "complete");
    useEffect(() => {
        if (!animate || !loaded) return;
        const begin = window.setTimeout(() => setPhase("entering"), 450);
        const finish = window.setTimeout(() => setPhase("complete"), 450 + (recording ? RECORD_ENTRY_MS : 900));
        return () => { window.clearTimeout(begin); window.clearTimeout(finish); };
    }, [animate, loaded, recording]);
    useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);
    return <div className={`${styles.mealRow} ${animate ? styles.enteringMeal : ""} ${recording ? styles.recordedMeal : ""} ${selected ? styles.cookingReadyMeal : ""}`} data-entry-phase={phase}>
        <span className={styles.mealLabel}>{meal}</span>
        {animate && <span className={styles.entryPlaceholder} aria-hidden="true">{recording ? "식단에 기록하고 있어요" : "요리계획에 추가하고 있어요"}</span>}
        <Image className={styles.foodImage} src={image} width={58} height={58} alt={name} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
        <div className={styles.mealDescription}><strong>{name}</strong>{detail && <small>{detail}</small>}{selected && <small className={styles.selectedMenu}><span className={styles.readyPlay} aria-hidden="true">▶</span>지금 요리할 메뉴</small>}</div>
        {extra}
    </div>;
}
function MealNutrition({ recorded, phase }: { recorded: boolean; phase: EntryPhase }) {
    const [progress, setProgress] = useState(0);
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!media) return;
        const update = () => setReducedMotion(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        if (!recorded || phase !== "entering" || reducedMotion) return;
        const start = performance.now();
        let frame: number;
        const tick = (now: number) => {
            const elapsed = Math.min(1, (now - start) / RECORD_ENTRY_MS);
            setProgress(1 - (1 - elapsed) ** 2);
            if (elapsed < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [recorded, phase, reducedMotion]);
    const fraction = !recorded ? 0 : reducedMotion || phase === "complete" ? 1 : phase === "waiting" ? 0 : progress;
    return <div className={styles.nutrition} data-counting={recorded && phase === "entering" && !reducedMotion}>
        {([["칼로리", "kcal", "calories"], ["탄수화물", "g", "carbs"], ["단백질", "g", "protein"], ["지방", "g", "fat"]] as const).map(([label, unit, key]) => {
            const final = (recorded ? HOMEFLOW_DEMO_NUTRITION.total : HOMEFLOW_DEMO_NUTRITION.baseline)[key];
            const value = Math.round(HOMEFLOW_DEMO_NUTRITION.baseline[key] + HOMEFLOW_DEMO_NUTRITION.dinner[key] * fraction);
            return <div key={key}><small>{label}</small><strong aria-label={`${label} ${final.toLocaleString("en-US")} ${unit}`}><span aria-hidden="true"><b>{value.toLocaleString("en-US")}</b> {unit}</span></strong></div>;
        })}
    </div>;
}
function Planner({ ready, onAdd }: { ready: boolean; onAdd: (meal: string) => React.ReactNode }) {
    return <><WeekStrip />{[false, true].map(tofu => <section key={String(tofu)} className={`${styles.dayCard} ${styles.planCard} ${ready && !tofu ? styles.selectedPlan : ""}`}>
        <h2>{tofu ? "일요일 · 9/13" : "토요일 · 9/12"}</h2>
        {["아침", "점심"].map(meal => <div key={meal} className={`${styles.mealRow} ${styles.emptyPlanRow}`}><span className={styles.mealLabel}>{meal}</span><span className={styles.mealPlaceholder} />{onAdd(`${tofu ? "일요일" : "토요일"} ${meal}`)}</div>)}
        <EntryMealRow meal="저녁" name={tofu ? "두부조림" : "김치볶음밥"} image={tofu ? "/assets/ingredients/plush-v2/tofu.webp" : HOMEFLOW_RECIPE.thumbnail} detail={tofu ? "장보기 완료" : undefined} selected={ready && !tofu} animate={!ready && !tofu} extra={onAdd(`${tofu ? "일요일" : "토요일"} 저녁`)} />
    </section>)}</>;
}
export function HomeflowExperience({ step, demo, onDemoChange, onNext, onBack, busy = false }: Props) {
    const [recordPhase, setRecordPhase] = useState<EntryPhase>("waiting");
    const [showEgg, setShowEgg] = useState(false);
    const [addition, setAddition] = useState<string | null>(null);
    const purchases = HOMEFLOW_INGREDIENTS.filter(item => !demo.excluded.includes(item.id));
    const excluded = HOMEFLOW_INGREDIENTS.filter(item => demo.excluded.includes(item.id));
    const selected = purchases.filter(item => demo.purchased.includes(item.id));
    const readOnly = busy || demo.shoppingCompleted;
    const updatePurchase = (id: string, checked: boolean) => {
        if (readOnly || demo.excluded.includes(id))
            return;
        onDemoChange({ ...demo, purchased: checked ? [...new Set([...demo.purchased, id])] : demo.purchased.filter(value => value !== id) });
    };
    const updateExclusion = (id: string, exclude: boolean) => {
        if (readOnly)
            return;
        onDemoChange({ ...demo, excluded: exclude ? [...new Set([...demo.excluded, id])] : demo.excluded.filter(value => value !== id), purchased: demo.purchased.filter(value => value !== id) });
    };
    const advance = () => {
        if (busy || (step === 3 && selected.length === 0))
            return;
        if (step === 3 && !demo.shoppingCompleted)
            onDemoChange({ ...demo, purchased: selected.map(item => item.id), shoppingCompleted: true });
        if (step === 5 && !demo.recorded)
            onDemoChange({ ...demo, recorded: true });
        onNext();
    };
    const addButton = (meal: string) => <button type="button" className={styles.addButton} aria-label={`${meal} ${step === 2 || step === 4 ? "요리" : "식사"} 추가`} onClick={() => setAddition(meal)}>+</button>;
    return <section className={`${styles.experience} ${step === 6 ? styles.mealPage : ""}`} aria-label="무먹 집밥흐름 체험">
    <header className={styles.header}>
      <button type="button" className={styles.back} aria-label="이전 화면" onClick={onBack} disabled={busy}><ChevronLeft /></button>
      {step <= 5 ? <><div className={styles.progress} role="progressbar" aria-label="체험 진행" aria-valuenow={step} aria-valuemin={1} aria-valuemax={5}>{[1, 2, 3, 4, 5].map(value => <i key={value} className={value <= step ? styles.filled : undefined}/>)}</div><span className={styles.counter}><b>{step}</b> / 5</span></> : <h1 className={styles.mealHeading}><CalendarIcon /> {HEADINGS[5]}</h1>}
    </header>
    {step <= 4 && <h1 className={step === 3 ? styles.visuallyHidden : step === 2 || step === 4 ? `${styles.mealHeading} ${styles.planHeading}` : styles.heading}>{(step === 2 || step === 4) && <CalendarIcon />}{HEADINGS[step - 1]}</h1>}
    {step === 4 && <PantryToast />}
    {step === 5 && <div className={styles.cookingHeader}><FoodImage /><h1>{HEADINGS[4]}</h1></div>}
    <div className={styles.content}>
      {step === 1 && <>
        <div className={styles.recipeCard}>
          <a href={HOMEFLOW_RECIPE.url} target="_blank" rel="noopener noreferrer" className={styles.videoLink} aria-label={`${HOMEFLOW_RECIPE.title} 유튜브 원본 영상 새 창으로 보기`}><Image src={HOMEFLOW_RECIPE.thumbnail} width={140} height={96} alt={HOMEFLOW_RECIPE.title}/><span aria-hidden="true">▶</span></a>
          <div className={styles.recipeDetails}><strong>김치볶음밥</strong><a className={styles.channel} href={HOMEFLOW_RECIPE.channelUrl} target="_blank" rel="noopener noreferrer"><Image src={HOMEFLOW_RECIPE.profile} width={24} height={24} alt=""/>{HOMEFLOW_RECIPE.channel}</a><a className={styles.sourceLink} href={HOMEFLOW_RECIPE.url} target="_blank" rel="noopener noreferrer">{HOMEFLOW_RECIPE.title} ↗</a></div>
        </div>
        <ul className={styles.ingredientList} aria-label="레시피 재료">{HOMEFLOW_INGREDIENTS.slice(0, showEgg ? 9 : 5).map(item => <li key={item.id}><IngredientImage item={item} /><span>{item.name}</span><strong>{item.amount}</strong></li>)}</ul>
        <button type="button" className={styles.more} aria-expanded={showEgg} onClick={() => setShowEgg(!showEgg)}>{showEgg ? "재료 접기" : "외 4가지 재료"}<span aria-hidden="true">{showEgg ? "⌃" : "›"}</span></button>
      </>}
      {(step === 2 || step === 4) && <Planner ready={step === 4} onAdd={addButton} />}
      {step === 3 && <>
        <section className={styles.shoppingCard} aria-label="살 재료"><h2><span aria-hidden="true">🛒</span> 살 재료 <b>{purchases.length}</b></h2><ul>{purchases.map(item => <li key={item.id} className={styles.purchaseRow}><label><input type="checkbox" aria-label={`${item.shoppingName} 구매`} checked={demo.purchased.includes(item.id)} disabled={readOnly} onChange={event => updatePurchase(item.id, event.target.checked)}/><IngredientImage item={item} /><span>{item.shoppingName}{item.id === "egg" && <small>후라이용</small>}</span><strong>{item.amount}</strong></label><button type="button" className={styles.excludeControl} aria-label={`${item.shoppingName} 집에 있어요`} onClick={() => updateExclusion(item.id, true)} disabled={readOnly}>이미있음</button></li>)}</ul></section>
        <section className={`${styles.shoppingCard} ${styles.excluded}`} aria-label="팬트리 제외 재료"><h2><span aria-hidden="true">🏠</span> 팬트리 제외 <b>{excluded.length}</b></h2><ul>{excluded.map(item => <li key={item.id} className={styles.excludedRow}><IngredientImage item={item} /><span>{item.shoppingName}</span><strong>{item.amount}</strong><button type="button" aria-label={`${item.shoppingName} 구매 목록으로 이동`} onClick={() => updateExclusion(item.id, false)} disabled={readOnly}>{readOnly ? "제외" : "되살리기"}</button></li>)}</ul></section>
      </>}
      {step === 5 && <>
        <section className={styles.cookingCard}><h2>재료</h2><dl className={styles.cookingIngredients}>{HOMEFLOW_INGREDIENTS.map(item => <div key={item.id}><dt>{item.name}</dt><dd>{item.amount}</dd></div>)}</dl></section>
        <section className={styles.cookingCard}><div className={styles.cookingTitle}><h2>조리법</h2><small>구성 예시</small></div><ol className={styles.cookingSteps}>{COOKING_STEPS.map((instruction, index) => <li key={instruction}><span aria-hidden="true">{index + 1}</span>{instruction}</li>)}</ol></section>
      </>}
      {step === 6 && <>
        <WeekStrip />
        <section className={styles.dayCard}><div className={styles.dayTitle}><h2>오늘 · 9/12 (토)</h2><span>{demo.recorded ? "3 / 3" : "2 / 3"}</span></div>
          <MealNutrition recorded={demo.recorded} phase={recordPhase} />
          <details className={styles.nutritionNotice}><summary>{HOMEFLOW_DEMO_NUTRITION.note}</summary><p>{HOMEFLOW_DEMO_NUTRITION.detail}</p></details>
          {[{ meal: "아침", name: "그릭요거트 볼", image: "/assets/funnel/food/greek-yogurt-bowl.webp", amount: "250g · 420 kcal" }, { meal: "점심", name: "닭가슴살 현미밥", image: "/assets/funnel/food/chicken-brown-rice-bowl.webp", amount: "400g · 700 kcal" }, ...(demo.recorded ? [{ meal: "저녁", name: "김치볶음밥", image: HOMEFLOW_RECIPE.thumbnail, amount: `300g · ${HOMEFLOW_DEMO_NUTRITION.dinner.calories} kcal` }] : [])].map(item => <EntryMealRow key={item.meal} meal={item.meal} name={item.name} image={item.image} detail={item.amount} animate={item.meal === "저녁"} recording={item.meal === "저녁"} onPhaseChange={item.meal === "저녁" ? setRecordPhase : undefined} extra={addButton(item.meal)} />)}
        </section>
        <section className={styles.dayCard}><div className={styles.dayTitle}><h2>내일 · 9/13 (일)</h2><span>0 / 3</span></div><button type="button" className={styles.emptyMeal} onClick={() => setAddition("내일")}>+ 식사 추가</button></section>
      </>}
    </div>
    <footer className={styles.footer}><button type="button" className={`${styles.primary} ${step === 4 ? styles.cookingReadyButton : ""}`} disabled={busy || (step === 3 && selected.length === 0)} onClick={advance}>{busy ? "처리 중이에요" : demo.shoppingCompleted && step === 3 ? "팬트리 확인하기" : ACTIONS[step - 1]}{step !== 5 && <span aria-hidden="true"> →</span>}</button></footer>
    {addition && <div className={styles.additionPanel} role="dialog" aria-modal="false" aria-labelledby="homeflow-addition-title"><h2 id="homeflow-addition-title">{addition}에 추가하기</h2><p>원하는 요리를 같은 자리에 추가할 수 있어요. 이번 체험은 준비된 김치볶음밥으로 이어져요.</p><button type="button" className={styles.primary} onClick={() => setAddition(null)}>체험 계속하기</button></div>}
  </section>;
}
