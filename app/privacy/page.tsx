import React from "react";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getLegalInfo } from "@/lib/legal-info";
import { MARKETING_VALIDATION_RETENTION_DAYS } from "@/lib/marketing/demand-validation";
import { defaultOpenGraphImagePath } from "@/lib/seo/default-social-image";

export const metadata = {
  alternates: { canonical: "/privacy" },
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
      description="무엇을 먹든이 어떤 개인정보를 왜 처리하고, 언제 지우는지 안내합니다."
      eyebrow="Privacy"
      meta={[
        { label: "운영자", value: legal.operatorName },
        { label: "문의", value: legal.contactEmail },
        { label: "시행일", value: legal.effectiveDate },
      ]}
      title="개인정보처리방침"
    >
      <section>
        <h2>처리 항목·목적·보유기간과 법적 근거</h2>
        <dl className="legal-facts">
          <div>
            <dt>회원 기능</dt>
            <dd>
              소셜 로그인 식별자, 이메일, 닉네임과 프로필 이미지를 계정 식별,
              로그인, 회원 기능 제공을 위해 처리합니다. 개인정보 보호법 제15조
              제1항 제4호에 따른 계약 이행에 필요한 정보이며 회원탈퇴 시까지
              보관합니다. 탈퇴 후 재가입 세대 구분, 삭제 재처리와 부정 이용
              방지에 필요한 최소 식별자와 비가역 해시 기록은 영구 보관하며,
              이메일·닉네임·프로필 이미지는 이 기록에 남기지 않습니다.
            </dd>
          </div>
          <div>
            <dt>사용자가 저장한 내용</dt>
            <dd>
              레시피, 레시피북, 식단, 장보기, 팬트리, 요리와 남은 요리 기록 및
              설정을 서비스 제공을 위해 처리하며, 사용자가 삭제하거나
              회원탈퇴할 때까지 보관합니다. 공개·공유된 콘텐츠는 탈퇴 후
              작성자와 분리된 상태로 남을 수 있습니다.
            </dd>
          </div>
          <div>
            <dt>베타 초대 신청 정보</dt>
            <dd>
              광고·프로필 유입 경로, 화면 진행단계, 설문 답변과 접속 시각을
              서비스 수요 분석에 사용합니다. 베타테스트 초대 안내를 신청한
              경우 동의를 받아 베타 초대 신청 이메일도 처리합니다. 해당
              정보는 캠페인 종료 후{" "}
              {MARKETING_VALIDATION_RETENTION_DAYS}일까지 보관한 뒤 삭제합니다.
            </dd>
          </div>
          <div>
            <dt>자동으로 생성되는 정보</dt>
            <dd>
              IP 주소, 접속 일시, 요청 경로, 브라우저·기기 및 네트워크 정보,
              로그인·수요조사 세션 쿠키와 오류·보안 이벤트가 서비스 안정성,
              부정 이용 방지 및 장애 대응에 필요한 범위에서 처리될 수 있습니다.
              세션 정보는 로그아웃 또는 유효기간 만료 시까지 보관하고, 회원탈퇴
              시 운영 기록의 계정 직접 식별정보를 제거합니다.
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>제3자 제공</h2>
        <p>
          무엇을 먹든은 개인정보를 제3자에게 제공하지 않습니다. 앞으로 제공이
          필요해지면 법적 근거를 확인하고 필요한 경우 이용자에게 미리 알리거나
          동의를 받겠습니다.
        </p>
      </section>

      <section>
        <h2>개인정보 처리위탁</h2>
        <dl className="legal-facts">
          <div>
            <dt>Cloudflare, Inc.</dt>
            <dd>
              사이트 전송, HTTPS 연결, DDoS·봇 방어, 접속 보안 분석과 Turnstile
              사람 확인을 처리합니다. 사이트 전달 과정에서는 이용자가 전송하는
              요청 내용도 Cloudflare 네트워크를 통과할 수 있습니다. 이와 별개로
              Turnstile 보안 확인 기능은 이메일·설문 답변 같은 입력 내용을
              읽거나 저장하지 않습니다.
            </dd>
          </div>
          <div>
            <dt>네이버 주식회사</dt>
            <dd>
              mumeok@naver.com으로 들어오는 개인정보 문의 이메일의 수신과
              보관을 처리합니다. 보유기간은 문의 처리와 필요한 후속 대응이
              끝날 때까지입니다.
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>개인정보의 국외 이전</h2>
        <dl className="legal-facts">
          <div><dt>이전받는 자</dt><dd>Cloudflare, Inc. · legal@cloudflare.com</dd></div>
          <div>
            <dt>이전 국가</dt>
            <dd>
              미국, 유럽경제지역, 영국, 호주, 일본, 캐나다, 싱가포르,
              아랍에미리트, 인도, 멕시코, 말레이시아와 스위스. 접속 경로와
              사용하는 Cloudflare 기능에 따라 처리 위치가 달라질 수 있으며,
              현재 하위 처리자 위치는{" "}
              <a
                href="https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/"
                rel="noreferrer"
                target="_blank"
              >
                공식 목록
              </a>
              에서 확인할 수 있습니다.
            </dd>
          </div>
          <div>
            <dt>이전 항목</dt>
            <dd>
              IP 주소, 접속 일시, 요청 경로, 브라우저·기기 및 네트워크 정보,
              HTTP 헤더와 쿠키, 보안 확인 정보 및 이용자가 전송하는 요청 내용
            </dd>
          </div>
          <div>
            <dt>이전 목적과 방법</dt>
            <dd>
              사이트 전송과 보안 서비스 제공을 위해 접속 또는 보안 확인 시
              네트워크를 통해 전송됩니다.
            </dd>
          </div>
          <div>
            <dt>보유 및 이용 기간</dt>
            <dd>
              서비스 제공과 보안 처리에 필요한 기간 및 위탁계약 기간 동안
              처리되며, 계약 종료 후 법령상 보존 의무가 없는 정보는 삭제하거나
              반환합니다.
            </dd>
          </div>
          <div>
            <dt>법적 근거</dt>
            <dd>
              개인정보 보호법 제28조의8 제1항 제3호 가목에 따른 서비스 계약
              이행에 필요한 처리위탁·보관 및 개인정보처리방침 공개
            </dd>
          </div>
          <div>
            <dt>이전 거부 방법과 영향</dt>
            <dd>
              국외 처리를 원하지 않으면 서비스 이용을 중단하고 개인정보
              처리정지를 요청할 수 있습니다. Cloudflare 처리는 공개 사이트
              전송과 보안에 필수이므로 이를 거부하면 서비스를 이용할 수
              없습니다.
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>파기</h2>
        <p>
          보유기간이 끝나거나 처리 목적을 달성하면 복구하기 어려운 방법으로
          개인정보를 삭제합니다. 회원탈퇴 시 계정과 개인 저장 정보를 삭제하고,
          공개·공유된 콘텐츠가 보존되는 경우 작성자를 알아볼 수 없도록
          분리합니다. 재가입 세대 구분과 삭제 재처리 방지에 필요한 최소
          식별자·비가역 해시 기록은 영구 보관합니다. 보안·감사 운영 기록은
          계정의 직접 식별정보를 제거한 뒤 보관합니다. 암호화된 복구용 백업에
          남은 정보는 서비스 장애 복구에만 사용하고, 복구 필요가 끝나 백업을
          폐기할 때 복구할 수 없는 방법으로 삭제합니다.
        </p>
      </section>

      <section>
        <h2>권리 행사와 개인정보 문의</h2>
        <p>
          이용자는 개인정보 열람, 정정·삭제, 처리정지와 동의 철회를 요청할 수
          있습니다. 요청은 본인 또는 정당한 대리인인지 확인한 뒤 처리합니다.
        </p>
        <dl className="legal-facts">
          <div><dt>담당</dt><dd>{legal.privacyOfficerName}</dd></div>
          <div><dt>고충처리 및 열람청구</dt><dd>{legal.complaintDepartment}</dd></div>
          <div><dt>연락처</dt><dd>{legal.complaintDepartmentContact || legal.privacyOfficerContact}</dd></div>
        </dl>
      </section>

      <section>
        <h2>쿠키와 자동수집 거부</h2>
        <p>
          로그인 유지, 수요조사 진행 저장과 보안에 필요한 쿠키를 사용합니다.
          브라우저 설정에서 쿠키를 삭제하거나 저장을 거부할 수 있지만, 로그인과
          진행상태 저장 등 일부 기능이 동작하지 않을 수 있습니다.
        </p>
      </section>

      <section>
        <h2>안전조치</h2>
        <p>
          개인정보 접근 권한을 제한하고, 전송 구간을 암호화하며, 비밀키를
          공개 코드와 분리합니다. 운영 기록에는 필요한 최소 정보만 남기고,
          권한 없는 접근과 다른 이용자의 데이터 변경을 차단합니다.
        </p>
      </section>

      <section>
        <h2>권익침해 구제방법</h2>
        <p>
          개인정보 침해 상담·신고는 개인정보침해신고센터(국번 없이 118),
          개인정보분쟁조정위원회 또는 개인정보보호위원회에 요청할 수 있습니다.
        </p>
      </section>

      <section>
        <h2>개인정보처리방침의 변경</h2>
        <p>
          이 방침이 바뀌면 시행 전에 서비스 화면을 통해 변경 내용과 시행일을
          안내합니다.
        </p>
      </section>
    </LegalDocumentPage>
  );
}
