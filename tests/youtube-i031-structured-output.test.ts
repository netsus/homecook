import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const bundle = path.resolve("lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib");

describe("upgraded video final output", () => {
  it("passes the recipe schema inside the source-only sandbox without repairing malformed JSON", async () => {
    const { runCodexExec, extractJsonFromText } = await import(pathToFileURL(path.join(bundle, "codex-vision-client.mjs")).href);
    const { SINGLE_RECIPE_OUTPUT_SCHEMA } = await import(pathToFileURL(path.join(bundle, "codex-vision-keyframes-client.mjs")).href);
    const root = await mkdtemp(path.join(tmpdir(), "youtube-output-schema-"));
    const auth = path.join(root, "auth.json");
    await writeFile(auth, "{}", { mode: 0o600 });
    try {
      const raw = await runCodexExec({
        prompt: "source-only recipe fixture",
        model: "gpt-5.6-sol",
        outputSchema: SINGLE_RECIPE_OUTPUT_SCHEMA,
        outputPath: path.join(root, "result.json"),
        logPath: path.join(root, "model.log"),
        timeoutMs: 1000,
        sandboxAvailable: true,
        codexAuthPath: auth,
        codexBinary: "/fixture/codex",
        runCommandImpl: async (_command: string, args: string[], options: { cwd: string }) => {
          const schemaPath = args[args.indexOf("--output-schema") + 1];
          expect(path.dirname(schemaPath)).toBe(options.cwd);
          const schema = JSON.parse(await readFile(schemaPath, "utf8"));
          expect(schema).toEqual(SINGLE_RECIPE_OUTPUT_SCHEMA);
          expect(schema.additionalProperties).toBe(false);
          expect(schema.required).toEqual(["recipes"]);
          expect(schema.properties.recipes.items.required).toEqual(["title", "ingredients", "steps"]);
          await writeFile(args[args.indexOf("--output-last-message") + 1], '{"recipes":[]}');
          return "";
        },
      });
      expect(JSON.parse(raw)).toEqual({ recipes: [] });
      expect(() => extractJsonFromText('{"recipes":[{"title":"test","ingredients":[],"steps":[]}'))
        .toThrow(/JSON/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
