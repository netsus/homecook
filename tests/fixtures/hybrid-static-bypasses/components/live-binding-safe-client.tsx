"use client";

export async function inspectThroughSafelyReassignedBinding() {
  const { storedSafeRemove } = await import(
    "../lib/api/live-dynamic-barrel"
  );
  storedSafeRemove(["safe.png"]);
}
