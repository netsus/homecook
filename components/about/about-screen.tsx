"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { AppBackButton } from "@/components/shared/app-back-button";
import { WebShell, WebTopNav } from "@/components/web";
import {
  SERVICE_GUIDE_FAQS,
  SERVICE_GUIDE_FEATURES,
  SERVICE_GUIDE_GUIDES,
  SERVICE_GUIDE_STEPS,
  type ServiceGuideArticle,
  type ServiceGuideFaq,
} from "@/lib/content/service-guide";
import { hasSafeAboutHistoryReturn } from "@/lib/navigation/about-return";

interface AboutScreenProps {
  contactEmail?: string;
}

export function AboutScreen({ contactEmail = "" }: AboutScreenProps) {
  const router = useRouter();
  const handleBack = () => {
    if (hasSafeAboutHistoryReturn()) {
      window.history.back();
      return;
    }

    router.replace("/");
  };

  return (
    <WebShell className="about-shell" wide>
      <WebTopNav activeId="about" className="about-desktop-nav" />
      <header className="about-mobile-bar">
        <AppBackButton className="about-mobile-back" onClick={handleBack} />
        <strong>무먹 가이드</strong>
        <span aria-hidden="true" className="about-mobile-spacer" />
      </header>

      <main className="about-page">
        <section aria-labelledby="about-title" className="about-hero">
          <div className="about-hero-copy">
            <p className="about-hero-line">무먹 가이드</p>
            <h1 id="about-title">
              <span>만들 계획부터,</span>{" "}
              <span>먹은 기록까지</span>
            </h1>
            <p className="about-hero-description">
              만들 계획과 먹은 기록을 함께. 한 번에 넉넉히 요리하고,
              나눠 먹은 만큼 영양정보를 확인해요.
            </p>
            <div className="about-hero-actions">
              <Link className="about-button about-button-primary" href="/">
                레시피 둘러보기
              </Link>
              <Link className="about-button about-button-secondary" href="#how-to">
                사용법부터 보기
              </Link>
            </div>
          </div>
          <div className="about-character-scene">
            <Image alt="웃고 있는 당근 친구" className="about-character-main" height={224} sizes="202px" src="/assets/plush-v2/carrot.webp" width={224} />
            <Image alt="" className="about-character-small" height={112} sizes="116px" src="/assets/plush-v2/broccoli.webp" width={112} />
            <span>오늘도 잘 챙겨 먹어요!</span>
          </div>
        </section>

        <nav aria-label="무먹 가이드 목차" className="about-anchor-nav">
          <Link href="#how-to">사용 순서</Link>
          <Link href="#features">핵심 기능</Link>
          <Link href="#guides">기능별 가이드</Link>
          <Link href="#faq">자주 묻는 질문</Link>
        </nav>

        <section className="about-section" id="how-to">
          <Link aria-label="집밥 기록 테스트 해보기" className="about-landing-banner" href="/beta?ad_variant=a">
            <Image alt="나의 집밥 기록 타입 테스트" height={630} sizes="(min-width: 1024px) 560px, 100vw" src="/assets/funnel/share/og-share.png" width={1200} />
            <div>
              <span className="about-section-eyebrow">30초 집밥 기록 테스트</span>
              <strong>나는 어떤 집밥 기록 타입일까?</strong>
              <p>결과를 확인하고 무먹의 기록 흐름을 미리 체험해 보세요.</p>
              <span className="about-landing-link">테스트 해보기 <span aria-hidden="true">↗</span></span>
            </div>
          </Link>
          <aside className="about-availability" aria-label="현재 이용 안내">
            <strong>천천히 둘러보고 시작해요</strong>
            <p>예시 화면은 로그인 없이 볼 수 있어요. 내 계획과 식사를 추가하려면 로그인해 주세요.</p>
            <p>YouTube 레시피 추출과 식사 상세·수정은 준비 중이에요.</p>
          </aside>
          <SectionHeading
            description="만들 계획부터 실제 먹은 양까지, 다섯 단계로 이어져요."
            eyebrow="HOW IT WORKS"
            title="한 끼는 이렇게 이어져요"
          />
          <ol className="about-step-list">
            {SERVICE_GUIDE_STEPS.map((step, index) => (
              <li className="about-step" key={step.id}>
                <span className="about-step-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="about-section" id="features">
          <SectionHeading
            description="한 번 만든 요리를 여러 끼에 나눠 먹어도, 계획과 기록을 구분해서 볼 수 있어요."
            eyebrow="WHY IT WORKS"
            title="끼니 계획이 편해지는 이유"
          />
          <div className="about-feature-grid">
            {SERVICE_GUIDE_FEATURES.map((feature) => (
              <article className="about-feature" key={feature.id}>
                <span>{feature.label}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section" id="guides">
          <SectionHeading
            description="처음 쓰는 기능이 있다면 필요한 항목만 펼쳐 순서대로 따라 해보세요."
            eyebrow="GUIDES"
            title="기능별 가이드"
          />
          <div className="about-accordion-list">
            {SERVICE_GUIDE_GUIDES.map((guide) => (
              <GuideAccordion item={guide} key={guide.id} kind="guide" />
            ))}
          </div>
        </section>

        <section className="about-section" id="faq">
          <SectionHeading
            description="요리 계획과 식사 기록을 시작하며 궁금한 내용을 모았어요."
            eyebrow="FAQ"
            title="자주 묻는 질문"
          />
          <div className="about-accordion-list">
            {SERVICE_GUIDE_FAQS.map((faq) => (
              <GuideAccordion item={faq} key={faq.id} kind="faq" />
            ))}
          </div>
        </section>

        <section aria-labelledby="about-contact-title" className="about-contact">
          <div>
            <p className="about-section-eyebrow">TRUST & CONTACT</p>
            <h2 id="about-contact-title">안심하고 집밥 기록을 쌓으세요</h2>
            <p>
              계정 정보와 탈퇴는 설정에서 관리할 수 있고, 개인정보 처리 기준은 언제든
              확인할 수 있어요.
            </p>
          </div>
          <div className="about-contact-actions">
            {contactEmail ? (
              <a className="about-text-link" href={`mailto:${contactEmail}`}>
                이메일로 문의하기
              </a>
            ) : (
              <p className="about-contact-unavailable">운영 문의처를 준비하고 있어요.</p>
            )}
            <Link className="about-text-link" href="/privacy">
              개인정보처리방침
            </Link>
            <Link className="about-text-link" href="/terms">
              이용약관
            </Link>
          </div>
        </section>

        <section aria-labelledby="about-final-title" className="about-final-cta">
          <p>오늘 한 끼부터 시작해 보세요</p>
          <h2 id="about-final-title">만들 계획부터 먹은 기록까지, 무먹에서</h2>
          <div className="about-hero-actions">
            <Link className="about-button about-button-primary" href="/">
              레시피 둘러보기
            </Link>
            <Link className="about-button about-button-secondary" href="/planner">
              플래너 시작하기
            </Link>
          </div>
        </section>
      </main>
    </WebShell>
  );
}

function SectionHeading({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="about-section-heading">
      <p className="about-section-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function GuideAccordion({
  item,
  kind,
}: {
  item: ServiceGuideArticle | ServiceGuideFaq;
  kind: "guide" | "faq";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerId = `${kind}-trigger-${item.id}`;
  const panelId = `${kind}-panel-${item.id}`;

  return (
    <article className="about-accordion">
      <h3>
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          className="about-accordion-trigger"
          id={triggerId}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span>{item.title}</span>
          <span aria-hidden="true" className="about-accordion-mark">
            {isOpen ? "−" : "+"}
          </span>
        </button>
      </h3>
      <div
        aria-labelledby={triggerId}
        className="about-accordion-panel"
        hidden={!isOpen}
        id={panelId}
        role="region"
      >
        {kind === "guide" ? (
          <GuideArticleBody item={item as ServiceGuideArticle} />
        ) : (
          <p>{(item as ServiceGuideFaq).answer}</p>
        )}
      </div>
    </article>
  );
}

function GuideArticleBody({ item }: { item: ServiceGuideArticle }) {
  return (
    <>
      <p>{item.description}</p>
      <ol>
        {item.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {item.href && item.linkLabel ? (
        <Link className="about-text-link" href={item.href}>
          {item.linkLabel}
        </Link>
      ) : null}
    </>
  );
}
