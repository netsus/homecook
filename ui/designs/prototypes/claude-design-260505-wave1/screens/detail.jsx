// ===== screens/detail.jsx =====
// Recipe Detail screen
const { useState: useState_RD } = React;

function RecipeDetail({ recipeId, onBack, onOpenPlannerAdd, onOpenSave, saved, onStartCook }) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  const [tab, setTab] = useState_RD('ingredients');
  const [servings, setServings] = useState_RD(recipe.servings);
  const [liked, setLiked] = useState_RD(false);

  const scale = servings / recipe.servings;
  const baseLikes = Math.round(recipe.saves * 0.6);
  const cookCount = Math.round(recipe.saves * 0.3);
  const displayTags = (recipe.tags || []).filter((tag) => !/분$/.test(tag));

  // group ingredients by section
  const grouped = {};
  recipe.ingredients.forEach((i) => {
    if (!grouped[i.section]) grouped[i.section] = [];
    grouped[i.section].push(i);
  });

  return (
    <div style={{ background: '#fff', minHeight: '100%', paddingBottom: 92 }}>
      {/* Hero image */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '4/3',
        background: recipe.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 140
      }}>
        {recipe.emoji}
        <button onClick={onBack} style={{
          position: 'absolute', top: 52, left: 16,
          width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.92)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>{Icon.chevL()}</button>
        <RecipeHeroStats
          likes={baseLikes + (liked ? 1 : 0)}
          saves={recipe.saves}
          cooks={cookCount}
          liked={liked}
          saved={saved}
          onLike={() => setLiked(!liked)}
          onSave={onOpenSave}
          style={{ position: 'absolute', top: 48, right: 14 }}
        />
      </div>

      {/* Title block */}
      <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {[recipe.theme, ...displayTags].filter(Boolean).map((tag, idx) => (
            <span key={`${tag}-${idx}`} style={{
              fontSize: 12, color: idx === 0 ? T.mintDeep : T.text2,
              fontWeight: 800, background: idx === 0 ? T.mintSoft : T.surfaceFill,
              padding: '4px 9px', borderRadius: 9999
            }}>{tag}</span>
          ))}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginBottom: 10 }}>
          {recipe.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.text3, fontSize: 12 }}>
          {Icon.clock()} {recipe.minutes}분
          <span>·</span>
          {Icon.fire()} {recipe.kcal}kcal
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: '#fff',
        display: 'flex', borderBottom: `1px solid ${T.border}`
      }}>
        {[['ingredients', '재료'], ['steps', '조리법'], ['reviews', '리뷰']].map(([k, l]) => {
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '14px 0', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? T.ink : T.text3,
              borderBottom: active ? `2px solid ${T.mint}` : '2px solid transparent'
            }}>{l}</button>);

        })}
      </div>

      {tab === 'ingredients' &&
      <div style={{ background: '#fff', padding: 20 }}>
          {/* Servings stepper */}
          <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: T.surfaceFill, borderRadius: 12, marginBottom: 20
        }}>
            <div>
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 2 }}>몇 인분?</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{servings}인분</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setServings(Math.max(1, servings - 1))} style={{
              width: 32, height: 32, borderRadius: 16, border: `1px solid ${T.border}`,
              background: '#fff', cursor: 'pointer', fontSize: 18, color: T.ink
            }}>−</button>
              <div style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: T.ink }}>{servings}</div>
              <button onClick={() => setServings(servings + 1)} style={{
              width: 32, height: 32, borderRadius: 16, border: 'none',
              background: T.mint, color: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 700
            }}>+</button>
            </div>
          </div>

          {/* vNext S3 — 카테고리 헤더 제거, 정렬 순서만 유지 */}
          {Object.entries(grouped).flatMap(([, items]) => items).map((i, idx, all) =>
          <div key={idx} style={{
            display: 'flex', justifyContent: 'space-between', padding: '12px 0',
            borderBottom: idx < all.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none'
          }}>
              <span style={{ fontSize: 15, color: T.ink, fontWeight: 500 }}>{i.name}</span>
              <span style={{ fontSize: 14, color: T.text2 }}>
                {scaleQty(i.qty, scale)}
              </span>
            </div>
          )}
        </div>
      }

      {tab === 'steps' &&
      <div style={{ padding: 16 }}>
          {recipe.steps.map((s, i) => {
          const c = METHOD_COLORS[s.method];
          return (
            <div key={i} style={{
              background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
              borderLeft: `4px solid ${c.border}`,
              boxShadow: T.shadowNatural
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: c.bg, color: c.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700
                }}>{i + 1}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, flex: 1 }}>{s.title}</div>
                  <span style={{
                  background: c.bg, color: c.text, fontSize: 11, fontWeight: 700,
                  padding: '3px 8px', borderRadius: 4
                }}>{c.label}</span>
                  <span style={{ color: T.text3, fontSize: 12 }}>{s.minutes}분</span>
                </div>
                {/* vNext S3 — 조리법 폰트 키움 14→16 */}
                <div style={{ fontSize: 16, color: T.text2, lineHeight: 1.6, paddingLeft: 36 }}>
                  {s.body}
                </div>
              </div>);

        })}
          <button onClick={onStartCook} style={{
          width: '100%', padding: 14, marginTop: 8, background: T.ink, color: '#fff',
          border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}>👨‍🍳 요리 모드 시작</button>
        </div>
      }

      {tab === 'reviews' &&
      <div style={{ padding: 20, background: '#fff' }}>
          {[
        { u: '미소맘', r: 5, t: '재료도 간단하고 애들이 너무 잘 먹어요!' },
        { u: '홈쿡러', r: 4, t: '국물이 진하고 맛있어요. 다음엔 청양고추 빼고.' },
        { u: '자취3년차', r: 5, t: '진짜 15분 컷. 평일 저녁에 완벽.' }].
        map((rv, i) =>
        <div key={i} style={{ padding: '16px 0', borderBottom: i < 2 ? `1px solid ${T.surfaceSubtle}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
              width: 28, height: 28, borderRadius: 14, background: T.mintSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: T.mintDeep
            }}>{rv.u[0]}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{rv.u}</div>
                {/* vNext S3 — 별점 제거, 리뷰 날짜/좋아요로 대체 */}
                <div style={{ fontSize: 11, color: T.text3 }}>2일 전</div>
              </div>
              <div style={{ fontSize: 14, color: T.text2, lineHeight: 1.5 }}>{rv.t}</div>
            </div>
        )}
        </div>
      }

      {/* vNext S3 — 하단 CTA: 저장 버튼 제거(이미지 옆 북마크로 대체), 2버튼 레이아웃 */}
      <div style={{
        position: 'sticky', bottom: 78, left: 0, right: 0, zIndex: 20,
        background: '#fff', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        borderTop: `0.5px solid ${T.border}`,
        display: 'flex', gap: 8
      }}>
        <Button variant="secondary" size="md" onClick={onOpenPlannerAdd} style={{ flex: 1 }}>
          플래너에 추가
        </Button>
        <Button variant="primary" size="md" onClick={onStartCook} style={{ flex: 1 }}>
          요리하기
        </Button>
      </div>
    </div>);

}

function scaleQty(qty, scale) {
  if (scale === 1) return qty;
  // naive numeric scaling for display
  const m = qty.match(/^([\d./]+)(.*)$/);
  if (!m) return qty;
  const val = eval(m[1]) * scale;
  const suf = m[2];
  const rounded = Math.round(val * 10) / 10;
  return `${rounded}${suf}`;
}

window.RecipeDetail = RecipeDetail;
