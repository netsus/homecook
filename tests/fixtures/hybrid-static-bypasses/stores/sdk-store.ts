import {
  removeViaBarrel,
  sdkTools,
  sdkTuple,
} from "../lib/api/sdk-barrel";
import * as sdkNamespace from "../lib/api/sdk-barrel";

export const removeStoredImage = removeViaBarrel;
export const removeStoredNamespaceImage = sdkNamespace.removeViaBarrel;
export const storedSdkTools = sdkTools;
export const storedSdkTuple = sdkTuple;
