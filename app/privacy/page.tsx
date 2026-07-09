import React from "react";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata = {
  alternates: {
    canonical: "/privacy",
  },
  description: "집밥 서비스 개인정보 수집, 이용, 보관, 파기 기준",
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  const legal = getLegalInfo();

  return (
    <LegalDocumentPage
      activeId="privacy"
      description="집밥은 서비스 제공에 필요한 정보만 처리하며, 확정되지 않은 운영 정보는 출시 전 사람 검토로 닫아야 합니다."
      eyebrow="Privacy"
      meta={[
        { label: "운영자", value: legal.operatorName },
        { label: "문의", value: legal.contactEmail },
        { label: "시행일", value: legal.effectiveDate },
      ]}
      title="개인정보처리방침"
    >
      <section>
        <h2>수집하는 개인정보</h2>
        <p>
          회원 가입과 로그인 과정에서 소셜 로그인 식별자, 이메일, 닉네임,
          프로필 이미지가 처리될 수 있습니다. 서비스 이용 중에는 레시피북,
          식단, 장보기, 팬트리, 요리 기록처럼 사용자가 직접 저장한 정보가
          저장됩니다.
        </p>
      </section>
      <section>
        <h2>처리 목적</h2>
        <p>
          계정 식별, 식단과 레시피 저장, 장보기 목록 생성, 사용자 설정 유지,
          오류 확인, 부정 이용 방지를 위해 개인정보를 처리합니다.
        </p>
      </section>
      <section>
        <h2>보유 및 이용 기간</h2>
        <p>
          회원 정보와 사용자가 저장한 서비스 데이터는 회원 탈퇴 또는 삭제 요청
          시까지 보관합니다. 법령상 보관 의무가 있는 기록은 해당 기간 동안
          분리 보관한 뒤 파기합니다.
        </p>
      </section>
      <section>
        <h2>제3자 제공</h2>
        <p>{legal.thirdPartySharing}</p>
      </section>
      <section>
        <h2>위탁 및 국외 이전</h2>
        <p>위탁: {legal.processingConsignment}</p>
        <p>국외 이전: {legal.overseasTransfer}</p>
      </section>
      <section>
        <h2>파기</h2>
        <p>
          목적 달성 또는 보유 기간 만료 시 복구하기 어려운 방식으로 파기합니다.
          전자 파일은 재생할 수 없는 기술적 방법으로 삭제하고, 출력물은 분쇄
          또는 소각합니다.
        </p>
      </section>
      <section>
        <h2>권리 행사</h2>
        <p>
          이용자는 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.
          요청은 아래 보호책임자 연락처로 접수합니다.
        </p>
      </section>
      <section>
        <h2>개인정보 보호책임자</h2>
        <dl>
          <div>
            <dt>이름</dt>
            <dd>{legal.privacyOfficerName}</dd>
          </div>
          <div>
            <dt>연락처</dt>
            <dd>{legal.privacyOfficerContact}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>자동수집 및 쿠키</h2>
        <p>
          서비스 안정성 확인을 위해 접속 경로, 브라우저 정보, 오류 정보가
          자동으로 처리될 수 있습니다. 로그인 유지와 보안 처리를 위해 필요한
          쿠키를 사용할 수 있습니다.
        </p>
      </section>
      <section>
        <h2>안전조치</h2>
        <p>
          접근 권한 관리, 전송 구간 암호화, 비밀키 환경변수 분리, 운영 이벤트
          최소 기록, 권한 없는 접근 차단을 적용합니다.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
