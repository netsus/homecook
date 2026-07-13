function encodeKeyOnce(key) {
  const value = String(key);
  try {
    return /%[0-9a-f]{2}/i.test(value)
      ? encodeURIComponent(decodeURIComponent(value))
      : encodeURIComponent(value);
  } catch {
    return encodeURIComponent(value);
  }
}

export function buildPublicDataUrl(endpoint, key, params = {}) {
  const publicQuery = new URLSearchParams(
    Object.entries(params).map(([name, value]) => [name, String(value)]),
  ).toString();
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}serviceKey=${encodeKeyOnce(key)}${publicQuery ? `&${publicQuery}` : ""}`;
}
