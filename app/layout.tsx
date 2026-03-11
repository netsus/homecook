import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "집밥",
  description: "레시피 탐색부터 요리까지 이어지는 집밥 웹뷰앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
