// Opt-in R2-S5-001 browser diagnostic. Real client/view; API envelopes and challenge are local fixtures.
import { chromium, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const output = join(root, '.omx/artifacts/r2-s5-001/browser');
const port = 3126;
const origin = `http://127.0.0.1:${port}`;
await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
await mkdir(output, { recursive: true });
const reuse = process.argv.find(value => value.startsWith('--reuse-owned='))?.slice('--reuse-owned='.length);
if (reuse && !reuse.startsWith(join(tmpdir(), 'r2-s5-browser-'))) throw new Error('Only an owned temporary copy can be reused');
const owned = reuse ?? await mkdtemp(join(tmpdir(), 'r2-s5-browser-'));
for (const name of reuse ? [] : ['app', 'components', 'lib', 'types', 'hooks', 'stores', 'public', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs', 'package.json', 'middleware.ts']) {
  try { await cp(join(root, name), join(owned, name), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const sourceHashes = {};
for (const name of ['lib/marketing/round2-client.ts', 'components/marketing/round2/round2-view.tsx', 'components/marketing/round2/round2-landing.tsx', 'components/marketing/round2/round2-turnstile.tsx', 'components/marketing/round2/round2.module.css', 'app/globals.css', 'app/beta/r2/[topic]/page.tsx']) sourceHashes[name] = createHash('sha256').update(await readFile(join(owned, name))).digest('hex');
// Only the copied server page supplies fixture props. Client, view, CSS, and widget adapter remain unchanged.
await writeFile(join(owned, 'app/beta/r2/[topic]/page.tsx'), `import React from 'react';
import { Round2Landing } from '@/components/marketing/round2/round2-landing';
export default async function Page({params}:{params:Promise<{topic:'recording'|'homeflow'}>}) {
const {topic}=await params; return <Round2Landing topic={topic} preview={false} leadReady={true} pageContext="" turnstileSiteKey="fixture-public-key" attribution={{first_channel:'direct',utm_source:null,utm_medium:null,utm_campaign:null,utm_content:null}}/>;
}`);
if (!reuse) await symlink(join(root, 'node_modules'), join(owned, 'node_modules'));
await writeFile(join(output, 'source-manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), baselineHead: spawnSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).stdout.trim(), sourceHashes, fixturePageOnly: true, temporaryRoot: owned, origin, realNext: true, actualApi: false, actualDatabase: false }, null, 2));
await writeFile(join(output, 'qa-inventory.json'), JSON.stringify({ scope: 'Route-mocked browser diagnostic, not public Stage5 or real API/DB authority', matrix: ['recording/homeflow', 'network abort/503', 'email edit/consent off-on'], controls: ['submit', 'edited receipt-only check', 'restore original unchecked input', 'fresh challenge', 'explicit retry'], claims: ['original event/email immutable', 'edited draft never POSTed', 'no false completion', 'receipt-only omits token', 'new consent/challenge needed after restore', 'no background lead on reconnect'], exploratory: ['422 absent receipt remains recoverable', 'lost committed receipt confirmed tokenless'], visual: ['320x568 and 390x844 at 100%/200% text', 'page overflow', 'static text clipping', 'CTA center/bottom hit targets', 'full-page and CTA screenshots'] }, null, 2));
const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', owned, '-p', String(port), '-H', '127.0.0.1'], { cwd: owned, env: { PATH: process.env.PATH, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_APP_URL: origin }, stdio: ['ignore','pipe','pipe'] });
let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
let browser;
const cases = []; const geometry = []; const pageErrors = []; const externalRequests = [];
try {
  for (let count = 0; count < 120; count++) {
    if (child.exitCode !== null) throw new Error('Owned Next server exited');
    try { if ((await fetch(origin + '/beta/r2/recording')).ok) break; } catch {}
    if (count === 119) throw new Error('Owned Next readiness timeout');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ headless: true });
  async function scenario(topic, failure, edit, committed = false) {
    const context = await browser.newContext({ viewport: {width:390,height:844} });
    context.setDefaultTimeout(20000);
    const requests = []; const observations = []; const uiTrace = []; let failing = true; let completed = false; let started = false; let receiptId = null;
    await context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined });
      const widgets = new Map(); let seq = 0;
      window.turnstile = { render(node, options) { const id = ++seq; const button = document.createElement('button'); button.type = 'button'; button.textContent = '테스트 보안 확인'; button.onclick = () => options.callback('fresh-fixture-' + id); node.append(button); widgets.set(id,button); return id; }, reset() {}, remove(id) { widgets.get(id)?.remove(); widgets.delete(id); } };
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { externalRequests.push(url.origin + url.pathname); return route.abort(); }
      if (url.pathname !== '/api/v1/marketing/round2') return route.continue();
      const request = route.request().postDataJSON(); requests.push(request);
      const observe = (status, error = null) => observations.push({ sequence: observations.length + 1, observedAt: new Date().toISOString(), action: request.action, activity: request.activity ?? null, tokenPresent: Boolean(request.turnstile_token), emailFixture: request.email ? 'original-fixture' : null, immutableLead: request.action === 'lead_submit' ? request.email === requests.find(item => item.action === 'lead_submit').email && request.event_id === requests.find(item => item.action === 'lead_submit').event_id : null, responseStatus: status, responseError: error, leadState: completed ? 'completed' : started ? 'started' : 'not_started' });
      if (request.action === 'activity_start' && request.activity === 'lead') started = true;
      if (request.action === 'lead_submit') {
        if (failing) {
          if (failure === 'NETWORK_ERROR') { observe('network-aborted', 'NETWORK_ERROR'); return route.abort('failed'); }
          observe(503, 'LEAD_CAPTURE_UNAVAILABLE');
          return route.fulfill({status:503,json:{success:false,data:null,error:{code:'LEAD_CAPTURE_UNAVAILABLE',message:'fixture',fields:[]}}});
        }
        if (!committed && !request.turnstile_token) { observe(422, 'VALIDATION_ERROR'); return route.fulfill({status:422,json:{success:false,data:null,error:{code:'VALIDATION_ERROR',message:'fixture',fields:['turnstile_token']}}}); }
        completed = true; receiptId ??= request.event_id;
      }
      observe(200);
      return route.fulfill({status:200,json:{success:true,error:null,data:{round_version:'r2.1',topic,participation_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',event_id:request.event_id,revision:completed?3:started?2:1,consent_generation:1,state:{example:'not_started',survey:'not_started',lead:completed?'completed':started?'started':'not_started'},receipt:completed?{event_id:receiptId,status:'received'}:null,participation_expires_at:'2026-10-10T00:00:00Z',retention_until:'2026-11-30T15:00:00Z'}}});
    });
    const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
    await page.exposeBinding('observeFixtureUi', (_source, event) => uiTrace.push(event));
    await page.addInitScript(() => {
      document.addEventListener('click', event => {
        const target=event.target instanceof Element?event.target.closest('button,input[type="checkbox"]'):null;
        if(!target)return;
        const allowed=['베타 오픈 알림 받기','테스트 보안 확인','베타 오픈 알림 신청하기','다시 시도','이전 신청 접수 확인','편집 취소하고 이전 입력으로 돌아가기'];
        const label=target.matches('input')?'consent-checkbox':target.textContent.trim();
        if(label!=='consent-checkbox'&&!allowed.includes(label))return;
        void window.observeFixtureUi({observedAt:new Date().toISOString(),action:label,consentChecked:document.querySelector('input[type="checkbox"]')?.checked??null,recoveryVisible:Boolean(document.querySelector('[aria-label="참여 복구"]')),doneVisible:Boolean(document.querySelector('[data-screen-id$="LEAD_DONE"]'))});
      },true);
    });
    const leads = () => requests.filter(request => request.action === 'lead_submit');
    try {
      await page.goto(origin + '/beta/r2/' + topic);
      await page.getByRole('button',{name:'베타 오픈 알림 받기',exact:true}).click();
      await page.getByRole('textbox',{name:'이메일',exact:true}).fill('first@example.com');
      await page.getByRole('checkbox').check(); await page.getByRole('button',{name:'테스트 보안 확인',exact:true}).click();
      await page.getByRole('button',{name:'베타 오픈 알림 신청하기',exact:true}).click();
      await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toBeEnabled();
      const original = leads()[0]; expect(original).toBeTruthy();
      if (edit === 'email') await page.getByRole('textbox',{name:'이메일',exact:true}).fill('corrected@example.com');
      else { await page.getByRole('checkbox').uncheck(); await page.getByRole('checkbox').check(); }
      expect(leads()).toHaveLength(1);
      if (edit === 'email') {
        const bootstrapCount = requests.filter(request => request.action === 'bootstrap').length;
        // Diagnostic lifecycle event, separate from the user control interactions below.
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect.poll(() => requests.filter(request => request.action === 'bootstrap').length).toBeGreaterThan(bootstrapCount);
        expect(leads()).toHaveLength(1);
        const check = page.getByRole('button',{name:'이전 신청 접수 확인',exact:true});
        await check.click(); await expect(check).toBeEnabled(); expect(leads()).toHaveLength(2);
        expect(leads()[1]).not.toHaveProperty('turnstile_token');
        await expect(page.getByRole('textbox',{name:'이메일',exact:true})).toHaveValue('corrected@example.com');
        await expect(page.getByRole('heading',{name:'베타 오픈 알림 신청을 접수했어요'})).toHaveCount(0);
        if (!committed && failure === 'NETWORK_ERROR') {
          for (const [width,height] of [[320,568],[390,844]]) for (const zoom of [100,200]) {
            await page.setViewportSize({width,height});
            const style = await page.addStyleTag({content:`html { font-size: ${zoom}% !important; }`});
            const controls = [];
            for (const name of ['이전 신청 접수 확인','편집 취소하고 이전 입력으로 돌아가기']) {
              const button = page.getByRole('button',{name,exact:true}); await button.scrollIntoViewIfNeeded();
              controls.push(await button.evaluate(element => {const r=element.getBoundingClientRect(); const hit=y=>{const target=document.elementFromPoint(r.x+r.width/2,y);return element===target||element.contains(target);}; return {name:element.textContent,top:r.top,bottom:r.bottom,width:r.width,height:r.height,centerHit:hit(r.top+r.height/2),lowerHit:hit(r.bottom-4)};}));
            }
            const measurement = await page.locator('main').evaluate(main => {
              const clippedText=[]; const walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);
              while(walker.nextNode()) {const text=walker.currentNode;if(!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);if(!range.getClientRects().length)continue;const b=range.getBoundingClientRect();for(let p=text.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();const x=['hidden','clip','auto','scroll'].includes(s.overflowX)?Math.max(0,r.left-b.left,b.right-r.right):0;const y=['hidden','clip','auto','scroll'].includes(s.overflowY)?Math.max(0,r.top-b.top,b.bottom-r.bottom):0;if(x>0.5||y>0.5)clippedText.push({text:text.textContent,x,y});if(p===main)break;}}
              return {pageWidth:document.documentElement.scrollWidth,rootFontSize:parseFloat(getComputedStyle(document.documentElement).fontSize),recoveryTextSize:parseFloat(getComputedStyle(main.querySelector('[aria-label="참여 복구"] p')).fontSize),clippedText};
            });
            const file=`${topic}-${width}-${zoom}-edited-recovery`;
            // Capture-only overlays mask the synthetic email, without changing measured text or app source.
            await page.evaluate(() => {
              const cover = rect => {const block=document.createElement('div');block.dataset.evidenceRedaction='email';Object.assign(block.style,{position:'absolute',left:`${rect.left+scrollX}px`,top:`${rect.top+scrollY}px`,width:`${rect.width}px`,height:`${rect.height}px`,background:'#111',zIndex:'2147483647',pointerEvents:'none'});document.body.append(block);};
              const input=document.querySelector('input[type="email"]');if(input)cover(input.getBoundingClientRect());
              const walker=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT);
              while(walker.nextNode()){const text=walker.currentNode;const match=text.textContent.match(/[a-z]+@example\.com/);if(!match)continue;const range=document.createRange();range.setStart(text,match.index);range.setEnd(text,match.index+match[0].length);for(const rect of range.getClientRects())cover(rect);}
            });
            await page.screenshot({path:join(output,file+'.png'),fullPage:true}); await page.screenshot({path:join(output,file+'-cta.png')});
            await page.locator('[data-evidence-redaction]').evaluateAll(elements=>elements.forEach(element=>element.remove()));
            geometry.push({topic,width,height,zoom,...measurement,controls,screenshot:file+'.png',viewportScreenshot:file+'-cta.png'});
            await writeFile(join(output,'geometry.json'),JSON.stringify(geometry,null,2));
            expect(measurement.pageWidth).toBeLessThanOrEqual(width); expect(measurement.clippedText).toEqual([]);
            for(const control of controls){expect(control.centerHit).toBe(true);expect(control.lowerHit).toBe(true);expect(control.top).toBeGreaterThanOrEqual(0);expect(control.bottom).toBeLessThanOrEqual(height);}
            await style.evaluate(element=>element.remove());
          }
          await page.setViewportSize({width:390,height:844});
        }
        failing = false;
        await check.click();
        if (!committed) {
          await expect(check).toBeEnabled(); expect(leads().at(-1)).not.toHaveProperty('turnstile_token');
          await page.getByRole('button',{name:'편집 취소하고 이전 입력으로 돌아가기',exact:true}).click();
          await expect(page.getByRole('textbox',{name:'이메일',exact:true})).toHaveValue('first@example.com');
          await expect(page.getByRole('checkbox')).not.toBeChecked();
          await page.getByRole('checkbox').check(); await page.getByRole('button',{name:'테스트 보안 확인',exact:true}).click();
          await page.getByRole('button',{name:'다시 시도',exact:true}).click();
        }
      } else {
        await page.getByRole('button',{name:'테스트 보안 확인',exact:true}).click();
        await page.getByRole('button',{name:'다시 시도',exact:true}).click();
        await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toBeEnabled(); expect(leads()).toHaveLength(2);
        failing = false; await page.getByRole('button',{name:'테스트 보안 확인',exact:true}).click(); await page.getByRole('button',{name:'다시 시도',exact:true}).click();
      }
      await expect(page.getByRole('heading',{name:'베타 오픈 알림 신청을 접수했어요'})).toBeVisible();
      expect(new Set(leads().map(request=>request.event_id)).size).toBe(1); expect(leads().every(request=>request.email===original.email)).toBe(true);
      cases.push({topic,failure,edit,committedReceipt:committed,result:'PASS',observedAt:new Date().toISOString(),leadRequestCount:leads().length,immutableEmailAndEvent:true,reconnectWithoutBackgroundLead:edit==='email'?'PASS':'not-run',uiAssertions:{initialFailureRecoveryVisible:true,editDidNotSubmit:true,receiptCheckRetainedDraft:edit==='email',restoreExplicitAndUnchecked:edit==='email'&&!committed,confirmedDoneVisible:true},uiTrace,observations});
      await writeFile(join(output,'cases.json'),JSON.stringify(cases,null,2));
    } catch(error) { await page.screenshot({path:join(output,'failure.png'),fullPage:true}); throw error; }
    finally {await context.close();}
  }
  for(const topic of ['recording','homeflow']) for(const failure of ['NETWORK_ERROR','LEAD_CAPTURE_UNAVAILABLE']) for(const edit of ['email','consent']) await scenario(topic,failure,edit);
  for(const topic of ['recording','homeflow']) await scenario(topic,'NETWORK_ERROR','email',true);
  expect(pageErrors).toEqual([]); expect(externalRequests).toEqual([]);
  await writeFile(join(output,'result.json'),JSON.stringify({result:'PASS',conditions:cases.length,geometryConditions:geometry.length,actualClientAndView:true,pagePropsFixture:true,actualApi:false,actualDatabase:false,realProvider:false,externalRequests,pageErrors,productionWrites:0,temporaryRoot:owned,port,serverStopped:true},null,2));
  process.stdout.write(JSON.stringify({result:'PASS',conditions:cases.length,geometryConditions:geometry.length,output})+'\n');
} finally {
  await browser?.close(); child.kill('SIGTERM'); await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000).unref();});
  await writeFile(join(output,'next.log'),logs);
  await writeFile(join(output,'ownership.json'),JSON.stringify({root:owned,port,childPid:child.pid,exitCode:child.exitCode,signalCode:child.signalCode,otherServersUntouched:[3100,3118,3124]},null,2));
}
