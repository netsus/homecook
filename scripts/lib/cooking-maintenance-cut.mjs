import { isDeepStrictEqual } from 'node:util';

const check = (ok, message) => { if (!ok) throw new Error(message); };

// Only the enqueue advisory fence is changed. Policy, credential and historical
// job fingerprints remain exact; blocked new enqueues are not in-flight writes.
export function assertCookingMaintenanceQueue(observation, baseline) {
  check(observation.fenceHeld === true && observation.sharedHolders === 0,
    'Enqueue fence missing or prior enqueue still running');
  check(observation.queued === 0 && observation.processing === 0 && observation.permitHeld === false,
    'Queue is not drained');
  check(observation.unclassifiedEnqueues === 0, 'Unclassified active enqueue');
  check(isDeepStrictEqual(observation.protected, baseline.protected),
    'Worker policy, credential, history or launcher changed');
}

// A single existing backup or reviewed DB operation runs while the unchanged
// worker is stopped. The operation must check the fence before API restarts.
export async function withCookingWorkerPaused({ fence, worker, operation, closeIngress, record }) {
  let baseline;
  let stopAttempted = false;
  let operationError;
  let value;
  const recoveryErrors = [];
  await fence.acquire();
  try {
    baseline = await worker.observe();
    check(baseline.running === true && baseline.healthy === true, 'Original worker is not healthy');
    assertCookingMaintenanceQueue(baseline, baseline);
    await record('before-stop', baseline);
    // Set before dispatch: a thrown bootout can have an uncertain outcome.
    stopAttempted = true;
    await worker.stop();
    check((await worker.observeStopped()).stopped === true, 'Worker stop is uncertain');
    const drained = await worker.observe();
    assertCookingMaintenanceQueue(drained, baseline);
    await record('stopped', drained);
    value = await operation({ assertAdmissionFence: () => fence.assertHeldSync() });
  } catch (error) {
    operationError = error;
  } finally {
    if (stopAttempted) {
      try {
        // If backup recovery left any API stopped, restore only the captured set,
        // and only while the same exclusive fence is still proved.
        fence.assertHeldSync();
        await worker.restoreApi();
        fence.assertHeldSync();
        const state = await worker.observeStopped();
        if (state.stopped) await worker.startSamePlist();
        // Loaded-but-unhealthy or ambiguous state is never blindly bootstrapped.
        const restored = await worker.waitHealthy();
        check(restored.running === true && restored.healthy === true, 'Worker health restoration unconfirmed');
        assertCookingMaintenanceQueue(restored, baseline);
        await record('restored', restored);
      } catch (error) {
        recoveryErrors.push(error);
        try { await closeIngress(); } catch (containmentError) { recoveryErrors.push(containmentError); }
      }
    }
    if (recoveryErrors.length === 0) {
      try { await fence.release(); } catch (error) {
        recoveryErrors.push(error);
        try { await closeIngress(); } catch (containmentError) { recoveryErrors.push(containmentError); }
      }
    }
  }
  if (recoveryErrors.length) throw new AggregateError(
    [operationError, ...recoveryErrors].filter(Boolean),
    'Maintenance outcome UNKNOWN; ingress closed or closure unconfirmed; reconcile before retry',
  );
  if (operationError) throw operationError;
  return value;
}

// The coordinator runs independently of the synchronous backup thread. A failed
// probe repeatedly closes ingress and permanently invalidates this attempt.
export function startCookingFenceMonitor({ assertHeld, closeIngress }) {
  let error;
  const timer = setInterval(() => {
    if (error) {
      Promise.resolve().then(closeIngress).catch(() => { /* retry until the operation thread has exited */ });
      return;
    }
    try { assertHeld(); } catch (failure) {
      error = failure;
      Promise.resolve().then(closeIngress).catch(() => { /* caller retries containment during recovery */ });
    }
  }, 500);
  timer.unref();
  return { get error() { return error; }, stop() { clearInterval(timer); } };
}
