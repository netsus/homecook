"use client";

import {
  removeThroughBracketSdk,
  removeThroughStorageRest,
  uploadThroughAliasedSdk,
} from "../lib/api";
import { removeFromUnsafeFeature } from "../features/unsafe.mjs";
import { removeFromUnsafeStore } from "../stores/unsafe";

export function triggerStorageBypasses(file: File, objectPath: string) {
  void removeThroughStorageRest(objectPath);
  void uploadThroughAliasedSdk(file);
  void removeThroughBracketSdk(objectPath);
  void removeFromUnsafeStore(objectPath);
  void removeFromUnsafeFeature();
}
