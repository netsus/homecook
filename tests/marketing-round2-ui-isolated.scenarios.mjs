import { expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertRecoveryZoomCombinations } from './helpers/marketing-round2-recovery-evidence.mjs';

/** Browser clicks use real Next pages, API and disposable DB. Only the challenge provider is mocked. */
export async function runRealUiScenarios({ browser, origin, sql, fixture, artifacts, recoveryOnly = false, recoveryZoom = false }) {
  const checks = []; const envelopes = []; const externalRequests = []; const recoveryScreenshots = []; let pageErrors = []; let apiWarmed = false;
  const recoveryZoomGeometry = [];
  const route = '/api/v1/marketing/round2';
  const labels = { example: '사용 예시 먼저 보기', survey: '의견만 남기기 · 4문항', lead: '베타 오픈 알림 받기' };
  const completedLabels = { example: '사용 예시 다시 보기', survey: '의견 접수 확인', lead: '알림 접수 확인' };
  const orders = [['example', 'survey', 'lead'], ['example', 'lead', 'survey'], ['survey', 'example', 'lead'], ['survey', 'lead', 'example'], ['lead', 'example', 'survey'], ['lead', 'survey', 'example']];
  let context; let page;
  async function fresh() {
    await context?.close();
    // Independent test case boundary, no browser or request remains. Reset only this owned fixture's counters.
    await writeFile(join(fixture, 'rate/state.json'), JSON.stringify({ version: 1, counters: {} }), { mode: 0o600 });
    context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(60000);
    if (!apiWarmed) {
      // Compile the real route using its read-only method rejection, not a synthetic POST or test bypass.
      expect((await context.request.get(origin + route)).status()).toBe(405);
      apiWarmed = true;
    }
    await context.addInitScript(() => {
      window.turnstile = { render: (_node, options) => { setTimeout(() => options.callback(options.action), 0); return 'isolated-widget'; }, reset: () => {}, remove: () => {} };
    });
    await context.route('**/*', async intercepted => {
      const url = new URL(intercepted.request().url());
      if (url.origin !== origin) { externalRequests.push(url.origin + url.pathname); await intercepted.abort(); return; }
      await intercepted.continue();
    });
    context.on('page', current => {
      current.on('pageerror', error => pageErrors.push(error.message));
      current.on('response', async response => {
        if (response.url() !== origin + route) return;
        try { const result = await response.json(); const request = response.request().postDataJSON(); envelopes.push({ action: request.action, topic: request.topic, bootstrapIntent: request.bootstrap_intent, status: response.status(), data: result.data, error: result.error?.code }); } catch { /* aborted response is explicitly tested */ }
      });
    });
    page = await context.newPage();
  }
  async function captureRecovery(topic) {
    await expect(page.locator(`[data-screen-id="R2_${topic.toUpperCase()}_RECOVERY"]`)).toBeVisible();
    const originalSavingLabel = topic === 'recording' ? '베타 오픈 알림 신청하기' : '예시 확인 완료';
    await expect(page.getByRole('button', { name: originalSavingLabel, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toBeVisible();
    const normalRootSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const normalRecoveryTextSize = await page.locator('[data-screen-id$="_RECOVERY"] p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    const zoomStyle = recoveryZoom ? await page.addStyleTag({ content: 'html { font-size: 200% !important; }' }) : null;
    for (const [width, height] of [[320, 568], [390, 844], [393, 852], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      const file = `R2_${topic.toUpperCase()}_RECOVERY-${width}x${height}${recoveryZoom ? '-200percent' : ''}.png`;
      if (recoveryZoom) {
        const recovery = page.locator(`[data-screen-id="R2_${topic.toUpperCase()}_RECOVERY"]`);
        const retry = recovery.getByRole('button', { name: '다시 시도', exact: true });
        await retry.scrollIntoViewIfNeeded();
        const geometry = await page.locator('main').evaluate(main => {
          const clippedText = [];
          const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const text = walker.currentNode;
            if (!text.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(text);
            if (!range.getClientRects().length) continue;
            const bounds = range.getBoundingClientRect();
            for (let parent = text.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              const style = getComputedStyle(parent); const rect = parent.getBoundingClientRect();
              const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX);
              const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY);
              const x = clipX ? Math.max(0, rect.left - bounds.left, bounds.right - rect.right) : 0;
              const y = clipY ? Math.max(0, rect.top - bounds.top, bounds.bottom - rect.bottom) : 0;
              if (x > 0 || y > 0) clippedText.push({ element: parent.tagName, text: text.textContent, x, y });
              if (parent === main) break;
            }
          }
          return { viewport: { width: innerWidth, height: innerHeight }, pageWidth: document.documentElement.scrollWidth, rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize), recoveryTextSize: parseFloat(getComputedStyle(main.querySelector('[data-screen-id$="_RECOVERY"] p')).fontSize), clippedText };
        });
        const button = await retry.evaluate(element => {
          const r = element.getBoundingClientRect();
          const hit = y => { const target = document.elementFromPoint(r.left + r.width / 2, y); return element === target || element.contains(target); };
          return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, centerHit: hit(r.top + r.height / 2), lowerHit: hit(r.bottom - 4) };
        });
        const state = topic === 'recording'
          ? { emailPreserved: await page.getByLabel('이메일', { exact: true }).inputValue() === 'preview@example.com', consentCleared: !await page.getByRole('checkbox').isChecked() }
          : { lastScenePreserved: await page.getByText('사용 예시 3/3', { exact: true }).count() === 1, prematureDoneAbsent: await page.locator('[data-screen-id="R2_HOMEFLOW_EXAMPLE_DONE"]').count() === 0 };
        recoveryZoomGeometry.push({ topic, condition: topic === 'recording' ? 'actual-409-consent-refresh' : 'actual-commit-response-loss', normalRootSize, normalRecoveryTextSize, ...geometry, retryButton: button, inputOrScene: state, fullPageScreenshot: file, viewportScreenshot: file.replace('.png', '-cta-viewport.png') });
        await writeFile(join(artifacts, 'recovery-zoom-geometry.json'), JSON.stringify(recoveryZoomGeometry, null, 2));
        await page.screenshot({ path: join(artifacts, file.replace('.png', '-cta-viewport.png')), fullPage: false });
        expect(geometry.rootFontSize).toBe(normalRootSize * 2);
        expect(geometry.recoveryTextSize).toBe(normalRecoveryTextSize * 2);
        expect(geometry.pageWidth).toBeLessThanOrEqual(width);
        expect(geometry.clippedText).toEqual([]);
        expect(button.top).toBeGreaterThanOrEqual(0); expect(button.bottom).toBeLessThanOrEqual(height);
        expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.centerHit).toBe(true); expect(button.lowerHit).toBe(true);
        expect(Object.values(state).every(Boolean)).toBe(true);
      }
      // Diagnostic capture of an injected API failure, requested by the Stage4 coordinator.
      await page.screenshot({ path: join(artifacts, file), fullPage: true });
      recoveryScreenshots.push(file);
    }
    await zoomStyle?.evaluate(element => element.remove());
    await page.setViewportSize({ width: 390, height: 844 });
  }
  async function open(topic, current = page) {
    const response = await current.goto(`${origin}/beta/r2/${topic}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    // Development compilation is not a page-performance measurement.
    await expect(current.getByText('아직 완료한 활동이 없어요', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(await current.getByText('로컬 미리보기 · 저장되지 않아요', { exact: true }).count()).toBe(0);
  }
  async function complete(topic, activity, current = page) {
    let completion;
    async function submit(button, action) {
      const pending = current.waitForResponse(response => response.url() === origin + route && response.request().postDataJSON().action === action);
      await button.click();
      const response = await pending; expect(response.status()).toBe(200);
      const body = await response.json();
      await expect.poll(() => envelopes.some(item => item.data?.event_id === body.data.event_id)).toBe(true);
      return body.data;
    }
    await current.getByRole('button', { name: labels[activity], exact: true }).click();
    if (activity === 'example') {
      await current.getByRole('button', { name: '다음 장면', exact: true }).click();
      await current.getByRole('button', { name: '다음 장면', exact: true }).click();
      const before = envelopes.length;
      completion = await submit(current.getByRole('button', { name: '예시 확인 완료', exact: true }), 'example_complete');
      await expect(current.locator(`[data-screen-id="R2_${topic.toUpperCase()}_EXAMPLE_DONE"]`)).toBeVisible();
      expect(envelopes.slice(before).some(item => item.action === 'example_complete' && item.status === 200)).toBe(true);
    } else if (activity === 'survey') {
      for (let i = 0; i < 4; i++) {
        await current.getByRole('radio').last().check();
        if (i === 3) completion = await submit(current.getByRole('button', { name: '의견 보내기', exact: true }), 'survey_submit');
        else await current.getByRole('button', { name: '다음 문항', exact: true }).click();
      }
      await expect(current.locator(`[data-screen-id="R2_${topic.toUpperCase()}_SURVEY_DONE"]`)).toBeVisible();
    } else {
      await current.getByLabel('이메일', { exact: true }).fill('preview@example.com');
      await current.getByRole('checkbox').check();
      completion = await submit(current.getByRole('button', { name: '베타 오픈 알림 신청하기', exact: true }), 'lead_submit');
      await expect(current.locator(`[data-screen-id="R2_${topic.toUpperCase()}_LEAD_DONE"]`)).toBeVisible();
      expect(completion.receipt.status).toBe('received');
    }
    // State is measured from committed DB, not from the UI's own local state.
    const completionColumn = activity === 'survey' ? 'survey_submitted_at' : `${activity}_completed_at`;
    expect(sql(`select ${completionColumn} is not null from public.marketing_round2_participations where id='${completion.participation_id}'`)).toBe('t');
    const returned = current.waitForResponse(response => response.url() === origin + route && response.request().postDataJSON().action === 'menu_return');
    await current.getByRole('button', { name: '메뉴로 돌아가기', exact: true }).click();
    const returnedResponse = await returned; expect(returnedResponse.status()).toBe(200); await returnedResponse.finished();
    await expect(current.getByRole('button', { name: new RegExp(completedLabels[activity]) })).toBeVisible();
  }
  try {
    if (!recoveryOnly) {
    for (const topic of ['recording', 'homeflow']) {
      for (const activity of ['example', 'survey', 'lead']) {
        await fresh(); await open(topic); await complete(topic, activity);
        const id = envelopes.filter(item => item.topic === topic && item.status === 200).at(-1).data.participation_id;
        await page.reload();
        await expect(page.getByRole('button', { name: new RegExp(completedLabels[activity]) })).toBeVisible();
        const state = JSON.parse(sql(`select json_build_object('example',example_completed_at is not null,'survey',survey_submitted_at is not null,'lead',lead_completed_at is not null) from public.marketing_round2_participations where id='${id}'`));
        expect(Object.values(state).filter(Boolean)).toHaveLength(1);
        checks.push(`${topic} ${activity} solo, actual receipt/DB and reload`); console.warn(JSON.stringify({ check: checks.at(-1) }));
      }
      for (const order of orders) {
        await fresh(); await open(topic);
        for (const activity of order) await complete(topic, activity);
        await page.reload();
        for (const activity of order) await expect(page.getByRole('button', { name: new RegExp(completedLabels[activity]) })).toBeVisible();
        checks.push(`${topic} order ${order.join('→')} real DB`); console.warn(JSON.stringify({ check: checks.at(-1) }));
      }
    }
    await fresh(); await open('recording'); await complete('recording', 'example');
    const recordingId = envelopes.filter(item => item.topic === 'recording' && item.status === 200).at(-1).data.participation_id;
    const second = await context.newPage(); await second.goto(`${origin}/beta/r2/recording`);
    await expect(second.getByRole('button', { name: /사용 예시 다시 보기/ })).toBeVisible();
    await complete('recording', 'survey', second);
    await page.reload(); await expect(page.getByRole('button', { name: /의견 접수 확인/ })).toBeVisible();
    await open('homeflow'); await complete('homeflow', 'example');
    await page.goto(`${origin}/beta/r2/recording`); await expect(page.getByRole('button', { name: /사용 예시 다시 보기/ })).toBeVisible();
    const cookies = await context.cookies(origin + route);
    expect(cookies.filter(cookie => /^__Secure-mumeok_r2_/.test(cookie.name))).toHaveLength(2);
    expect(sql(`select count(*) from public.marketing_round2_participations where id='${recordingId}'`)).toBe('1');
    checks.push('two tabs, two topics, cookies and confirmed completions preserved');
    const otherCookie = cookies.find(cookie => cookie.name === '__Secure-mumeok_r2_homeflow').value;
    await second.close();
    sql(`delete from public.marketing_round2_participations where id='${recordingId}'`);
    await page.reload();
    await expect(page.getByRole('button', { name: '새 참여 시작', exact: true })).toBeVisible();
    expect(envelopes.some(item => item.topic === 'recording' && item.status === 410)).toBe(true);
    await page.getByRole('button', { name: '새 참여 시작', exact: true }).click();
    await expect(page.getByText('아직 완료한 활동이 없어요', { exact: true })).toBeVisible();
    expect((await context.cookies(origin + route)).find(cookie => cookie.name === '__Secure-mumeok_r2_homeflow').value).toBe(otherCookie);
    checks.push('actual 410 after isolated participation deletion, explicit restart and other-topic cookie preserved');
    }

    await fresh(); await open('recording');
    await page.getByRole('button', { name: labels.lead, exact: true }).click();
    await page.getByLabel('이메일', { exact: true }).fill('preview@example.com');
    await page.getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: '베타 오픈 알림 신청하기', exact: true })).toBeEnabled();
    const control = JSON.parse(await readFile(join(fixture, 'control.json'), 'utf8'));
    // Quiescent fixture fence simulates operator consent-generation advance, without changing application code.
    await writeFile(join(fixture, 'control.json'), JSON.stringify({ ...control, consent_generation: control.consent_generation + 1 }), { mode: 0o600 });
    await page.getByRole('button', { name: '베타 오픈 알림 신청하기', exact: true }).click();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByLabel('이메일', { exact: true })).toHaveValue('preview@example.com');
    expect(envelopes.some(item => item.status === 409 && item.error === 'CONSENT_REFRESH_REQUIRED')).toBe(true);
    await captureRecovery('recording');
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.locator('[data-screen-id="R2_RECORDING_RECOVERY"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '베타 오픈 알림 신청하기', exact: true })).toBeEnabled();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '베타 오픈 알림 신청하기', exact: true }).click();
    await expect(page.locator('[data-screen-id="R2_RECORDING_LEAD_DONE"]')).toBeVisible();
    checks.push('actual 409 consent generation advance, email retained, fresh explicit consent and receipt');

    await fresh(); await open('homeflow');
    await page.getByRole('button', { name: labels.example, exact: true }).click();
    await page.getByRole('button', { name: '다음 장면', exact: true }).click();
    await page.getByRole('button', { name: '다음 장면', exact: true }).click();
    let discardedEvent; let discardOnce = true;
    await context.route(origin + route, async intercepted => {
      if (discardOnce && intercepted.request().postDataJSON().action === 'example_complete') {
        discardOnce = false; discardedEvent = intercepted.request().postDataJSON().event_id;
        const committed = await intercepted.fetch(); expect(committed.status()).toBe(200);
        await intercepted.abort('failed');
      } else await intercepted.fallback();
    });
    await page.getByRole('button', { name: '예시 확인 완료', exact: true }).click();
    await expect(page.getByText('저장 여부를 확인하지 못했어요', { exact: true })).toBeVisible();
    expect(sql(`select count(*) from public.marketing_round2_events where event_id='${discardedEvent}'`)).toBe('1');
    expect(await page.locator('[data-screen-id="R2_HOMEFLOW_EXAMPLE_DONE"]').count()).toBe(0);
    await captureRecovery('homeflow');
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.locator('[data-screen-id="R2_HOMEFLOW_EXAMPLE_DONE"]')).toBeVisible();
    expect(sql(`select count(*) from public.marketing_round2_events where event_id='${discardedEvent}'`)).toBe('1');
    checks.push('actual commit with browser response loss, no premature DONE, explicit retry same event/no duplicate');

    if (!recoveryOnly) {
    await fresh(); await open('recording');
    const limit = await page.evaluate(async endpoint => {
      for (let index = 0; index < 100; index++) {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'menu_return', topic: 'recording', round_version: 'r2.1', event_id: crypto.randomUUID(), honeypot: '', from_activity: 'example' }) });
        if (response.status === 429) return { status: response.status, retry: response.headers.get('retry-after') };
        if (response.status !== 200) return { status: response.status };
      }
      return null;
    }, route);
    expect(limit?.status).toBe(429);
    await page.getByRole('button', { name: labels.example, exact: true }).click();
    const retry = page.getByRole('button', { name: /다시 시도/ });
    await expect(retry).toBeDisabled();
    await expect(page.locator('[data-screen-id="R2_RECORDING_RECOVERY"]')).toBeVisible();
    console.warn(JSON.stringify({ phase: 'actual-429-cooldown', retrySeconds: limit.retry }));
    await expect(retry).toBeEnabled({ timeout: 65000 });
    await retry.click();
    await expect(page.locator('[data-screen-id="R2_RECORDING_RECOVERY"]')).toHaveCount(0);
    checks.push('actual API 429, disabled retry countdown and explicit recovery after server window');
    await page.getByRole('button', { name: '메뉴로', exact: true }).click();
    await complete('recording', 'example');
    const resumeId = envelopes.filter(item => item.topic === 'recording' && item.status === 200).at(-1).data.participation_id;
    await context.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Fixture storage blocked', 'SecurityError'); } }); });
    await page.reload();
    await expect(page.getByRole('button', { name: /사용 예시 다시 보기/ })).toBeVisible();
    const resumed = envelopes.filter(item => item.action === 'bootstrap' && item.topic === 'recording' && item.status === 200).at(-1);
    expect(resumed.bootstrapIntent).toBe('cookie_resume'); expect(resumed.data.participation_id).toBe(resumeId);
    checks.push('blocked IndexedDB reload restores actual valid cookie participation and completion');
    }
    expect(externalRequests).toEqual([]); expect(pageErrors).toEqual([]);
    if (recoveryZoom) {
      const persisted = JSON.parse(await readFile(join(artifacts, 'recovery-zoom-geometry.json'), 'utf8'));
      assertRecoveryZoomCombinations(persisted);
      expect(persisted).toEqual(recoveryZoomGeometry);
    }
    const summary = { scenarioSelection: recoveryZoom ? 'recovery-zoom-only' : recoveryOnly ? 'recovery-only' : 'complete', checks, apiRequests: envelopes.length, committedRows: sql("select count(*) from public.marketing_round2_participations"), externalRequests, pageErrors, recoveryScreenshots, ...(recoveryZoom ? { zoomCaseCount: recoveryZoomGeometry.length, zoomScope: 'two actual error conditions across four viewports; not eight distinct errors', geometryArtifact: 'recovery-zoom-geometry.json' } : {}), apiPrewarm: 'actual GET method rejection 405, no database mutation', fixtureCounterReset: 'between closed independent browser cases', unexecuted: [] };
    await writeFile(join(artifacts, 'scenario-result.json'), JSON.stringify(summary, null, 2));
    return summary;
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }); await writeFile(join(artifacts, 'failure-page.txt'), await page.locator('body').innerText()); }
    await writeFile(join(artifacts, 'scenario-failure.json'), JSON.stringify({ checks, error: error.message, pageErrors, externalRequests, recentResponses: envelopes.slice(-8).map(({ action, topic, status, error }) => ({ action, topic, status, error })) }, null, 2));
    throw error;
  } finally { await context?.close(); }
}
