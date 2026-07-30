"use client";

import type { StorageWriteContract } from "../lib/server/type-only-storage";
import type { ServerOnlyStoreContract } from "../stores/server-only";

export type ClientStorageContract = StorageWriteContract & ServerOnlyStoreContract;
