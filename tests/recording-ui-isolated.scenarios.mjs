import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Real recording page/API/disposable DB. Only the challenge provider and OS share destination are fixtures. */
export async function runRecordingUiScenarios({ browser, origin, sql, fixture, artifacts }) {
  const route = '/api/v1/marketing/round2';
  const answers = { q1: 'daily', q2: '3_5', q3: 'track', q4: 'search' };
  const resultTitles = {
    'homecook-passer': '집밥 패스형', 'eyeballing-master': '눈대중 장인',
    'ingredient-tracker': '성분 추적러', 'pro-measurer': '프로 계량러',
  };
  const checks = [], requests = [], responses = [], screenshots = [], geometry = [];
  const externalRequests = [], legacyRequests = [], pageErrors = [], responseTasks = [];
  let context, page, caseId = 'recording-normal', releaseSurveyAck;
  let heldSurveyResponse = null;
  let holdSurveyAck = false;
  let loseSurveyAck = false;
  let lostSurveyResponse = null;
  let failureAt = null;

  const uuid = value => {
    // Database interpolation accepts only a server-issued UUID, never arbitrary browser input.
    expect(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)).toBe(true);
    return value;
  };
  const countRequests = (action, activity) => requests.filter(item => item.caseId === caseId && item.action === action && (!activity || item.activity === activity)).length;
  const stage = name => page.locator(`main[data-stage="${name}"]`);
  const button = name => page.getByRole('button', { name, exact: true });
  async function visibleInViewport(locator, name) {
    let bounds;
    try {
      await expect(locator).toBeVisible();
      await expect.poll(async () => {
        bounds = await locator.evaluate(element => {
          const rect = element.getBoundingClientRect();
          let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
          let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
          let visibleStyle = true;
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            visibleStyle &&= style.visibility === 'visible' && Number(style.opacity) > 0 && style.display !== 'none';
            if (ancestor === element) continue;
            const box = ancestor.getBoundingClientRect();
            if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
            if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
          }
          const intersectsViewport = right > left && bottom > top;
          // Fractional layout rounding is tolerated; actual clipping and hit testing remain mandatory.
          const insideViewport = rect.top >= -0.5 && rect.bottom <= innerHeight + 0.5 && rect.left >= -0.5 && rect.right <= innerWidth + 0.5;
          const hit = intersectsViewport ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : null;
          return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight, intersectsViewport, insideViewport, visibleStyle, hitVisible: !!hit && (element === hit || element.contains(hit)) };
        });
        return { intersectsViewport: bounds.intersectsViewport, insideViewport: bounds.insideViewport, visibleStyle: bounds.visibleStyle, hitVisible: bounds.hitVisible };
      }).toEqual({ intersectsViewport: true, insideViewport: true, visibleStyle: true, hitVisible: true });
    } finally {
      geometry.push({ caseId, name, ...(bounds ?? { measurementUnavailable: true }) });
    }
  }
  async function capture(name) {
    const file = `${caseId}-${name}.png`;
    await page.screenshot({ path: join(artifacts, file), fullPage: true, mask: [page.locator('input[type="email"]')] });
    screenshots.push(file);
    const bounds = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth }));
    geometry.push({ caseId, name, ...bounds });
    expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.width);
  }
  async function fresh(nextCase) {
    await context?.close();
    caseId = nextCase;
    // The runner owns this disposable namespace. Reset only its counters between closed browser cases.
    await writeFile(join(fixture, 'rate/state.json'), JSON.stringify({ version: 1, counters: {} }), { mode: 0o600 });
    context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(20000);
    context.setDefaultNavigationTimeout(60000);
    await context.addInitScript(() => {
      // Next's development-only badge is not product UI and must not obscure a real retry button.
      const hideDevTools = () => {
        if (!document.head) return false;
        const style = document.createElement('style');
        style.dataset.recordingFixture = 'hide-next-devtools-only';
        style.textContent = 'nextjs-portal { display: none !important; }';
        document.head.append(style);
        return true;
      };
      if (!hideDevTools()) {
        const observer = new MutationObserver(() => { if (hideDevTools()) observer.disconnect(); });
        observer.observe(document, { childList: true, subtree: true });
      }
      window.turnstile = {
        render: (_node, options) => { setTimeout(() => options.callback(options.action), 0); return 'isolated-recording-widget'; },
        reset: () => {}, remove: () => {},
      };
      // Capture the actual UI-generated URL without invoking an operating-system share sheet.
      Object.defineProperty(navigator, 'share', { configurable: true, value: async value => { window.__recordingSharedUrl = value.url; } });
    });
    await context.route('**/*', async intercepted => {
      const request = intercepted.request();
      const url = new URL(request.url());
      if (url.origin !== origin) { externalRequests.push({ caseId, origin: url.origin, path: url.pathname }); await intercepted.abort(); return; }
      if (url.pathname === route && request.method() === 'POST' && holdSurveyAck) {
        const body = request.postDataJSON();
        if (body.action === 'activity_start' && body.activity === 'survey') {
          holdSurveyAck = false;
          const released = new Promise(resolve => { releaseSurveyAck = resolve; });
          // Commit through the actual API, withholding only its unmodified response from the UI.
          const actual = await intercepted.fetch();
          heldSurveyResponse = { status: actual.status() };
          await released;
          await intercepted.fulfill({ response: actual });
          return;
        }
      }
      if (url.pathname === route && request.method() === 'POST' && loseSurveyAck) {
        const body = request.postDataJSON();
        if (body.action === 'activity_start' && body.activity === 'survey') {
          loseSurveyAck = false;
          // The real API commits first. Only delivery to this browser is deliberately lost.
          const actual = await intercepted.fetch();
          const envelope = await actual.json();
          lostSurveyResponse = { status: actual.status(), eventId: body.event_id, participationId: envelope.data?.participation_id };
          await intercepted.abort('failed');
          return;
        }
      }
      await intercepted.continue();
    });
    page = await context.newPage();
    page.on('pageerror', () => pageErrors.push({ caseId, kind: 'uncaught-browser-error' }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'POST') return;
      if (url.pathname.startsWith('/api/') && url.pathname !== route) legacyRequests.push({ caseId, path: url.pathname });
      if (url.pathname !== route) return;
      const body = request.postDataJSON();
      // Never persist capabilities, request bodies, email, consent, or provider tokens in evidence.
      requests.push({ caseId, action: body.action, activity: body.activity, topic: body.topic, surveyVersion: body.survey_version });
    });
    page.on('response', response => {
      if (response.url() !== origin + route || response.request().method() !== 'POST') return;
      const responseCase = caseId;
      responseTasks.push((async () => {
        try {
          const body = await response.json();
          const request = response.request().postDataJSON();
          responses.push({ caseId: responseCase, action: request.action, activity: request.activity, status: response.status(), error: body.error?.code ?? null });
        } catch { responses.push({ caseId: responseCase, status: response.status(), error: 'unreadable-response' }); }
      })());
    });
  }
  function responseFor(action, activity) {
    return page.waitForResponse(response => {
      if (response.url() !== origin + route || response.request().method() !== 'POST') return false;
      const body = response.request().postDataJSON();
      return body.action === action && (!activity || body.activity === activity);
    }, { timeout: 60000 });
  }
  async function acknowledge(response, expectedTopic = 'recording') {
    expect(response.status()).toBe(200);
    const envelope = await response.json();
    const request = response.request().postDataJSON();
    expect(envelope.success).toBe(true);
    expect(envelope.data.event_id).toBe(request.event_id);
    expect(envelope.data.topic).toBe(expectedTopic);
    expect(envelope.data.round_version).toBe('r2.1');
    uuid(envelope.data.participation_id);
    return { request, data: envelope.data };
  }
  async function clickAndAcknowledge(name, action, activity, topic = 'recording') {
    const pending = responseFor(action, activity);
    await button(name).click();
    return acknowledge(await pending, topic);
  }
  async function nextStage(name, next) {
    await button(name).click();
    await expect(stage(next)).toBeVisible();
    await capture(next);
  }
  const eventCount = (id, action, activity) => Number(sql(`select count(*) from public.marketing_round2_events where participation_id='${uuid(id)}' and action='${action}'${activity ? ` and activity='${activity}'` : ''}`));
  async function writeSummary(result) {
    await Promise.allSettled(responseTasks);
    const summary = { result, checks, screenshots, geometry, requests, responses, externalRequests, legacyRequests, pageErrors, failureAt, devToolsOverlayHidden: true, viewportRoundingTolerancePx: 0.5, scope: 'recording r2.2 actual UI/API/DB; provider and OS share destination are fixtures; Next development overlay hidden in fixture only; no live provider or device certification' };
    await writeFile(join(artifacts, 'recording-ui-summary.json'), JSON.stringify(summary, null, 2));
    return summary;
  }

  try {
    await fresh('recording-normal');
    // Read-only compilation warmup, no synthetic POST and no database bypass.
    expect((await context.request.get(origin + route)).status()).toBe(405);
    const bootstrapped = responseFor('bootstrap');
    expect((await page.goto(`${origin}/beta/r2/recording`)).status()).toBe(200);
    await expect(stage('question-1')).toBeVisible();
    const { data: bootstrap } = await acknowledge(await bootstrapped);
    const id = bootstrap.participation_id;
    await button('거의 매일').focus();
    expect(countRequests('activity_start', 'survey')).toBe(0);
    expect(sql(`select survey_started_at is null from public.marketing_round2_participations where id='${id}'`)).toBe('t');
    await capture('question-1-390');
    for (const [width, height] of [[320, 568], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      await capture(`question-1-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    checks.push('Q1 render, bootstrap, focus and 320/390/1280 resize: survey start 0 and no horizontal overflow');

    holdSurveyAck = true;
    const started = responseFor('activity_start', 'survey');
    await button('거의 매일').click();
    await expect.poll(() => heldSurveyResponse?.status).toBe(200);
    await expect(stage('question-1')).toBeVisible();
    // Busy content is intentionally inert, so inspect its retained DOM rather than the accessibility tree.
    await expect(stage('question-1').locator('.choice-button[aria-pressed="true"]')).toHaveText('거의 매일');
    expect(countRequests('activity_start', 'survey')).toBe(1);
    releaseSurveyAck();
    await acknowledge(await started);
    await expect(stage('question-2')).toBeVisible();
    expect(eventCount(id, 'activity_start', 'survey')).toBe(1);
    await capture('question-2');
    checks.push('First real answer preserves Q1 until actual activity_start 200; exactly one survey start before Q2');
    await expect(page.getByText('직접 만들거나 가족이 만든 음식 모두 포함', { exact: true })).toBeVisible();
    await nextStage('3~5끼', 'question-3');
    await page.reload();
    await expect(stage('question-3')).toBeVisible();
    expect(countRequests('activity_start', 'survey')).toBe(1);
    expect(eventCount(id, 'activity_start', 'survey')).toBe(1);
    await capture('question-3-restored');
    checks.push('Q2 answer survives real page reload into Q3; existing survey start is not duplicated');
    await nextStage('딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록', 'question-4');
    const survey = await clickAndAcknowledge('딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것', 'survey_submit');
    expect(survey.request.survey_version).toBe('r2.2-recording');
    expect(survey.request.answers).toEqual(answers);
    expect(survey.data.state.survey).toBe('completed');
    expect(['answers', 'survey_version', 'result'].some(key => Object.hasOwn(survey.data, key))).toBe(false);
    await expect(stage('result')).toBeVisible();
    await expect(page.getByRole('heading', { name: '성분 추적러', exact: true })).toBeVisible();
    expect(JSON.parse(sql(`select json_build_object('version',survey_version,'answers',answers,'submitted',survey_submitted_at is not null) from public.marketing_round2_participations where id='${id}'`))).toEqual({ version: 'r2.2-recording', answers, submitted: true });
    expect(eventCount(id, 'survey_submit')).toBe(1);
    expect(countRequests('survey_submit')).toBe(1);
    await capture('result');
    checks.push('Q4 actual request and committed DB preserve exact r2.2-recording tuple; Q3 track result follows ACK, submission count 1');
    await page.reload();
    await expect(stage('result')).toBeVisible();
    await expect(page.getByRole('heading', { name: '성분 추적러', exact: true })).toBeVisible();
    expect(countRequests('survey_submit')).toBe(1);
    expect(eventCount(id, 'survey_submit')).toBe(1);
    await capture('result-restored');
    checks.push('Confirmed original answer tuple restores the same result after reload without survey resubmission');

    await clickAndAcknowledge('무먹 체험하기', 'activity_start', 'example');
    await expect(stage('experience-1')).toBeVisible();
    await button('무먹으로 가져오기').click();
    await expect(button('다음')).toBeEnabled();
    await capture('experience-1');
    await nextStage('다음', 'experience-2');
    await button('돼지고기 600g → 520g').click();
    await expect(page.getByTestId('pork-amount')).toHaveText('520g');
    await nextStage('다음', 'experience-3');
    await button('저울로 재보니 1,180g').click();
    await expect(page.getByTestId('cooked-weight-metric')).toHaveText('1,180g');
    await nextStage('다음', 'experience-4');
    await nextStage('320g 입력하기', 'experience-5');
    expect(eventCount(id, 'example_complete')).toBe(0);
    await nextStage('식단에 기록하기', 'planner-homecook');
    expect(countRequests('example_complete')).toBe(0);
    expect(eventCount(id, 'example_complete')).toBe(0);
    await nextStage('편의점 음식도 기록해보기', 'packaged-food');
    await nextStage('+ 기록하기', 'planner-complete');
    expect(eventCount(id, 'example_complete')).toBe(0);
    checks.push('Five experience scenes, planner and packaged food remain examples; step 5 and payoff render send no example_complete');

    const example = await clickAndAcknowledge('무료 베타 먼저 써보기', 'example_complete');
    expect(example.data.state.example).toBe('completed');
    await expect(stage('beta-form')).toBeVisible();
    expect(countRequests('example_complete')).toBe(1);
    expect(eventCount(id, 'example_complete')).toBe(1);
    expect(eventCount(id, 'activity_start', 'lead')).toBe(1);
    expect(sql(`select e.revision < l.revision from public.marketing_round2_events e join public.marketing_round2_events l using(participation_id) where e.participation_id='${id}' and e.action='example_complete' and l.action='activity_start' and l.activity='lead'`)).toBe('t');
    await capture('lead');
    checks.push('Only final payoff action completes example; actual committed completion precedes lead start');
    await page.getByLabel('이메일', { exact: true }).fill('recording-preview@example.com');
    await page.getByRole('checkbox').check();
    const lead = await clickAndAcknowledge('무료 베타 초대받기', 'lead_submit');
    expect(lead.data.receipt?.status).toBe('received');
    expect(lead.data.receipt?.event_id).toBe(lead.request.event_id);
    await expect(stage('done')).toBeVisible();
    expect(sql(`select lead_completed_at is not null from public.marketing_round2_participations where id='${id}'`)).toBe('t');
    expect(sql(`select count(*) from public.marketing_round2_lead_requests where participation_id='${id}' and request_id='${uuid(lead.request.event_id)}' and turnstile_verified_at is not null`)).toBe('1');
    await capture('done');
    await page.reload();
    await expect(stage('done')).toBeVisible();
    await expect(page.getByLabel('이메일', { exact: true })).toHaveCount(0);
    expect(countRequests('lead_submit')).toBe(1);
    checks.push('Fixture challenge passes actual lead API and DB receipt; reload preserves done without requesting email or resubmitting');

    for (const [result, title] of Object.entries(resultTitles)) {
      await fresh(`recording-shared-${result}`);
      expect((await page.goto(`${origin}/beta/r2/recording?result=${result}&utm_source=ig&unknown=discard`)).status()).toBe(200);
      await expect(stage('result')).toBeVisible();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByText('공유된 결과 · 읽기 전용', { exact: true })).toBeVisible();
      await button('내 결과 공유하기').click();
      await expect.poll(() => page.evaluate(() => window.__recordingSharedUrl ?? null)).toBe(`${origin}/beta/r2/recording?result=${result}`);
      expect(requests.filter(item => item.caseId === caseId)).toHaveLength(0);
      await capture('readonly');
      if (result === 'pro-measurer') {
        await button('나도 테스트하기').click();
        await expect(stage('question-1')).toBeVisible();
        await button('거의 매일').focus();
        expect(countRequests('activity_start', 'survey')).toBe(0);
        await capture('explicit-test-question-1');
        checks.push('Shared result explicit test enters Q1 with survey start 0');
      }
      checks.push(`${result} shared result: correct read-only type, POST/bootstrap 0, generated share URL has result only`);
    }
    checks.push('Prepared recording experience scenes omit the repeated beta-preparation footer');

    await fresh('recording-start-recovery');
    const recoveryBootstrap = responseFor('bootstrap');
    expect((await page.goto(`${origin}/beta/r2/recording`)).status()).toBe(200);
    await expect(stage('question-1')).toBeVisible();
    const { data: recovery } = await acknowledge(await recoveryBootstrap);
    loseSurveyAck = true;
    await button('거의 매일').click();
    await expect.poll(() => lostSurveyResponse?.status).toBe(200);
    expect(lostSurveyResponse.participationId).toBe(recovery.participation_id);
    const recoveryAlert = page.locator('.mdv2-root').getByRole('alert');
    await expect(recoveryAlert).toBeVisible();
    await expect(stage('question-1')).toBeVisible();
    await expect(stage('question-1').locator('.choice-button[aria-pressed="true"]')).toHaveText('거의 매일');
    expect(eventCount(recovery.participation_id, 'activity_start', 'survey')).toBe(1);
    for (const [width, height] of [[390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await visibleInViewport(recoveryAlert, `start-recovery-alert-${width}`);
      await visibleInViewport(button('다시 시도'), `start-recovery-retry-${width}`);
      const questionBounds = await stage('question-1').evaluate(element => ({
        headingBottom: element.querySelector('h2').getBoundingClientRect().bottom,
        firstAnswerTop: element.querySelector('.choice-button').getBoundingClientRect().top,
      }));
      expect(questionBounds.headingBottom).toBeLessThanOrEqual(questionBounds.firstAnswerTop);
      await capture(`start-recovery-${width}`);
    }
    expect(countRequests('activity_start', 'survey')).toBe(1);
    const retried = await clickAndAcknowledge('다시 시도', 'activity_start', 'survey');
    expect(retried.request.event_id).toBe(lostSurveyResponse.eventId);
    expect(retried.data.state.survey).toBe('started');
    await expect(stage('question-2')).toBeVisible();
    expect(countRequests('activity_start', 'survey')).toBe(2);
    expect(eventCount(recovery.participation_id, 'activity_start', 'survey')).toBe(1);
    await capture('retried-question-2');
    checks.push('Lost actual start ACK preserves Q1; 320/390 error and retry are visibly inside viewport; explicit same-event retry reaches Q2 with one committed start');

    // One normal homeflow case closes the other real landing; no additional recovery/design matrix.
    await fresh('homeflow-normal');
    const homeflowBootstrap = responseFor('bootstrap');
    expect((await page.goto(`${origin}/beta/r2/homeflow`)).status()).toBe(200);
    await expect(page.locator('[data-homeflow-main] [data-screen="hero"]')).toBeVisible();
    const { data: homeflow } = await acknowledge(await homeflowBootstrap, 'homeflow');
    const homeflowId = homeflow.participation_id;
    const homeflowAnswers = { q1: 'one_two', q2: 'once', q3: 'mental', q4: 'shopping' };
    await capture('hero');
    await clickAndAcknowledge('4문항 테스트하기', 'activity_start', 'survey', 'homeflow');
    for (const answer of ['1~2일', '1회', '미리 정하고 머릿속에 기억']) await button(answer).click();
    const homeflowSurvey = await clickAndAcknowledge('집에 있는 재료 빼고 장보기 목록 만들기', 'survey_submit', undefined, 'homeflow');
    expect(homeflowSurvey.request.survey_version).toBe('r2.2-homeflow');
    expect(homeflowSurvey.request.answers).toEqual(homeflowAnswers);
    await expect(page.getByRole('heading', { name: '머릿속 플래너형', exact: true })).toBeVisible();
    expect(JSON.parse(sql(`select json_build_object('version',survey_version,'answers',answers) from public.marketing_round2_participations where id='${homeflowId}'`))).toEqual({ version: 'r2.2-homeflow', answers: homeflowAnswers });
    await capture('result');
    await clickAndAcknowledge('무먹 체험하기', 'activity_start', 'example', 'homeflow');
    await page.getByRole('button', { name: /요리 계획에 추가하기/ }).click();
    await page.getByRole('button', { name: /장보기 목록 만들기/ }).click();
    for (const name of ['삼겹살', '대파', '잘 익은 김치', '즉석밥', '버터', '계란']) {
      const checkbox = page.getByRole('checkbox', { name: `${name} 구매`, exact: true });
      if (!await checkbox.isChecked()) await checkbox.check();
    }
    await page.getByRole('button', { name: /체크하고 장보기 완료하기/ }).click();
    await page.getByRole('button', { name: /요리하기/ }).click();
    await button('요리완료! 식단기록하기').click();
    await expect(page.getByText('300g · 608 kcal', { exact: true })).toBeVisible();
    expect(eventCount(homeflowId, 'example_complete')).toBe(0);
    await capture('sixth-experience');
    await clickAndAcknowledge('무료 베타 초대받기', 'example_complete', undefined, 'homeflow');
    await expect(page.getByRole('textbox', { name: '이메일 주소', exact: true })).toBeVisible();
    expect(eventCount(homeflowId, 'example_complete')).toBe(1);
    expect(eventCount(homeflowId, 'activity_start', 'lead')).toBe(1);
    await page.getByRole('textbox', { name: '이메일 주소', exact: true }).fill('homeflow-preview@example.com');
    await page.getByRole('checkbox', { name: /이메일 수집·이용에 동의/ }).check();
    const homeflowLead = await clickAndAcknowledge('베타오픈 신청하기', 'lead_submit', undefined, 'homeflow');
    expect(homeflowLead.data.receipt).toEqual({ status: 'received', event_id: homeflowLead.request.event_id });
    await expect(page.getByRole('heading', { name: '신청이 완료됐어요!', exact: true })).toBeVisible();
    expect(sql(`select lead_completed_at is not null from public.marketing_round2_participations where id='${homeflowId}'`)).toBe('t');
    expect(sql(`select count(*) from public.marketing_round2_lead_requests where participation_id='${homeflowId}' and request_id='${uuid(homeflowLead.request.event_id)}' and turnstile_verified_at is not null`)).toBe('1');
    expect(countRequests('survey_submit')).toBe(1);
    expect(countRequests('lead_submit')).toBe(1);
    await capture('done');
    checks.push('Homeflow normal 390px: real Hero → four r2.2 answers → Q3 result → six experiences → lead/receipt, exact answers and one submission committed to actual DB');
    await Promise.allSettled(responseTasks);
    expect(externalRequests).toEqual([]);
    expect(legacyRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(responses.every(item => item.status === 200 && !item.error)).toBe(true);
    checks.push('Actual recording browser flow: external requests 0, other/legacy API POST 0, uncaught page errors 0');
    return await writeSummary('PASS');
  } catch (error) {
    // Only source locations are retained; assertion messages may contain private DOM values.
    failureAt = String(error?.stack ?? '').match(/recording-ui-isolated\.scenarios\.mjs:\d+:\d+/g) ?? [];
    releaseSurveyAck?.();
    if (page && !page.isClosed()) {
      // Do not save HTML, tracing request bodies, browser storage, or unredacted email on failure.
      const file = `${caseId}-failure.png`;
      try { await page.screenshot({ path: join(artifacts, file), fullPage: true, mask: [page.locator('input[type="email"]')] }); screenshots.push(file); } catch { /* A closed/crashed page still has redacted request metadata. */ }
    }
    await writeSummary('FAIL');
    throw error;
  } finally {
    releaseSurveyAck?.();
    await context?.close();
  }
}
