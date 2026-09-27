import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { MealRecipeSnapshotScreen } from "@/components/planner/meal-recipe-snapshot-screen";

export const metadata: Metadata = { title: "계획에 저장된 레시피", robots: { index: false, follow: false } };

export default async function MealRecipeSnapshotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell currentTab="planner" headerMode="hidden"><MealRecipeSnapshotScreen mealId={id} /></AppShell>;
}
