const RPCS = new Set(["claim_youtube_extraction_job", "claim_youtube_extractor_permit", "start_youtube_extraction_attempt", "heartbeat_youtube_extraction_job", "heartbeat_youtube_extractor_permit", "read_youtube_extraction_worker_catalog", "report_youtube_extraction_progress", "resolve_youtube_extraction_job_draft", "finalize_youtube_extraction_job", "release_youtube_extractor_permit"]);
const fail = (message) => { throw new Error(`Rehearsal PostgREST RPC rejected: ${message}`); };
export function createRehearsalPostgrestRpcClient({ baseUrl, syntheticToken, fixtureIdentity, fetchImpl = fetch }) {
  const url = new URL(baseUrl);
  if (!((url.protocol === "http:" && ["127.0.0.1", "::1", "postgrest"].includes(url.hostname)) && /^\d+$/.test(url.port))) fail("base URL is not isolated local PostgREST");
  if (typeof syntheticToken !== "string" || syntheticToken.length < 16 || typeof fixtureIdentity !== "string" || fixtureIdentity.length === 0) fail("synthetic credential or fixture identity is invalid");
  return async (name, body = {}, { signal } = {}) => {
    if (!RPCS.has(name)) fail("RPC endpoint is not allowlisted");
    const timeout = AbortSignal.timeout(5_000); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetchImpl(new URL(`/rpc/${name}`, url), { method: "POST", headers: { authorization: `Bearer ${syntheticToken}`, apikey: syntheticToken, "content-type": "application/json", "x-homecook-rehearsal-fixture": fixtureIdentity }, body: JSON.stringify(body), signal: combined });
    if (!response.ok) fail(`RPC ${name} returned ${response.status}`);
    const text = await response.text(); if (text.length > 1_048_576) fail("RPC response exceeds bound");
    let data; try { data = JSON.parse(text); } catch { fail("RPC response is not JSON"); }
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("RPC response is not a closed object");
    return { data, error: null };
  };
}
