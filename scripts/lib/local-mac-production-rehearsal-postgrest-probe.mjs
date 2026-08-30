const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const fail = (message) => { throw new Error(`PostgREST fixture probe rejected: ${message}`); };
export function buildPostgrestFixtureReadbackProbe({ jobId, userId, token }) {
  if (!UUID.test(jobId ?? "") || !UUID.test(userId ?? "") || typeof token !== "string" || token.length === 0) fail("fixture probe input is invalid");
  const path = `/youtube_extraction_jobs?id=eq.${jobId}&user_id=eq.${userId}&status=eq.queued&select=id,user_id,status,attempt_count,policy_snapshot_digest`;
  const script = "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(0,'utf8'));fetch(p.url,{headers:{authorization:'Bearer '+p.token,apikey:p.token}}).then(async r=>process.stdout.write(JSON.stringify({status:r.status,rows:await r.json()}))).catch(()=>process.exit(70));";
  return Object.freeze({ argv: ["exec", "--interactive", "<postgrest-probe-id>", "node", "-e", script], stdin: JSON.stringify({ url: `http://postgrest:3000${path}`, token }), redacted: Object.freeze({ path, host: "http://postgrest:3000" }) });
}
export function parseAndValidatePostgrestFixtureReadback(output, expected) {
  let value; try { value = JSON.parse(output); } catch { fail("probe output is invalid JSON"); }
  if (value?.status !== 200 || !Array.isArray(value.rows) || value.rows.length !== 1) fail("probe did not return one HTTP 200 row");
  const row = value.rows[0];
  if (!row || row.id !== expected.job_id || row.user_id !== expected.user_id || row.status !== "queued" || row.attempt_count !== 0 || row.policy_snapshot_digest !== expected.policy_snapshot_digest) fail("probe row differs from fixture authority");
  return Object.freeze(row);
}
