import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI 영양 추정값 안내",
  description: "무먹의 AI 영양 추정값 산출 기준과 표시 방법을 안내합니다.",
  alternates: { canonical: "/about/ai-nutrition" },
};

export default function AiNutritionAboutPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-12 text-sm leading-7">
      <Link href="/about" className="text-muted-foreground underline">무먹 가이드</Link>
      <h1 className="text-2xl font-semibold">AI 영양 추정값 안내</h1>
      <p>영양자료를 연결하지 못한 재료는 이름과 식품 설명을 바탕으로 AI가 영양성분을 추정할 수 있습니다. 이 값은 식품을 직접 분석한 결과가 아니며, 실제 재료나 제품과 차이가 날 수 있습니다.</p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">어떻게 계산하나요?</h2>
        <p>먹을 수 있는 부분 100g을 기준으로 추정합니다. 생것·말린 것·조리한 것 등의 상태를 구분하고, 판단하기 어려운 성분은 빈값으로 남깁니다. 빈값을 0으로 계산하지 않습니다.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">어디에 표시되나요?</h2>
        <p>추정값이 계산에 사용되면 레시피, 요리계획과 식사 기록에 ‘AI 추정값 포함’이 표시됩니다. 일부 성분이 없으면 ‘일부 영양정보가 빠진 추정값’으로 안내합니다.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">더 나은 자료가 생기면요?</h2>
        <p>공식 영양자료나 실제 제품의 영양표를 연결하면 해당 자료를 우선 사용합니다. 이미 저장된 식사 기록은 당시의 계산 근거를 유지합니다.</p>
        <p>이 페이지는 추정 방식에 대한 설명이며, 개별 식품의 영양성분을 입증하는 자료는 아닙니다.</p>
      </section>
    </main>
  );
}
