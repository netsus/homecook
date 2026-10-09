import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261009130000_ingredient_piece_unit_evidence.sql', 'utf8');
const youtubeCatalogGate = readFileSync('scripts/verify-youtube-extraction-current-catalog.mjs', 'utf8');

describe('piece unit evidence migration boundary', () => {
  it('fails closed on the exact six current consumer definitions and keeps owners and ACLs', () => {
    expect(migration.match(/PIECE_UNIT_FUNCTION_BASELINE_MISMATCH:/g)).toHaveLength(6);
    expect(migration).toContain('PIECE_UNIT_ANCHOR_MISMATCH');
    expect(migration).toContain('proowner is distinct from v_owner or proacl is distinct from v_acl');
  });

  it('uses private invoker helpers without adding an exposed RPC or rewriting application rows', () => {
    expect(migration.match(/create function private\./g)).toHaveLength(5);
    expect(migration.match(/from public, anon, authenticated, service_role/g)).toHaveLength(5);
    expect(migration).not.toMatch(/create(?: or replace)? function public\./i);
    expect(migration).not.toMatch(/\b(?:insert into|update|delete from) public\./i);
    expect(migration).not.toContain('security definer');
  });

  it('updates guards and refresh evidence without replacing product wrappers or historical same-quantity branches', () => {
    expect(migration).toContain("'piece_candidates', piece_candidates.candidates");
    expect(migration).toContain("'selected_piece_weight_id', piece_selected.candidate ->> 'piece_weight_id'");
    expect(migration).toContain("'source_observed_amount', evidence.source_observed_amount");
    expect(migration).toContain('mutate_meal_log_entry_prelaunch_20260919');
    expect(migration).not.toContain('v_evidence:=v_entry.nutrition_evidence_json');
    expect(migration).not.toContain('basis_relations');
  });

  it('reproduces only the reviewed fresh-replay legacy alias before applying the immutable migration', () => {
    expect(youtubeCatalogGate).toContain('pieceUnitFreshReplayPredecessorFixture');
    expect(youtubeCatalogGate).toContain('4afb4fcc84f7da82ee0a442266d4a504');
    expect(youtubeCatalogGate).toContain('12d47c748c9b09f7fafdfa4c09404ec4570d06f3e6f5059d22d6af2f3e338074');
    expect(youtubeCatalogGate).toContain('86f9d5ecc2b115aadc00df99dfd70d58');
    expect(youtubeCatalogGate).toContain('06159ee35b958c1980c962aca09dda551949b3dcea9bc989a99971fc7990b88b');
    expect(youtubeCatalogGate).toContain("procedure.proacl = array['postgres=X/postgres']::aclitem[]");
    expect(youtubeCatalogGate).toContain("procedure.proconfig = array['search_path=pg_catalog, public, pg_temp']::text[]");
    expect(youtubeCatalogGate).toContain('set search_path = pg_catalog, public;');
    expect(youtubeCatalogGate).toContain('PIECE_UNIT_FRESH_REPLAY_PREDECESSOR_DRIFT');
    expect(youtubeCatalogGate).toContain('PIECE_UNIT_FRESH_REPLAY_PREDECESSOR_RESTORE_FAILED');
  });
});
