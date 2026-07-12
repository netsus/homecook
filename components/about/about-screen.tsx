"use client";

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
          <p className="about-hero-line">무먹 가이드</p>
          <h1 id="about-title">무엇을 먹든, 계획은 한곳에서</h1>
          <p className="about-hero-description">
            오늘 만들 메뉴를 찾고 식단에 담으면, 장보기부터 요리와 남은 음식 기록까지
            한 흐름으로 이어져요.
          </p>
          <div className="about-hero-actions">
            <Link className="about-button about-button-primary" href="/">
              레시피 둘러보기
            </Link>
            <Link className="about-button about-button-secondary" href="#how-to">
              사용법부터 보기
            </Link>
          </div>
        </section>

        <nav aria-label="무먹 가이드 목차" className="about-anchor-nav">
          <Link href="#how-to">사용 순서</Link>
          <Link href="#features">핵심 기능</Link>
          <Link href="#guides">기능별 가이드</Link>
          <Link href="#faq">자주 묻는 질문</Link>
        </nav>

        <section className="about-section" id="how-to">
          <SectionHeading
            description="레시피를 고르는 순간부터 남은 음식까지, 다섯 단계가 자연스럽게 연결돼요."
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
            description="필요한 재료와 기록을 흩어 두지 않고, 실제 집밥 순서에 맞춰 정리해요."
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
            description="장보기와 플래너를 쓰면서 자주 궁금해하는 내용을 모았어요."
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
          <h2 id="about-final-title">계획하면 장보기와 요리가 가벼워져요</h2>
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
