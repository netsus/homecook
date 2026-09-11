import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ build: vi.fn(), headers: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }), redirect: vi.fn((location: string) => { throw new Error(`REDIRECT:${location}`); }) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, permanentRedirect: mocks.redirect }));
vi.mock("@/lib/server/marketing-round2-page", () => ({ buildRound2Page: mocks.build }));
vi.mock("@/components/marketing/round2/round2-landing", () => ({ Round2Landing: () => null }));
beforeEach(() => { vi.clearAllMocks(); mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3100" })); });
const request = { params: Promise.resolve({ topic: "recording" }), searchParams: Promise.resolve({ utm_source: ["ig", "fb"], email: "never-collect@example.com" }) };
describe("R2 server route", () => {
  it("passes server route topic and duplicate attribution query to GET-only helper", async () => {
    const { default: page, dynamic, runtime } = await import("@/app/beta/r2/[topic]/page");
    mocks.build.mockResolvedValue({ kind: "page", props: { topic: "recording", pageContext: "signed-context", attribution: {}, preview: true, leadReady: true, turnstileSiteKey: "" } });
    const output = await page(request);
    expect(dynamic).toBe("force-dynamic"); expect(runtime).toBe("nodejs");
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/beta/r2/recording", host: "localhost:3100", rawSearch: "utm_source=ig&utm_source=fb" }));
    expect(JSON.stringify(output)).toContain("mumeok-r2-page-context");
    expect(JSON.stringify(output)).not.toContain("never-collect@example.com");
  });
  it("uses a true 404 for disabled and unknown routes", async () => {
    const { default: page } = await import("@/app/beta/r2/[topic]/page"); mocks.build.mockResolvedValue(null);
    await expect(page(request)).rejects.toThrow("NOT_FOUND");
  });
  it("has query-free canonical metadata for both exact topics", async () => {
    const { generateMetadata } = await import("@/app/beta/r2/[topic]/page");
    for (const topic of ["recording", "homeflow"]) expect(await generateMetadata({ params: Promise.resolve({ topic }) })).toMatchObject({ alternates: { canonical: `/beta/r2/${topic}` }, robots: { index: false, follow: false }, referrer: "no-referrer" });
    await expect(generateMetadata({ params: Promise.resolve({ topic: "unknown" }) })).rejects.toThrow("NOT_FOUND");
  });
});
