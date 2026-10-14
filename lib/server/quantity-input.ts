import { QUANTITY_CONTRACT_HEADER, QUANTITY_INPUT_VERSION } from "@/types/quantity-input";

/** Environment alone cannot activate writes: the private DB policy must also be enabled. */
export function quantityInputContractRequested(request: Request): boolean {
  return request.headers.get(QUANTITY_CONTRACT_HEADER) === QUANTITY_INPUT_VERSION;
}
export function quantityInputWriteEnabled(request: Request): boolean {
  return process.env.MUMEOK_QUANTITY_V4_ENABLED === "true" && quantityInputContractRequested(request);
}
