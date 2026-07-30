import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  cleanupRecipeEditorImage,
  createRecipeEditorImageDraft,
} from "@/lib/personal-recipe-editor";
import { buildReviewedRecipeTagsPayload } from "@/lib/recipe-tag-input";

describe("personal recipe editor media and tags", () => {
  it("keeps managed object identity separate from its short presentation URL", () => {
    expect(
      createRecipeEditorImageDraft({
        image_object_id: "image-1",
        read_url: "https://signed.example/image-1",
        read_url_expires_at: "2099-01-01T00:00:00.000Z",
        state: "uploaded_unlinked",
      }),
    ).toEqual({
      attachment: "unattached",
      imageObjectId: "image-1",
      readUrl: "https://signed.example/image-1",
      readUrlExpiresAt: "2099-01-01T00:00:00.000Z",
      state: "uploaded_unlinked",
    });
  });

  it("replays one owner-cancel intent with the same UUID after an ambiguous failure", async () => {
    const cancelOwnerUpload = vi
      .fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });
    const idempotencyKey = "550e8400-e29b-41d4-a716-446655440501";
    const image = createRecipeEditorImageDraft({
      image_object_id: "image-1",
      read_url: "https://signed.example/image-1",
      read_url_expires_at: "2099-01-01T00:00:00.000Z",
      state: "uploaded_unlinked",
    });

    await expect(
      cleanupRecipeEditorImage(image, {
        cancelOwnerUpload,
        idempotencyKey,
      }),
    ).resolves.toBe("failed");
    await expect(
      cleanupRecipeEditorImage(image, {
        cancelOwnerUpload,
        idempotencyKey,
      }),
    ).resolves.toBe("complete");

    expect(cancelOwnerUpload).toHaveBeenNthCalledWith(
      1,
      "image-1",
      "550e8400-e29b-41d4-a716-446655440501",
    );
    expect(cancelOwnerUpload).toHaveBeenNthCalledWith(
      2,
      "image-1",
      "550e8400-e29b-41d4-a716-446655440501",
    );
  });

  it.each(["attached_private", "attached_public_shared"])(
    "never cancels an official %s image on shell unmount",
    async (state) => {
      const cancelOwnerUpload = vi.fn();
      const image = createRecipeEditorImageDraft({
        image_object_id: "image-1",
        read_url: "https://signed.example/image-1",
        read_url_expires_at: "2099-01-01T00:00:00.000Z",
        state,
      });

      expect(image.attachment).toBe("attached");
      await expect(
        cleanupRecipeEditorImage(image, {
          cancelOwnerUpload,
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440502",
        }),
      ).resolves.toBe("not-required");
      expect(cancelOwnerUpload).not.toHaveBeenCalled();
    },
  );

  it("turns a rejected owner cancel request into a recoverable failure", async () => {
    const image = createRecipeEditorImageDraft({
      image_object_id: "image-1",
      read_url: "https://signed.example/image-1",
      read_url_expires_at: "2099-01-01T00:00:00.000Z",
      state: "uploaded_unlinked",
    });

    await expect(
      cleanupRecipeEditorImage(image, {
        cancelOwnerUpload: vi.fn().mockRejectedValue(new Error("network")),
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440503",
      }),
    ).resolves.toBe("failed");
  });

  it("reuses tag review payload rules and contains no browser Storage remove fallback", () => {
    expect(
      buildReviewedRecipeTagsPayload({
        isDirty: true,
        tags: ["한식", "초보가능"],
      }),
    ).toEqual(["한식", "초보가능"]);

    const manualScreenSource = readFileSync(
      join(process.cwd(), "components/recipe/manual-recipe-create-screen.tsx"),
      "utf8",
    );
    expect(manualScreenSource).not.toMatch(/storage\s*\.\s*from[\s\S]*\.remove\s*\(/);
  });

  it("keeps every shared mobile editor action at least 44px tall and wide", () => {
    const shellSource = readFileSync(
      join(process.cwd(), "components/recipe/personal-recipe-editor-shell.tsx"),
      "utf8",
    );
    const tagEditorSource = readFileSync(
      join(process.cwd(), "components/recipe/recipe-tag-editor.tsx"),
      "utf8",
    );
    const manualScreenSource = readFileSync(
      join(process.cwd(), "components/recipe/manual-recipe-create-screen.tsx"),
      "utf8",
    );

    expect(shellSource).not.toMatch(/\bh-9 min-w-9\b/);
    expect(shellSource).not.toMatch(/\bh-10 w-10\b/);
    expect(shellSource).not.toMatch(/\bclassName="h-9 shrink-0 rounded-full\b/);
    expect(shellSource).not.toMatch(/\bflex h-10 w-full\b/);
    expect(shellSource).not.toMatch(/\bclassName="flex-1[^"]* py-2\b/);
    expect(tagEditorSource).not.toMatch(/\bclassName="flex h-4 w-4\b/);
    expect(tagEditorSource).not.toMatch(/\bclassName="h-9\b/);
    expect(manualScreenSource).not.toContain("h-[42px]");
    expect(manualScreenSource).not.toContain("h-[38px]");
  });
});
