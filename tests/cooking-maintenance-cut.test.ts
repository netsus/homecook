import { describe, expect, it, vi } from 'vitest';
import { Worker } from 'node:worker_threads';
import { createFailSafeConsistentCutController } from '../scripts/lib/full-local-platform-backup.mjs';
import { assertCookingMaintenanceQueue, withCookingWorkerPaused, startCookingFenceMonitor, waitForCookingWorkerUnloaded } from '../scripts/lib/cooking-maintenance-cut.mjs';

function fixture(fail = '') {
  const events: string[] = [];
  const baseline = { running: true, healthy: true, fenceHeld: true, sharedHolders: 0,
    queued: 0, processing: 0, permitHeld: false, unclassifiedEnqueues: 0,
    blockedEnqueues: 0, protected: { generation: 50, expiresAt: 'fixed', policy: 'ON-same-hash', jobs: 'same', plist: 'same' } };
  let stopped = false;
  let lost = false;
  const assertHeld = () => { events.push('fence-check'); if (lost) throw Error('fence lost'); };
  return { events, baseline, options: {
    fence: {
      acquire: async () => { events.push('acquire'); },
      assertHeldSync: assertHeld,
      release: async () => { events.push('release'); if (fail === 'release') throw Error('uncertain release'); },
    },
    worker: {
      observe: async () => ({ ...baseline, running: !stopped }),
      stop: async () => { events.push('stop'); stopped = true; if (fail === 'stop') throw Error('bootout response lost'); },
      observeStopped: async () => ({ stopped }),
      restoreApi: async () => { events.push('restore-api'); assertHeld(); if (fail === 'api') throw Error('API restoration failed'); },
      startSamePlist: async () => { events.push('same-plist'); if (fail === 'bootstrap') throw Error('bootstrap failed'); stopped = false; },
      waitHealthy: async () => { events.push('health'); if (fail === 'health') throw Error('not ready'); return { ...baseline, running: !stopped }; },
    },
    operation: async ({ assertAdmissionFence }: { assertAdmissionFence: () => void }) => {
      events.push('backup');
      if (fail === 'lost') lost = true;
      // Models the real consistent-cut restart callback, including dump failure.
      assertAdmissionFence();
      if (fail === 'backup') throw Error('dump failed');
      return { backup: 'verified' };
    },
    closeIngress: async () => { events.push('close-ingress'); if (fail === 'containment') throw Error('close failed'); },
    record: async (stage: string) => { events.push(stage); },
  } };
}

describe('cooking maintenance cut', () => {
  it('restores the same worker before releasing intake', async () => {
    const f = fixture();
    expect(await withCookingWorkerPaused(f.options)).toEqual({ backup: 'verified' });
    expect(f.events.indexOf('stop')).toBeLessThan(f.events.indexOf('backup'));
    expect(f.events.indexOf('restore-api')).toBeLessThan(f.events.indexOf('same-plist'));
    expect(f.events.indexOf('restored')).toBeLessThan(f.events.indexOf('release'));
    expect(f.events).not.toContain('close-ingress');
  });
  it('keeps a dump failure visible after API and worker recovery', async () => {
    const f = fixture('backup');
    await expect(withCookingWorkerPaused(f.options)).rejects.toThrow('dump failed');
    expect(f.events).toContain('restored');
    expect(f.events.at(-1)).toBe('release');
  });
  it('reconciles an uncertain bootout before same-plist recovery', async () => {
    const f = fixture('stop');
    await expect(withCookingWorkerPaused(f.options)).rejects.toThrow('bootout response lost');
    expect(f.events).not.toContain('backup');
    expect(f.events).toContain('restored');
  });
  for (const failure of ['lost', 'api', 'bootstrap', 'health', 'release']) {
    it(`closes intake and reports UNKNOWN on ${failure}`, async () => {
      const f = fixture(failure);
      await expect(withCookingWorkerPaused(f.options)).rejects.toThrow('UNKNOWN');
      expect(f.events.at(-1)).toBe('close-ingress');
      if (failure !== 'release') expect(f.events).not.toContain('release');
      if (failure === 'lost') expect(f.events).not.toContain('same-plist');
    });
  }
  it('refuses policy/credential/history drift before reopening intake', () => {
    const f = fixture();
    expect(() => assertCookingMaintenanceQueue({ ...f.baseline, protected: { ...f.baseline.protected, jobs: 'changed' } }, f.baseline)).toThrow('changed');
  });
  it('allows classified blocked enqueues but rejects running/unclassified requests', () => {
    const f = fixture();
    expect(() => assertCookingMaintenanceQueue({ ...f.baseline, blockedEnqueues: 2 }, f.baseline)).not.toThrow();
    for (const bad of [{ sharedHolders: 1 }, { unclassifiedEnqueues: 1 }, { queued: 1 }, { processing: 1 }, { permitHeld: true }, { fenceHeld: false }]) {
      expect(() => assertCookingMaintenanceQueue({ ...f.baseline, ...bad }, f.baseline)).toThrow();
    }
  });
  it('refuses stop when the original worker is unhealthy', async () => {
    const f = fixture(); f.baseline.healthy = false;
    await expect(withCookingWorkerPaused(f.options)).rejects.toThrow('not healthy');
    expect(f.events).not.toContain('stop');
    expect(f.events).toContain('release');
  });
});


describe('live fence monitor', () => {
  it('closes ingress during synchronous backup work on another thread', async () => {
    const thread = new Worker(`const {parentPort}=require('node:worker_threads'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1200);parentPort.postMessage('done');`, { eval: true });
    let finished = false;
    const done = new Promise(resolve => thread.once('message', () => { finished = true; resolve(undefined); }));
    let closed = false;
    const monitor = startCookingFenceMonitor({ assertHeld: () => { throw Error('lost'); }, closeIngress: async () => { closed = true; } });
    try {
      await new Promise(resolve => setTimeout(resolve, 650));
      expect(closed).toBe(true);
      expect(monitor.error).toBeInstanceOf(Error);
      expect(finished).toBe(false);
      await done;
    } finally { monitor.stop(); await thread.terminate(); }
  });
  it('stops monitoring before intentional fence release', async () => {
    vi.useFakeTimers();
    let held = true;
    const closeIngress = vi.fn();
    const monitor = startCookingFenceMonitor({ assertHeld: () => { if (!held) throw Error('lost'); }, closeIngress });
    try {
      monitor.stop(); held = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(closeIngress).not.toHaveBeenCalled();
    } finally { monitor.stop(); vi.useRealTimers(); }
  });
});


it('stops a late API start that completed after the fence was lost', () => {
  let held = true;
  let running = true;
  const cut = createFailSafeConsistentCutController({ writers: ['gateway'],
    assertRestartSafe: () => { if (!held) throw Error('lost'); },
    stopWriter: () => { running = false; },
    startWriter: () => { held = false; running = false; /* concurrent containment */ running = true; /* late start */ },
  });
  cut.beginConsistentCut();
  expect(() => cut.endConsistentCut()).toThrow('release failed');
  expect(running).toBe(false);
  expect(cut.stoppedWriters()).toEqual(['gateway']);
});

it('repeats containment until the operation can no longer restart the gateway', async () => {
  vi.useFakeTimers();
  let running = true;
  const monitor = startCookingFenceMonitor({ assertHeld: () => { throw Error('lost'); }, closeIngress: async () => { running = false; } });
  try {
    await vi.advanceTimersByTimeAsync(500);
    expect(running).toBe(false);
    running = true; // an in-flight start completes after the first closure.
    await vi.advanceTimersByTimeAsync(500);
    expect(running).toBe(false);
  } finally { monitor.stop(); vi.useRealTimers(); }
});


it('waits for owned launchd unloading without dispatching bootout again', async () => {
  let reads = 0;
  await waitForCookingWorkerUnloaded(async () => ({ stopped: ++reads === 3 }));
  expect(reads).toBe(3);
});

it('does not swallow foreign or ambiguous stop observations', async () => {
  const observe = vi.fn(async () => { throw Error('foreign launcher'); });
  await expect(waitForCookingWorkerUnloaded(observe)).rejects.toThrow('foreign launcher');
  expect(observe).toHaveBeenCalledTimes(1);
});
