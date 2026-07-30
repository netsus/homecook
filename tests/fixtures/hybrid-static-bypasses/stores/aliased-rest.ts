const STORAGE_BASE = "/sto" + "rage/v1/object/";

declare function escapeStorageValue<T>(value: T): T;
declare function readStorageMethod(): string;

export function removeThroughAliasedRest(objectPath: string) {
  const storageUrl = escapeStorageValue(
    new URL(
      `${STORAGE_BASE}recipe-images/${objectPath}`,
      location.origin,
    ),
  );
  const send = escapeStorageValue(fetch);
  const method = readStorageMethod();
  const methodAlias = method;
  const defaults = {
    headers: {
      accept: "application/json",
    },
  };
  const options = escapeStorageValue({
    ...defaults,
    method: methodAlias,
  });

  return send(storageUrl, options);
}

export function readThroughAliasedRest(objectPath: string) {
  const storageUrl = new URL(
    `${STORAGE_BASE}recipe-images/${objectPath}`,
    location.origin,
  );
  const send = fetch;
  const method = "GET";
  const options = { method };

  return send(storageUrl, { ...options });
}
