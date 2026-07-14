import React from "react";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalInfo } from "@/lib/legal-info";
import { defaultOpenGraphImagePath } from "@/lib/seo/default-social-image";

export const metadata = {
  alternates: {
    canonical: "/privacy",
  },
  description: "무엇을 먹든 서비스 개인정보 수집, 이용, 보관, 파기 기준",
  openGraph: {
    description: "무엇을 먹든 서비스 개인정보 수집, 이용, 보관, 파기 기준",
    images: [defaultOpenGraphImagePath],
    title: "개인정보처리방침",
    type: "website",
    url: "/privacy",
  },
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  const legal = getLegalInfo();

  return (
    <LegalDocumentPage
      activeId="privacy"
      description="무엇을 먹든이 개인정보를 어떤 목적으로 처리하고, 얼마나 보관하며, 이용자가 어떻게 권리를 행사할 수 있는지 안내합니다."
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
        <dl className="legal-facts">
          <div>
            <dt>회원 및 소셜 로그인 정보</dt>
            <dd>소셜 로그인 식별자, 이메일, 닉네임, 프로필 이미지</dd>
          </div>
          <div>
            <dt>서비스 이용 정보</dt>
            <dd>레시피, 레시피북, 식단, 장보기, 팬트리, 요리 및 남은 요리 기록, 사용자 설정</dd>
          </div>
          <div>
            <dt>자동으로 생성되는 정보</dt>
            <dd>로그인 쿠키와 세션 정보, 접속 경로, 브라우저 정보, 오류 및 운영 기록</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>처리 목적</h2>
        <p>
          계정 식별, 식단과 레시피 저장, 장보기 목록 생성, 사용자 설정 유지,
          오류 확인, 부정 이용 방지를 위해 개인정보를 처리합니다.
        </p>
      </section>
      <section>
        <h2>개인정보 처리의 법적 근거</h2>
        <dl className="legal-facts">
          <div>
            <dt>회원 서비스와 저장 기능 제공</dt>
            <dd>개인정보 보호법 제15조 제1항 제4호에 따른 계약의 체결 및 이행</dd>
          </div>
          <div>
            <dt>보안, 오류 확인 및 부정 이용 방지</dt>
            <dd />
          </div>
          <div>
            <dt>별도 동의가 필요한 처리</dt>
            <dd />
          </div>
        </dl>
      </section>
      <section>
        <h2>보유 및 이용 기간</h2>
        <dl className="legal-facts">
          <div>
            <dt>회원 및 소셜 로그인 정보</dt>
            <dd>회원탈퇴 시까지</dd>
          </div>
          <div>
            <dt>사용자가 저장한 서비스 데이터</dt>
            <dd>회원탈퇴 또는 사용자의 삭제 요청 시까지</dd>
          </div>
          <div>
            <dt>오류, 운영 및 보안 기록</dt>
            <dd />
          </div>
          <div>
            <dt>법령에 따라 별도 보존하는 기록과 기간</dt>
            <dd />
          </div>
        </dl>
      </section>
      <section>
        <h2>제3자 제공</h2>
        <dl className="legal-facts">
          <div><dt>제공받는 자</dt><dd>{legal.thirdPartySharing}</dd></div>
          <div><dt>제공 목적</dt><dd>{legal.thirdPartySharingPurpose}</dd></div>
          <div><dt>제공 항목</dt><dd>{legal.thirdPartySharingItems}</dd></div>
          <div><dt>보유 및 이용 기간</dt><dd>{legal.thirdPartySharingRetention}</dd></div>
        </dl>
      </section>
      <section>
        <h2>개인정보 처리위탁</h2>
        <dl className="legal-facts">
          <div><dt>수탁자</dt><dd>{legal.processingConsignment}</dd></div>
          <div><dt>위탁 업무</dt><dd>{legal.processingConsignmentWork}</dd></div>
        </dl>
      </section>
      <section>
        <h2>개인정보의 국외 이전</h2>
        <dl className="legal-facts">
          <div><dt>이전받는 자</dt><dd>{legal.overseasTransferRecipient}</dd></div>
          <div><dt>연락처</dt><dd>{legal.overseasTransferRecipientContact}</dd></div>
          <div><dt>이전 국가</dt><dd>{legal.overseasTransferCountry}</dd></div>
          <div><dt>이전 항목</dt><dd>{legal.overseasTransferItems}</dd></div>
          <div><dt>이전 목적</dt><dd>{legal.overseasTransferPurpose}</dd></div>
          <div><dt>이전 시기 및 방법</dt><dd>{legal.overseasTransferMethod}</dd></div>
          <div><dt>보유 및 이용 기간</dt><dd>{legal.overseasTransferRetention}</dd></div>
          <div><dt>국외 이전의 법적 근거</dt><dd>{legal.overseasTransferLegalBasis}</dd></div>
        </dl>
      </section>
      <section>
        <h2>파기</h2>
        <p>
          목적 달성 또는 보유 기간 만료 시 복구하기 어려운 방식으로 파기합니다.
          전자 파일은 재생할 수 없는 기술적 방법으로 삭제하고, 출력물은 분쇄
          또는 소각합니다.
        </p>
        <dl className="legal-facts">
          <div><dt>회원탈퇴 시 Supabase Auth 계정 처리 기준</dt><dd /></div>
          <div><dt>백업 데이터 삭제 주기</dt><dd /></div>
          <div><dt>작성자가 탈퇴한 직접 등록 레시피 처리 기준</dt><dd /></div>
        </dl>
      </section>
      <section>
        <h2>정보주체와 법정대리인의 권리 행사</h2>
        <p>
          이용자와 법정대리인은 개인정보 열람, 정정·삭제, 처리정지 및 동의
          철회를 요청할 수 있습니다. 요청은 아래 개인정보 보호책임자 또는
          고충처리 부서로 접수할 수 있으며, 본인 또는 정당한 대리인인지 확인한
          뒤 관계 법령이 정한 절차에 따라 처리합니다.
        </p>
      </section>
      <section>
        <h2>만 14세 미만 아동의 개인정보</h2>
        <dl className="legal-facts">
          <div><dt>가입 및 개인정보 처리 기준</dt><dd>{legal.childAccountPolicy}</dd></div>
        </dl>
      </section>
      <section>
        <h2>개인정보 보호책임자</h2>
        <dl className="legal-facts">
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
        <h2>개인정보 고충처리 및 열람청구</h2>
        <dl className="legal-facts">
          <div><dt>담당 부서</dt><dd>{legal.complaintDepartment}</dd></div>
          <div><dt>연락처</dt><dd>{legal.complaintDepartmentContact}</dd></div>
        </dl>
      </section>
      <section>
        <h2>자동수집 및 쿠키</h2>
        <p>
          서비스 안정성 확인을 위해 접속 경로, 브라우저 정보, 오류 정보가
          자동으로 처리될 수 있습니다. 로그인 유지와 보안 처리를 위해 필요한
          쿠키를 사용할 수 있습니다.
        </p>
        <p>
          브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만,
          필수 쿠키를 거부하면 로그인과 회원 전용 기능을 이용하기 어려울 수
          있습니다.
        </p>
      </section>
      <section>
        <h2>안전조치</h2>
        <p>
          접근 권한 관리, 전송 구간 암호화, 비밀키 환경변수 분리, 운영 이벤트
          최소 기록, 권한 없는 접근 차단을 적용합니다.
        </p>
      </section>
      <section>
        <h2>권익침해 구제방법</h2>
        <p>
          개인정보 침해에 관한 상담이나 신고가 필요한 경우 개인정보침해신고센터
          (국번 없이 118), 개인정보분쟁조정위원회 또는 개인정보보호위원회에
          문의할 수 있습니다.
        </p>
      </section>
      <section>
        <h2>개인정보처리방침의 변경</h2>
        <p>
          이 방침이 변경되면 시행 전에 서비스 화면을 통해 변경 내용과 시행일을
          안내합니다.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
