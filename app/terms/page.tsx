import React from "react";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata = {
  alternates: {
    canonical: "/terms",
  },
  description: "무엇을 먹든 서비스 이용 조건과 계정, 탈퇴, 금지행위 기준",
  openGraph: {
    description: "무엇을 먹든 서비스 이용 조건과 계정, 탈퇴, 금지행위 기준",
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
      description="무엇을 먹든을 이용하기 전에 확인해야 하는 서비스 범위, 계정, 책임 기준입니다."
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
        <h2>목적과 적용</h2>
        <p>
          이 약관은 운영자가 제공하는 무엇을 먹든 서비스의 이용 조건과 운영자 및
          이용자의 권리·의무를 정합니다. 이용자는 로그인이나 회원 기능을
          사용하기 전에 이 약관을 확인할 수 있습니다.
        </p>
      </section>
      <section>
        <h2>서비스 범위</h2>
        <p>
          무엇을 먹든은 레시피 탐색, 직접 레시피 등록, 식단 계획, 장보기 목록,
          팬트리, 요리 기록, 남은 요리 기록을 제공하는 개인용 식생활 관리
          서비스입니다.
        </p>
      </section>
      <section>
        <h2>계정과 탈퇴</h2>
        <p>
          이용자는 소셜 로그인을 통해 계정을 만들 수 있습니다. 회원탈퇴는
          설정 화면에서 요청할 수 있으며, 삭제된 서비스 데이터는 복구할 수
          없습니다. 직접 등록한 레시피는 작성자 정보가 제거된 상태로 남을 수
          있습니다.
        </p>
        <dl className="legal-facts">
          <div><dt>서비스 가입 가능 연령</dt><dd>{legal.childAccountPolicy}</dd></div>
          <div><dt>탈퇴 후 별도 보관 또는 잔존 데이터</dt><dd /></div>
        </dl>
      </section>
      <section>
        <h2>사용자 콘텐츠의 권리</h2>
        <p>
          이용자가 직접 작성한 콘텐츠의 권리는 이용자 또는 정당한 권리자에게
          있습니다. 이용자는 서비스가 콘텐츠를 저장, 표시, 전송, 백업하는 등
          서비스 제공에 필요한 범위에서 해당 콘텐츠를 이용할 수 있도록
          허락합니다. 이용자는 타인의 저작권, 개인정보 및 그 밖의 권리를
          침해하는 콘텐츠를 등록해서는 안 됩니다.
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
        <h2>서비스 변경 및 중단</h2>
        <p>
          운영자는 점검, 보안 문제, 외부 서비스 장애, 천재지변 또는 운영상
          필요한 사유가 있으면 서비스의 전부 또는 일부를 변경하거나 일시
          중단할 수 있습니다. 예측 가능한 중요한 변경이나 중단은 가능한 범위에서
          사전에 안내합니다.
        </p>
      </section>
      <section>
        <h2>이용 제한</h2>
        <p>
          이용자가 이 약관이나 법령을 위반하거나 서비스의 안전한 운영을 방해한
          경우 운영자는 위반 정도와 긴급성을 고려하여 콘텐츠 제한, 기능 제한
          또는 계정 이용 제한 조치를 할 수 있습니다. 긴급한 보안 조치가 아닌
          경우 사유와 이의제기 방법을 안내합니다.
        </p>
      </section>
      <section>
        <h2>면책고지 및 책임의 제한</h2>
        <p>
          무엇을 먹든은 레시피와 식단 관리를 돕는 도구이며 의료, 영양, 식품 안전에
          대한 전문 자문을 대체하지 않습니다. 알레르기, 식재료 상태, 보관 방법,
          가열 정도와 개인의 건강 상태는 이용자가 별도로 확인해야 합니다.
        </p>
        <p>
          외부에서 가져온 레시피·영상·정보의 정확성이나 계속 제공 여부는 해당
          외부 서비스의 사정에 따라 달라질 수 있습니다. 외부 서비스 장애,
          이용자 입력 오류, 통신 장애, 천재지변처럼 운영자가 합리적으로 통제하기
          어려운 사유로 발생한 손해는 법령이 허용하는 범위에서 책임이 제한됩니다.
          다만, 운영자의 고의 또는 중대한 과실로 인한 책임과 관계 법령상 배제할
          수 없는 책임은 제한하지 않습니다.
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
