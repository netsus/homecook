import React from "react";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata = {
  alternates: {
    canonical: "/terms",
  },
  description: "집밥 서비스 이용 조건과 계정, 탈퇴, 금지행위 기준",
  openGraph: {
    description: "집밥 서비스 이용 조건과 계정, 탈퇴, 금지행위 기준",
    images: ["/opengraph-image"],
    title: "이용약관",
    type: "website",
    url: "/terms",
  },
  title: "이용약관",
};

export default function TermsPage() {
  const legal = getLegalInfo();

  return (
    <LegalDocumentPage
      activeId="terms"
      description="집밥을 이용하기 전에 확인해야 하는 서비스 범위, 계정, 책임 기준입니다."
      eyebrow="Terms"
      meta={[
        { label: "서비스", value: legal.serviceName },
        { label: "운영자", value: legal.operatorName },
        { label: "문의", value: legal.contactEmail },
        { label: "시행일", value: legal.effectiveDate },
      ]}
      title="이용약관"
    >
      <section>
        <h2>서비스 범위</h2>
        <p>
          집밥은 레시피 탐색, 직접 레시피 등록, 식단 계획, 장보기 목록,
          팬트리, 요리 기록, 남은 요리 기록을 제공하는 개인용 식생활 관리
          서비스입니다.
        </p>
      </section>
      <section>
        <h2>계정과 탈퇴</h2>
        <p>
          이용자는 소셜 로그인을 통해 계정을 만들 수 있습니다. 계정 삭제는
          설정 화면에서 요청할 수 있으며, 삭제가 완료되면 복구할 수 없습니다.
        </p>
      </section>
      <section>
        <h2>사용자 콘텐츠</h2>
        <p>
          이용자가 등록한 레시피, 식단, 장보기, 팬트리 기록은 이용자가 관리할
          책임이 있습니다. 타인의 권리를 침해하거나 허위 정보를 고의로 등록하면
          이용이 제한될 수 있습니다.
        </p>
      </section>
      <section>
        <h2>금지행위</h2>
        <ul>
          <li>타인의 계정 또는 정보를 무단으로 사용하는 행위</li>
          <li>서비스 장애를 유발하거나 보안 기능을 우회하는 행위</li>
          <li>권리 침해, 불법 정보, 악성 코드 등을 등록하는 행위</li>
          <li>자동화 수단으로 과도한 요청을 보내는 행위</li>
        </ul>
      </section>
      <section>
        <h2>책임의 제한</h2>
        <p>
          집밥은 레시피와 식단 관리를 돕는 도구이며 의료, 영양, 식품 안전에
          대한 전문 자문을 대체하지 않습니다. 외부 서비스 장애, 이용자 입력
          오류, 통신 장애 등 운영자가 통제하기 어려운 사유로 발생한 손해에
          대해서는 법령이 허용하는 범위에서 책임이 제한됩니다.
        </p>
      </section>
      <section>
        <h2>문의</h2>
        <p>{legal.contactEmail}</p>
      </section>
      <section>
        <h2>약관 변경</h2>
        <p>
          약관이 변경될 경우 서비스 화면 또는 공지 가능한 수단으로 안내합니다.
          중요한 변경은 적용 전에 충분히 알립니다.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
