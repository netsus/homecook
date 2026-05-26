import { createHash } from "node:crypto";

const SENSITIVE_KEY_PATTERNS = [
  /token/iu,
  /^code$/iu,
  /^next$/iu,
  /^error$/iu,
  /^q$/iu,
  /search/iu,
  /query/iu,
  /email/iu,
  /nickname/iu,
  /password/iu,
  /secret/iu,
  /authorization/iu,
  /cookie/iu,
  /youtube_?url/iu,
  /raw_?source_?text/iu,
  /source_?text/iu,
  /transcript/iu,
  /caption/iu,
  /shopping/iu,
  /pantry/iu,
  /private/iu,
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const YOUTUBE_URL_PATTERN = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S*/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function shouldDropKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);

    return sanitizedArray.length > 0 ? sanitizedArray : undefined;
  }

  if (isRecord(value)) {
    const sanitized = sanitizeRecord(value);
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  if (typeof value === "string") {
    if (EMAIL_PATTERN.test(value) || YOUTUBE_URL_PATTERN.test(value)) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (
    typeof value === "number"
    || typeof value === "boolean"
    || value === null
  ) {
    return value;
  }

  return undefined;
}

function sanitizeRecord(record: Record<string, unknown>) {
  return Object.entries(record).reduce<Record<string, unknown>>((sanitized, [key, value]) => {
    if (shouldDropKey(key)) {
      return sanitized;
    }

    const sanitizedValue = sanitizeValue(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }

    return sanitized;
  }, {});
}

export function sanitizeOperationalMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return sanitizeRecord(value);
}

export function normalizeRequestPath(value: Request | URL | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Request) {
    return normalizeRequestPath(value.url);
  }

  if (value instanceof URL) {
    return value.pathname;
  }

  try {
    return new URL(value, "http://localhost").pathname;
  } catch {
    const [pathname] = value.split("?");
    return pathname.startsWith("/") ? pathname : null;
  }
}

export function maskEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return null;
  }

  const visible = localPart.length <= 1 ? localPart : localPart.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function hashPrivateValue(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}
