import { expect, test, type Page } from "@playwright/test";

const defaultHero = "집밥도 정확하게 기록할 수 있을까?";

async function openHero(page: Page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.getByTestId("screen-hero")).toBeVisible();
}

async function completeQuiz(page: Page, q3Answer: string) {
  await page.getByRole("button", { name: "테스트 시작하기" }).click();
  await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "거의 매일" }).click();
  await expect(page.getByText("2 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "3~5끼" }).click();
  await expect(page.getByText("3 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: q3Answer }).click();
  await expect(page.getByText("4 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "재료와 양을 하나씩 입력하는 것" }).click();
}

test("A/B/C/D와 기본 Hero는 같은 4문항으로 연결된다", async ({ page }) => {
  const variants = [
    ["", defaultHero],
    ["?ad_variant=a", "왜 레시피에 다 있는데 내가 또 입력하지?"],
    ["?utm_content=hook_cooked_weight", "요리 전 1,420g → 요리 후 1,083g 그럼 내가 먹은 300g은 몇 kcal일까?"],
    ["?ad_variant=c", "이 제육볶음 300g, 몇 kcal일까요?"],
    ["?utm_content=hook_workaround", "식단은 꼼꼼히 기록하는데 집밥만 ‘비슷한 음식’으로 넣고 있었습니다."],
  ] as const;

  for (const [query, title] of variants) {
    await openHero(page, query);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "테스트 시작하기" }).click();
    await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();
  }
});

test("질문 카피와 선택지는 제품 결정표와 일치한다", async ({ page }) => {
  await openHero(page);
  await page.getByRole("button", { name: "테스트 시작하기" }).click();

  await expect(page.getByRole("button", { name: "이전 화면" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "평소 칼로리나 탄단지를 얼마나 자주 기록하나요?" })).toBeVisible();
  await expect(page.getByTestId("question-prompt").locator("br")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "거의 매일" })).toBeVisible();
  await expect(page.getByRole("button", { name: "주 3~5일" })).toBeVisible();
  await expect(page.getByRole("button", { name: "주 1~2일" })).toBeVisible();
  await expect(page.getByRole("button", { name: "거의 안 함 / 안 함", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "거의 안 함 / 안 함", exact: true }).click();
  await expect(page.getByText("2 / 4", { exact: true })).toBeVisible();
  await expect(page.getByText("직접 만들거나 가족이 만든 음식 모두 포함", { exact: true })).toBeVisible();

  const optionTypography = await page.getByTestId("quiz-option").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontSize: Number.parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) };
  });
  expect(optionTypography.fontSize).toBeGreaterThanOrEqual(18);
  expect(optionTypography.fontWeight).toBeGreaterThanOrEqual(800);
});

for (const scenario of [
  ["집밥은 기록하지 않음", "집밥 패스형", "homecook-passer.png"],
  ["먹은 양을 눈대중으로 기록", "눈대중 장인", "eyeballing-master.png"],
  ["딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", "성분 추적러", "ingredient-tracker.png"],
  ["재료와 음식 무게까지 재서 기록", "프로 계량러", "pro-measurer.png"],
] as const) {
  const [answer, resultName, assetName] = scenario;

  test(`Q3 '${answer}'은 '${resultName}' 결과를 만든다`, async ({ page }) => {
    await openHero(page);
    await completeQuiz(page, answer);
    await expect(page.getByTestId("screen-result")).toBeVisible();
    await expect(page.getByRole("heading", { name: resultName })).toBeVisible();
    await expect(page.getByTestId("result-character")).toHaveAttribute("src", new RegExp(assetName));
    await expect(page.getByTestId("result-celebration")).toBeVisible();
    const characterAnimation = await page.getByTestId("result-character").evaluate((element) => getComputedStyle(element).animationName);
    expect(characterAnimation).not.toBe("none");
    const experienceButton = page.getByRole("button", { name: "무먹으로 20초 체험하기" });
    await expect(experienceButton).toBeVisible();
    expect(Number(await experienceButton.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(900);
    await expect(page.getByTestId("conversion-headline").locator("br")).toHaveCount(0);
  });
}

test("성분 추적러 결과는 인용문과 설명을 반복하지 않는다", async ({ page }) => {
  await page.goto("/?result=%EC%84%B1%EB%B6%84%20%EC%B6%94%EC%A0%81%EB%9F%AC");
  await expect(page.getByTestId("result-description")).not.toContainText("딱 맞는 음식이 없어 오늘도 검색 결과를 추적");
  await expect(page.getByTestId("result-description")).toContainText("내 레시피를 바로 기록");
});

test("결과부터 5단계 체험, 식단 반영, 완제품, 베타 신청까지 동작한다", async ({ page }) => {
  test.setTimeout(45_000);
  await openHero(page, "?variant=b");
  await completeQuiz(page, "먹은 양을 눈대중으로 기록");

  await page.getByRole("button", { name: "무먹으로 20초 체험하기" }).click();
  await expect(page.getByTestId("screen-demo-1")).toBeVisible();
  await expect(page.getByTestId("youtube-play-icon")).toBeVisible();
  await expect(page.getByTestId("recipe-channel")).toBeVisible();
  await page.getByRole("button", { name: "무먹으로 가져오기" }).click();
  await expect(page.getByText("레시피를 가져오는 중…", { exact: true })).toBeVisible();
  await expect(page.getByTestId("recipe-success")).toBeVisible();

  await expect(page.getByTestId("screen-demo-2")).toBeVisible();
  await expect(page.getByText("돼지고기", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ingredient-emoji")).toHaveCount(6);
  await expect(page.getByTestId("pork-amount")).toHaveText("600g");
  const ingredientNext = page.getByRole("button", { name: "다음" });
  await expect(ingredientNext).toBeDisabled();
  const porkChangeButton = page.getByRole("button", { name: "돼지고기 양을 520g으로 바꾸기" });
  await expect(porkChangeButton).toContainText("600g → 520g");
  await expect(porkChangeButton).not.toContainText("눌러서 실제 양으로 바꾸기");
  await expect(porkChangeButton.locator("svg")).toHaveCount(0);
  const changeWeightColors = await porkChangeButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  expect(changeWeightColors.backgroundColor).toBe("rgb(0, 161, 255)");
  expect(changeWeightColors.color).toBe("rgb(255, 255, 255)");
  await porkChangeButton.click();
  await expect(page.getByTestId("pork-amount")).toHaveText("520g");
  await expect(page.getByText("520g으로 반영 완료", { exact: true })).toHaveCount(0);
  await expect(porkChangeButton).toHaveCount(0);
  await expect(ingredientNext).toBeEnabled();
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page.getByTestId("screen-demo-3")).toBeVisible();
  await expect(page.getByText("1,200g", { exact: true })).toBeVisible();
  await expect(page.getByTestId("metric-helper").locator("br")).toHaveCount(1);
  const cookedWeightButton = page.getByRole("button", { name: "저울로 재보니 1,180g" });
  expect(Number(await cookedWeightButton.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(850);
  await cookedWeightButton.click();
  await expect(page.getByText("수분이 날아간 만큼까지 반영했어요.", { exact: true })).toBeVisible();

  await expect(page.getByTestId("screen-demo-4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1,180g 중 얼마나 드셨나요?" })).toBeVisible();
  await expect(page.getByTestId("portion-image")).toHaveAttribute("src", /jeyuk-on-scale\.png/);
  await expect(page.getByTestId("scale-display")).toHaveText("320g");
  const portionButton = page.getByRole("button", { name: "320g 입력하기" });
  expect(Number(await portionButton.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(850);
  await portionButton.click();

  await expect(page.getByTestId("screen-demo-5")).toBeVisible();
  await expect(page.getByRole("heading", { name: "계산 완료!" })).toBeVisible();
  await expect(page.getByTestId("nutrition-confetti")).toBeVisible();
  await expect(page.getByText("487 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText("31g", { exact: true })).toBeVisible();
  await expect(page.getByText("39g", { exact: true })).toBeVisible();
  await expect(page.getByText("22g", { exact: true })).toBeVisible();
  await expect(page.getByTestId("macro-image")).toHaveCount(3);
  await expect(page.getByTestId("macro-image").nth(0)).toHaveAttribute("src", /macro-carb-wheat\.png/);
  await expect(page.getByTestId("macro-image").nth(1)).toHaveAttribute("src", /macro-protein-arm\.png/);
  await expect(page.getByTestId("macro-image").nth(2)).toHaveAttribute("src", /macro-fat-drop\.png/);
  await page.getByRole("button", { name: "식단에 기록하기" }).click();

  const plannerHomecook = page.getByTestId("screen-planner-homecook");
  await expect(plannerHomecook).toBeVisible();
  await expect(plannerHomecook.getByRole("button", { name: "이전 화면" })).toBeVisible();
  for (const label of ["칼로리", "탄수화물", "단백질", "지방"]) {
    await expect(plannerHomecook.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "이전 주" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 주" })).toBeVisible();
  await expect(plannerHomecook.getByRole("button", { name: /음식 추가/ })).toHaveCount(3);
  await expect(plannerHomecook.getByText("그릭요거트 볼", { exact: true })).toBeVisible();
  await expect(plannerHomecook.getByText("닭가슴살 현미밥", { exact: true })).toBeVisible();
  await expect(plannerHomecook).toHaveAttribute("data-meal-entered", "false");
  await expect(plannerHomecook).toHaveAttribute("data-meal-entered", "true");
  await expect(plannerHomecook.getByText("제육볶음 320g", { exact: true })).toBeVisible();
  await expect(plannerHomecook.getByTestId("dinner-foods")).toHaveAttribute("data-highlight", "meal");
  await expect(plannerHomecook.getByText("1,607 kcal", { exact: true })).toBeVisible();
  await expect(plannerHomecook.getByText("177g", { exact: true })).toBeVisible();
  await expect(plannerHomecook.getByText("111g", { exact: true })).toBeVisible();
  await expect(plannerHomecook.getByText("60g", { exact: true })).toBeVisible();
  await expect(plannerHomecook.getByText("오늘의 합계", { exact: true })).toHaveCount(0);
  await expect(plannerHomecook.getByTestId("next-day-preview")).toBeVisible();
  const packagedCta = page.getByRole("button", { name: "편의점 음식도 기록해보기" });
  expect(Number(await packagedCta.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(850);
  const [tomorrowBox, packagedCtaBox] = await Promise.all([
    plannerHomecook.getByTestId("next-day-preview").boundingBox(),
    packagedCta.boundingBox(),
  ]);
  expect((packagedCtaBox?.y ?? 0)).toBeLessThan((tomorrowBox?.y ?? 0) + (tomorrowBox?.height ?? 0));
  expect((packagedCtaBox?.y ?? 0) + (packagedCtaBox?.height ?? 0)).toBeGreaterThan(tomorrowBox?.y ?? 0);
  await packagedCta.click();

  await expect(page.getByTestId("screen-packaged-food")).toBeVisible();
  await expect(page.getByText("제품 예시", { exact: true })).toBeVisible();
  await expect(page.getByText("더:단백 드링크 초코", { exact: true })).toBeVisible();
  await expect(page.getByText("105 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText("단백질 20g", { exact: true })).toBeVisible();
  await expect(page.getByTestId("product-card").getByText("✨", { exact: true })).toHaveCount(2);
  const productCardBox = await page.getByTestId("product-card").boundingBox();
  expect(productCardBox?.height).toBeLessThanOrEqual(285);
  const productLogButton = page.getByRole("button", { name: "더:단백 드링크 초코 + 기록하기", exact: true });
  await expect(productLogButton).toContainText("기록하기");
  expect(Number(await productLogButton.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(850);
  await productLogButton.click();

  const plannerComplete = page.getByTestId("screen-planner-complete");
  await expect(plannerComplete).toBeVisible();
  await expect(plannerComplete.getByRole("button", { name: "이전 화면" })).toBeVisible();
  for (const label of ["칼로리", "탄수화물", "단백질", "지방"]) {
    await expect(plannerComplete.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(plannerComplete).toHaveAttribute("data-product-entered", "false");
  await expect(plannerComplete).toHaveAttribute("data-product-entered", "true");
  await expect(plannerComplete.getByText("1,712 kcal", { exact: true })).toBeVisible();
  await expect(plannerComplete.getByText("184g", { exact: true })).toBeVisible();
  await expect(plannerComplete.getByText("131g", { exact: true })).toBeVisible();
  await expect(plannerComplete.getByText("61g", { exact: true })).toBeVisible();
  await expect(plannerComplete.getByTestId("dinner-foods").getByText("더:단백 드링크 초코", { exact: true })).toBeVisible();
  await expect(plannerComplete.getByTestId("dinner-foods")).toHaveAttribute("data-highlight", "product");
  await expect(plannerComplete.getByText("오늘의 합계", { exact: true })).toHaveCount(0);
  await expect(plannerComplete.getByTestId("next-day-preview")).toBeVisible();
  const betaCta = page.getByRole("button", { name: "무료 베타 먼저 써보기" });
  expect(Number(await betaCta.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(850);
  await betaCta.click();

  await expect(page.getByTestId("screen-beta")).toBeVisible();
  const betaScreen = page.getByTestId("screen-beta");
  await expect(betaScreen.getByTestId("beta-character")).toHaveAttribute("src", /beta-invitation-mascot\.png/);
  await expect(betaScreen.getByText(/직접 써보고 싶나요\?/)).toBeVisible();
  await expect(betaScreen.locator(".beta-copy br")).toHaveCount(0);
  await expect(betaScreen.locator(".beta-brand-wordmark")).toHaveCount(1);
  await expect(betaScreen.locator(".beta-invitation .beta-brand-wordmark")).toHaveCount(1);
  const consentBlock = betaScreen.getByTestId("consent-block");
  await expect(consentBlock.getByRole("checkbox")).toBeVisible();
  await expect(consentBlock.getByText(/수집: 이메일/)).toBeVisible();
  expect(await consentBlock.locator(".privacy-details").evaluate((element) => getComputedStyle(element).marginLeft)).toBe("0px");
  const email = page.getByRole("textbox", { name: "이메일" });
  await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
  await expect(page.getByText("이메일을 입력해주세요.", { exact: true })).toBeVisible();
  await email.fill("잘못된주소");
  await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
  await expect(page.getByText("이메일 형식을 확인해주세요.", { exact: true })).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");

  await email.fill("hello@example.com");
  await email.focus();
  expect(await email.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
  await page.getByRole("checkbox", { name: /베타 초대용 이메일 수집·이용에 동의/ }).check();
  await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
  await expect(page.getByRole("heading", { name: "신청이 완료됐어요!" })).toBeVisible();
  const success = page.getByTestId("screen-success");
  await expect(success.getByRole("button", { name: "이전 화면" })).toBeVisible();
  await expect(success.getByTestId("success-character")).toHaveAttribute("src", /beta-success-mascot\.png/);
  await expect(success.getByText("무먹 베타 신청 완료", { exact: true })).toHaveCount(0);
  const successCopy = success.locator(":scope > p");
  const resetButton = success.getByRole("button", { name: "처음으로 돌아가기" });
  const [copyBox, resetBox] = await Promise.all([successCopy.boundingBox(), resetButton.boundingBox()]);
  expect((resetBox?.y ?? 0) - ((copyBox?.y ?? 0) + (copyBox?.height ?? 0))).toBeGreaterThanOrEqual(32);
  await page.getByRole("button", { name: "처음으로 돌아가기" }).click({ force: true });
  await expect(page.getByRole("heading", { name: "요리 전 1,420g → 요리 후 1,083g 그럼 내가 먹은 300g은 몇 kcal일까?" })).toBeVisible();
  await expect(page).toHaveTitle("무먹 집밥 기록 테스트");
});

test("핵심 흐름은 외부 네트워크 요청 없이 동작한다", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") externalRequests.push(request.url());
  });

  await openHero(page);
  await completeQuiz(page, "재료와 음식 무게까지 재서 기록");
  await expect(page.getByTestId("screen-result")).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("공유 결과 URL은 해당 결과 화면을 바로 연다", async ({ page }) => {
  await page.goto("/?result=%EB%88%88%EB%8C%80%EC%A4%91%20%EC%9E%A5%EC%9D%B8");
  await expect(page.getByTestId("screen-result")).toBeVisible();
  await expect(page.getByRole("heading", { name: "눈대중 장인" })).toBeVisible();
  await expect(page.getByTestId("result-character")).toHaveAttribute("src", /eyeballing-master\.png/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /눈대중 장인/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /칼로리는 과학/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-share\.png/);

  const resultAccent = page.getByRole("heading", { name: "눈대중 장인" }).locator("em");
  expect(await resultAccent.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(0, 161, 255)");
  await expect(page.getByTestId("result-quote-icon")).toBeVisible();
  expect(await page.getByTestId("result-quote-icon").evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  await expect(page.getByTestId("result-quote-lines").locator("span")).toHaveCount(2);
});

test("공유 버튼은 유형명·카피·결과 URL을 native share에 전달한다", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload: ShareData) => {
        (window as typeof window & { __sharePayload?: ShareData }).__sharePayload = payload;
      },
    });
  });
  await page.goto("/?result=%EB%88%88%EB%8C%80%EC%A4%91%20%EC%9E%A5%EC%9D%B8");
  await page.getByRole("button", { name: "내 결과 공유하기" }).click();
  const payload = await page.evaluate(() => (window as typeof window & { __sharePayload?: ShareData }).__sharePayload);
  expect(payload?.title).toContain("눈대중 장인");
  expect(payload?.text).toContain("칼로리는 과학");
  expect(payload?.url).toContain("result=");
});

test("모바일 핵심 버튼은 44px 이상이며 가로 넘침이 없다", async ({ page }) => {
  await openHero(page);
  await page.getByRole("button", { name: "테스트 시작하기" }).click();

  const optionSizes = await page.locator("[data-testid='quiz-option']").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );

  expect(optionSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  const overflow = await page.getByTestId("device-screen").evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("모션 감소 환경에서도 설문과 체험 전환이 완료된다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHero(page);
  await completeQuiz(page, "먹은 양을 눈대중으로 기록");
  await expect(page.getByTestId("screen-result")).toBeVisible();

  await page.getByRole("button", { name: "무먹으로 20초 체험하기" }).click();
  await page.getByRole("button", { name: "무먹으로 가져오기" }).click();
  await expect(page.getByTestId("screen-demo-2")).toBeVisible();
});

test("Pixel 10에서도 첫 화면과 설문이 넘치지 않는다", async ({ page }) => {
  await openHero(page);
  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  expect(screenBox?.width).toBeCloseTo(427, 0);
  expect(screenBox?.height).toBeCloseTo(952, 0);
  await expect(page.getByRole("heading", { name: defaultHero })).toBeVisible();
  await page.getByRole("button", { name: "테스트 시작하기" }).click();
  await expect(page.getByTestId("screen-question-1")).toBeVisible();
  const overflow = await page.getByTestId("device-screen").evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
