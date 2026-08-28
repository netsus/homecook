import { createHash } from "node:crypto";

function assertIJsonString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("RFC8785 requires I-JSON strings without lone UTF-16 surrogates.");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("RFC8785 requires I-JSON strings without lone UTF-16 surrogates.");
    }
  }
}

function serialize(value, ancestors) {
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    assertIJsonString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("RFC8785 only permits finite JSON numbers.");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`RFC8785 cannot serialize unsupported ${typeof value} values.`);
  }
  if (ancestors.has(value)) throw new Error("RFC8785 cannot serialize cyclic values.");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => serialize(entry, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("RFC8785 only serializes plain JSON objects.");
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => {
      assertIJsonString(key);
      return `${JSON.stringify(key)}:${serialize(value[key], ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJcs(value) {
  return serialize(value, new Set());
}

class StrictJsonParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  error(message) {
    const byte = Buffer.byteLength(this.source.slice(0, this.index));
    throw new Error(`Invalid JSON at byte ${byte}: ${message}`);
  }

  skipWhitespace() {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) this.error("trailing content");
    return value;
  }

  parseValue() {
    const current = this.source[this.index];
    if (current === "{") return this.parseObject();
    if (current === "[") return this.parseArray();
    if (current === "\"") return this.parseString();
    if (current === "t") return this.parseLiteral("true", true);
    if (current === "f") return this.parseLiteral("false", false);
    if (current === "n") return this.parseLiteral("null", null);
    if (current === "-" || /[0-9]/u.test(current ?? "")) return this.parseNumber();
    this.error("expected a JSON value");
  }

  parseLiteral(token, value) {
    if (this.source.slice(this.index, this.index + token.length) !== token) {
      this.error(`expected ${token}`);
    }
    this.index += token.length;
    return value;
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const current = this.source[this.index];
      if (current === "\"") {
        this.index += 1;
        let value;
        try {
          value = JSON.parse(this.source.slice(start, this.index));
        } catch {
          this.error("invalid JSON string");
        }
        assertIJsonString(value);
        return value;
      }
      if (current === "\\") {
        this.index += 1;
        const escaped = this.source[this.index];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(this.source.slice(this.index + 1, this.index + 5))) {
            this.error("invalid Unicode escape");
          }
          this.index += 5;
          continue;
        }
        if (!'\"\\/bfnrt'.includes(escaped ?? "")) this.error("invalid string escape");
        this.index += 1;
        continue;
      }
      if ((current?.charCodeAt(0) ?? 0) < 0x20) this.error("unescaped control character");
      this.index += 1;
    }
    this.error("unterminated string");
  }

  parseNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(
      this.source.slice(this.index),
    );
    if (!match) this.error("invalid number");
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.error("number must be finite");
    return value;
  }

  parseArray() {
    const result = [];
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (true) {
      this.skipWhitespace();
      result.push(this.parseValue());
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return result;
      }
      if (this.source[this.index] !== ",") this.error("expected ',' or ']'");
      this.index += 1;
    }
  }

  parseObject() {
    const result = Object.create(null);
    const keys = new Set();
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== "\"") this.error("expected an object key");
      const key = this.parseString();
      if (keys.has(key)) throw new Error(`Duplicate JSON key rejected: ${JSON.stringify(key)}`);
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") this.error("expected ':'");
      this.index += 1;
      this.skipWhitespace();
      result[key] = this.parseValue();
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return result;
      }
      if (this.source[this.index] !== ",") this.error("expected ',' or '}'");
      this.index += 1;
    }
  }
}

export function parseCanonicalJcs(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("Canonical JSON input must be a nonempty UTF-8 string.");
  }
  const value = new StrictJsonParser(source).parse();
  if (canonicalizeJcs(value) !== source) {
    throw new Error("JSON input is not canonical RFC8785 JCS.");
  }
  return value;
}

export function sha256Jcs(value) {
  return createHash("sha256").update(canonicalizeJcs(value), "utf8").digest("hex");
}
