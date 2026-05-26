import type { ReactNode } from "react";

export const metadata = {
  title: "관리자 | 집밥",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
