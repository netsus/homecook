import type { NextConfig } from "next";

const isQaFixtureServer = process.env.HOMECOOK_ENABLE_QA_FIXTURES === "1";
const isProduction = process.env.NODE_ENV === "production";

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function getOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin: string | null) {
  if (!origin) {
    return null;
  }

  if (origin.startsWith("https://")) {
    return origin.replace("https://", "wss://");
  }

  if (origin.startsWith("http://")) {
    return origin.replace("http://", "ws://");
  }

  return null;
}

function joinDirective(name: string, sources: string[]) {
  return `${name} ${sources.join(" ")}`;
}

function buildContentSecurityPolicy() {
  const supabaseOrigin = getOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const appOrigin = getOrigin(process.env.NEXT_PUBLIC_APP_URL);

  const devConnectSources = isProduction
    ? []
    : [
        "http://127.0.0.1:54321",
        "http://localhost:54321",
        "ws://127.0.0.1:3000",
        "ws://127.0.0.1:3100",
        "ws://localhost:3000",
        "ws://localhost:3100",
        toWebSocketOrigin(appOrigin),
      ];
  const devImageSources = isProduction
    ? []
    : [
        "http://127.0.0.1:54321",
        "http://localhost:54321",
        "http://www.foodsafetykorea.go.kr",
      ];

  const directives = [
    joinDirective("default-src", ["'self'"]),
    joinDirective("base-uri", ["'self'"]),
    joinDirective("object-src", ["'none'"]),
    joinDirective("frame-ancestors", ["'none'"]),
    joinDirective("form-action", ["'self'"]),
    joinDirective("script-src", unique([
      "'self'",
      // Static App Router CSP needs inline scripts until a nonce/hash policy is
      // split into a dynamic-rendering follow-up.
      "'unsafe-inline'",
      isProduction ? null : "'unsafe-eval'",
    ])),
    joinDirective("style-src", ["'self'", "'unsafe-inline'"]),
    joinDirective("img-src", unique([
      "'self'",
      "data:",
      "blob:",
      "https:",
      supabaseOrigin,
      ...devImageSources,
    ])),
    joinDirective("font-src", ["'self'", "data:"]),
    joinDirective("connect-src", unique([
      "'self'",
      supabaseOrigin,
      toWebSocketOrigin(supabaseOrigin),
      ...devConnectSources,
    ])),
    joinDirective("media-src", ["'self'", "data:", "blob:"]),
    joinDirective("frame-src", ["'none'"]),
    joinDirective("worker-src", ["'self'", "blob:"]),
    joinDirective("manifest-src", ["'self'"]),
    isProduction ? "upgrade-insecure-requests" : null,
  ];

  return directives.filter(Boolean).join("; ");
}

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(),
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "browsing-topics=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=(self)",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-XSS-Protection",
    value: "0",
  },
];

const noIndexHeaders = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive",
  },
];

const privatePageSources = [
  "/admin/:path*",
  "/cooking/:path*",
  "/leftovers/:path*",
  "/login",
  "/menu/:path*",
  "/menu-add",
  "/mypage/:path*",
  "/onboarding/:path*",
  "/pantry",
  "/planner/:path*",
  "/recipes/new/:path*",
  "/settings",
  "/shopping/:path*",
];

const nextConfig: NextConfig = {
  ...(isQaFixtureServer ? { devIndicators: false } : {}),
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512],
    qualities: [75, 95],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...privatePageSources.map((source) => ({
        headers: noIndexHeaders,
        source,
      })),
    ];
  },
};

export default nextConfig;
