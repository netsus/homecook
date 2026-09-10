import assert from "node:assert/strict";

export async function runRound2StorageScenarios(browser, baseURL) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block" });
  let blockedExternalRequests = 0;
  let postRequests = 0;
  await context.route("**/*", route => {
    if (!route.request().url().startsWith(baseURL + "/")) { blockedExternalRequests++; return route.abort(); }
    if (route.request().method() !== "GET") { postRequests++; return route.abort(); }
    return route.continue();
  });
  const now = Date.parse("2026-09-11T00:00:00Z");
  const direct = { first_channel: "direct", utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
  const shared = { ...direct, first_channel: "shared", utm_medium: "share" };
  const options = { topic: "recording", attribution: direct, nowMs: now };
  const prepare = (page, opts = options) => page.evaluate(async input => (await import("/session.js")).prepareRound2Bootstrap(input), opts);
  const inspect = page => page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("mumeok-r2", 1);
    request.onerror = () => reject(new Error("fixture IDB inspect failed"));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("bootstrap", "readonly");
      const read = tx.objectStore("bootstrap").get("r2.1:recording");
      read.onsuccess = () => resolve(read.result);
      tx.oncomplete = () => db.close();
    };
  }));
  try {
    const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
    await Promise.all([a.goto(baseURL), b.goto(baseURL)]);
    assert.equal(await a.evaluate(() => isSecureContext), true, "fixture must be an HTTPS secure context");
    const [first, concurrent] = await Promise.all([prepare(a), prepare(b)]);
    assert.equal(first.kind, "key");
    assert.equal(first.bootstrap_key, concurrent.bootstrap_key, "simultaneous tabs must atomically share one key");
    assert.equal(first.event_id, concurrent.event_id, "same attribution must share the first event");
    assert.match(first.bootstrap_key, /^[A-Za-z0-9_-]{43}$/);
    assert.match(first.event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(first.bootstrap_intent, "create_or_resume");
    await a.reload();
    const lostResponseRetry = await prepare(a);
    assert.equal(lostResponseRetry.bootstrap_key, first.bootstrap_key, "lost response + reload retains pending key");
    assert.equal(lostResponseRetry.event_id, first.event_id);
    const changed = await prepare(b, { ...options, attribution: shared });
    assert.equal(changed.bootstrap_key, first.bootstrap_key);
    assert.notEqual(changed.event_id, first.event_id, "different ad semantics cannot reuse an event ID");
    assert.equal((await prepare(a, { ...options, attribution: shared })).event_id, changed.event_id, "pending alternate attribution is persisted across tabs");
    const beforeConfirm = await inspect(a);
    assert.deepEqual(beforeConfirm.first_attribution, direct);
    assert.equal(beforeConfirm.pending.length, 2);
    const confirmation = { topic: "recording", bootstrapKey: first.bootstrap_key, eventId: changed.event_id, expiresAt: "2026-09-12T00:00:00Z", nowMs: now };
    assert.equal(await b.evaluate(async args => (await import("/session.js")).confirmRound2Bootstrap(args), confirmation), true);
    await b.reload();
    const resumed = await prepare(b);
    assert.equal(resumed.bootstrap_intent, "resume", "confirmed keys never automatically create");
    assert.equal(resumed.bootstrap_key, first.bootstrap_key);
    const otherTopic = await prepare(a, { ...options, topic: "homeflow" });
    assert.notEqual(otherTopic.bootstrap_key, first.bootstrap_key);
    const expired = await prepare(a, { ...options, nowMs: now + 86400000 });
    assert.deepEqual(expired, { kind: "restart_required", topic: "recording" });
    const marker = await inspect(a);
    assert.deepEqual(marker, { version: 1, status: "restart_required" }, "expiry discards key and pending event capabilities");
    await a.reload();
    assert.equal((await prepare(a)).kind, "restart_required", "reload and a backwards clock cannot silently restart");
    const restarted = await a.evaluate(async input => (await import("/session.js")).restartRound2Bootstrap(input), { ...options, nowMs: now + 86400000 });
    assert.equal(restarted.kind, "key");
    assert.notEqual(restarted.bootstrap_key, first.bootstrap_key);
    assert.notEqual(restarted.event_id, first.event_id);
    assert.equal((await prepare(b, { ...options, nowMs: now + 86400000 })).bootstrap_key, restarted.bootstrap_key);
    assert.equal(await a.evaluate(async args => (await import("/session.js")).confirmRound2Bootstrap(args), confirmation), false, "late old confirmation cannot replace the fresh key");
    assert.equal((await prepare(b, { ...options, topic: "homeflow" })).bootstrap_key, otherTopic.bootstrap_key, "recording expiry cannot alter homeflow");
    await a.evaluate(async input => (await import("/session.js")).markRound2ParticipationExpired(input), { topic: "recording", bootstrapKey: restarted.bootstrap_key });
    assert.equal((await prepare(b)).kind, "restart_required", "server 410 leaves an explicit restart fence");
    const final = await a.evaluate(async input => (await import("/session.js")).restartRound2Bootstrap(input), options);
    await b.evaluate(async input => (await import("/session.js")).markRound2ParticipationExpired(input), { topic: "recording", bootstrapKey: restarted.bootstrap_key });
    assert.equal((await prepare(a)).bootstrap_key, final.bootstrap_key, "late 410 for an old key cannot erase a newer participation");
    const unavailable = await a.evaluate(async input => {
      const clientSession = await import("/session.js");
      const first = await clientSession.prepareRound2Bootstrap({ ...input, indexedDB: null });
      const second = await clientSession.prepareRound2Bootstrap({ ...input, indexedDB: null });
      return { first, second, request: clientSession.buildRound2BootstrapRequest(first) };
    }, options);
    assert.deepEqual(unavailable.first, unavailable.second, "storage failure retains only a tab-memory retry event");
    assert.equal(unavailable.request.bootstrap_intent, "cookie_resume");
    assert.equal(Object.hasOwn(unavailable.first, "bootstrap_key"), false);
    assert.equal(Object.hasOwn(unavailable.request, "page_context"), false);
    assert.equal(Object.hasOwn(unavailable.request, "bootstrap_key"), false);
    assert.equal((await prepare(a)).bootstrap_key, final.bootstrap_key, "storage fallback does not replace persistent state");
    const pendingThirtyDays = await prepare(a, { ...options, topic: "homeflow", nowMs: now + 30 * 86400000 });
    assert.equal(pendingThirtyDays.kind, "restart_required", "unconfirmed bootstrap also expires after 30 days");
    const quota = await b.evaluate(async input => {
      const clientSession = await import("/session.js");
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException("fixture storage full", "QuotaExceededError"); };
      let result;
      try { result = await clientSession.restartRound2Bootstrap({ ...input, topic: "homeflow" }); }
      finally { IDBObjectStore.prototype.put = original; }
      const after = await clientSession.prepareRound2Bootstrap({ ...input, topic: "homeflow" });
      return { result, after };
    }, options);
    assert.equal(quota.result.kind, "cookie_resume", "aborted storage write cannot release an unpersisted memory key");
    assert.equal(Object.hasOwn(quota.result, "bootstrap_key"), false);
    assert.equal(quota.after.kind, "restart_required", "failed restart cannot overwrite the durable expiry fence");
    const bounded = await a.evaluate(async input => {
      const clientSession = await import("/session.js");
      let queueFull = false;
      for (const source of [null, "instagram", "facebook"]) {
        for (const medium of [null, "paid_social", "social_profile", "share"]) {
          for (const campaign of [null, "mumeok_r2"]) {
            for (const content of [null, "video_recording_v2", "video_homeflow_v1", "profile_link"]) {
              const next = await clientSession.prepareRound2Bootstrap({ ...input, attribution: { first_channel: "unknown", utm_source: source, utm_medium: medium, utm_campaign: campaign, utm_content: content } });
              if (next.kind === "queue_full") queueFull = true;
            }
          }
        }
      }
      return queueFull;
    }, options);
    assert.equal(bounded, true, "pending bootstrap outbox rejects overflow instead of evicting requests");
    const fullRecord = await inspect(a);
    assert.equal(fullRecord.pending.length, 50);
    assert.deepEqual(Object.keys(fullRecord).sort(), ["bootstrap_key", "created_at", "event_id", "expires_at", "first_attribution", "pending", "status", "version"]);
    assert.equal((await prepare(a)).bootstrap_key, final.bootstrap_key, "queue overflow leaves the same participation and first event usable");
    assert.equal(postRequests, 0);
    assert.equal(blockedExternalRequests, 0);
    return { passed: true, scenarios: ["https_secure_context", "simultaneous_two_tabs_same_key_and_event", "lost_response_reload", "different_attribution_distinct_event", "pending_attribution_replay", "confirmed_resume", "topic_separation", "server_expiry", "30_day_pending_expiry", "persisted_restart_fence", "explicit_new_key", "stale_confirmation", "stale_410", "cookie_resume_fallback", "quota_abort_preserves_fence", "bounded_50_pending_no_eviction"], publicPosts: postRequests, externalRequests: blockedExternalRequests, database: "browser IndexedDB only; no server DB" };
  } finally { await context.close(); }
}
