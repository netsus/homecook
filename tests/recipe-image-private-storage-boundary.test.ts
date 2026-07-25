import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724140000_recipe_image_private_storage_boundary.sql",
);

describe("managed recipe image private Storage boundary", () => {
  it("creates a private, size-limited, MIME-limited bucket", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);

    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toMatch(
      /insert into storage\.buckets[\s\S]*'recipe-images-private'[\s\S]*5242880[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/i,
    );
    expect(migration).toMatch(
      /on conflict \(id\) do update[\s\S]*public\s*=\s*false/i,
    );
  });

  it("does not grant browser roles direct private object mutation or read", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);

    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).toMatch(
      /drop policy if exists recipe_images_private_select[\s\S]*on storage\.objects/i,
    );
    expect(migration).toMatch(
      /drop policy if exists recipe_images_private_insert[\s\S]*on storage\.objects/i,
    );
    expect(migration).toMatch(
      /drop policy if exists recipe_images_private_update[\s\S]*on storage\.objects/i,
    );
    expect(migration).toMatch(
      /drop policy if exists recipe_images_private_delete[\s\S]*on storage\.objects/i,
    );
    expect(migration).not.toMatch(
      /create policy[\s\S]*bucket_id\s*=\s*'recipe-images-private'/i,
    );
  });
});
