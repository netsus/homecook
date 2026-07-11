import Link from "next/link";
import * as React from "react";

export function WebFooter() {
  return (
    <footer className="web-footer">
      <div className="web-footer-inner">
        <div>
          <strong>집밥 서비스</strong>
          <span>레시피부터 장보기, 요리 기록까지</span>
        </div>
        <nav aria-label="서비스 정보" className="web-footer-links">
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/terms">이용약관</Link>
        </nav>
      </div>
    </footer>
  );
}
