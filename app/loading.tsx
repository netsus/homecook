import { ContentState } from "@/components/shared/content-state";

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto flex min-h-[50dvh] max-w-xl items-center justify-center px-4 py-12" role="status">
      <ContentState showEyebrow={false} title="불러오는 중이에요" titleLevel={1} tone="loading" />
    </main>
  );
}
