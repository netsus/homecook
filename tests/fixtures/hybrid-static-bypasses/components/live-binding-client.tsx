"use client";

export async function mutateThroughLiveBindings() {
  const loaded = await import("../lib/api/live-dynamic-barrel");
  loaded.storedTools.remove(["unsafe.png"]);
  loaded.storedDirectTools.remove(["unsafe.png"]);

  const {
    storedConditionalRemove,
    storedDestructuredRemove,
    storedLiveRemove,
    storedUnknownRemove,
    storedUpdatedRemove,
  } = await import("../lib/api/live-dynamic-barrel");
  storedConditionalRemove(["unsafe.png"]);
  storedDestructuredRemove(["unsafe.png"]);
  storedLiveRemove(["unsafe.png"]);
  storedUnknownRemove(["unsafe.png"]);
  (storedUpdatedRemove as (paths: string[]) => unknown)(["unsafe.png"]);
}
