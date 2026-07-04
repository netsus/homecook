import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("OAuth userinfo proxy", () => {
  it("normalizes Naver userinfo into top-level Supabase OAuth claims", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        resultcode: "00",
        message: "success",
        response: {
          id: "naver-user-1",
          email: "cook@example.com",
          name: "홍길동",
          nickname: "길동",
          profile_image: "https://example.com/naver.png",
        },
      }),
    );

    const { GET } = await import("@/app/api/auth/oauth-userinfo/naver/route");
    const response = await GET(
      new Request("http://localhost:3000/api/auth/oauth-userinfo/naver", {
        headers: {
          Authorization: "Bearer naver-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      sub: "naver-user-1",
      email: "cook@example.com",
      email_verified: true,
      name: "홍길동",
      nickname: "길동",
      avatar_url: "https://example.com/naver.png",
      picture: "https://example.com/naver.png",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://openapi.naver.com/v1/nid/me", {
      headers: {
        Authorization: "Bearer naver-token",
        Accept: "application/json",
      },
    });
  });

  it("normalizes Kakao userinfo into top-level Supabase OAuth claims without requiring email", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        id: 123456789,
        kakao_account: {
          profile: {
            nickname: "춘식이",
            profile_image_url: "https://example.com/kakao.png",
          },
        },
      }),
    );

    const { GET } = await import("@/app/api/auth/oauth-userinfo/kakao/route");
    const response = await GET(
      new Request("http://localhost:3000/api/auth/oauth-userinfo/kakao", {
        headers: {
          Authorization: "Bearer kakao-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      sub: "123456789",
      name: "춘식이",
      nickname: "춘식이",
      avatar_url: "https://example.com/kakao.png",
      picture: "https://example.com/kakao.png",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://kapi.kakao.com/v2/user/me", {
      headers: {
        Authorization: "Bearer kakao-token",
        Accept: "application/json",
      },
    });
  });

  it("rejects userinfo proxy requests without a bearer token", async () => {
    const { GET } = await import("@/app/api/auth/oauth-userinfo/naver/route");
    const response = await GET(
      new Request("http://localhost:3000/api/auth/oauth-userinfo/naver"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "missing_bearer_token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a stable upstream error without leaking provider payloads", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error: "invalid_token",
          access_token: "should-not-leak",
        },
        { status: 401 },
      ),
    );

    const { GET } = await import("@/app/api/auth/oauth-userinfo/kakao/route");
    const response = await GET(
      new Request("http://localhost:3000/api/auth/oauth-userinfo/kakao", {
        headers: {
          Authorization: "Bearer expired-token",
        },
      }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "provider_userinfo_failed",
    });
  });

  it("returns a stable upstream error when the provider request throws", async () => {
    fetchMock.mockRejectedValue(new Error("network failed"));

    const { GET } = await import("@/app/api/auth/oauth-userinfo/naver/route");
    const response = await GET(
      new Request("http://localhost:3000/api/auth/oauth-userinfo/naver", {
        headers: {
          Authorization: "Bearer naver-token",
        },
      }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "provider_userinfo_failed",
    });
  });
});
