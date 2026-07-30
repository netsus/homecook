"use client";

import {
  removeThroughBracketSdk,
  removeThroughStorageRest,
  uploadThroughAliasedSdk,
} from "../lib/api";

export function triggerStorageBypasses(file: File, objectPath: string) {
  void removeThroughStorageRest(objectPath);
  void uploadThroughAliasedSdk(file);
  void removeThroughBracketSdk(objectPath);
}
