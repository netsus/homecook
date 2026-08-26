function parseGlobTokens(pattern) {
  const tokens = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      const doubleStar = pattern[index + 1] === "*";
      tokens.push({ type: doubleStar ? "double-star" : "star" });
      if (doubleStar) index += 1;
    } else if (character === "?") {
      tokens.push({ type: "any" });
    } else if (character === "[") {
      const closeIndex = pattern.indexOf("]", index + 1);
      if (closeIndex === -1 || closeIndex === index + 1) return null;
      tokens.push({ content: pattern.slice(index + 1, closeIndex), type: "class" });
      index = closeIndex;
    } else {
      tokens.push({ character, type: "literal" });
    }
  }
  return tokens;
}

function classMatches(content, character) {
  const negated = content[0] === "!" || content[0] === "^";
  const body = negated ? content.slice(1) : content;
  let matched = false;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index + 1] === "-" && body[index + 2] !== undefined) {
      matched ||= character >= body[index] && character <= body[index + 2];
      index += 2;
    } else {
      matched ||= character === body[index];
    }
  }
  return negated ? !matched : matched;
}

function tokenMatches(token, character) {
  if (token.type === "literal") return token.character === character;
  if (token.type === "any") return character !== "/";
  if (token.type === "class") {
    return character !== "/" && classMatches(token.content, character);
  }
  return false;
}

function globMatches(pattern, value) {
  if (typeof pattern !== "string") return true;
  if (pattern === "~ALL") return true;
  const tokens = parseGlobTokens(pattern);
  if (!tokens) return true;
  const memo = new Map();
  const canMatch = (tokenIndex, valueIndex) => {
    const key = `${tokenIndex}:${valueIndex}`;
    if (memo.has(key)) return memo.get(key);
    if (valueIndex === value.length) {
      const matched = tokens.slice(tokenIndex).every(
        (token) => token.type === "star" || token.type === "double-star",
      );
      memo.set(key, matched);
      return matched;
    }
    if (tokenIndex === tokens.length) {
      memo.set(key, false);
      return false;
    }
    const token = tokens[tokenIndex];
    let matched;
    if (token.type === "star" || token.type === "double-star") {
      const mayConsume = token.type === "double-star" || value[valueIndex] !== "/";
      matched = canMatch(tokenIndex + 1, valueIndex)
        || (mayConsume && canMatch(tokenIndex, valueIndex + 1));
    } else {
      matched = tokenMatches(token, value[valueIndex])
        && canMatch(tokenIndex + 1, valueIndex + 1);
    }
    memo.set(key, matched);
    return matched;
  };
  return canMatch(0, 0);
}

function classCanMatchWithoutSlash(content) {
  if (content[0] === "!" || content[0] === "^") return true;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index + 1] === "-" && content[index + 2] !== undefined) {
      if (content[index] !== "/" || content[index + 2] !== "/") return true;
      index += 2;
    } else if (content[index] !== "/") {
      return true;
    }
  }
  return false;
}

function remainingGlobCanMatchWithoutSlash(tokens, startIndex) {
  return tokens.slice(startIndex).every((token) => {
    if (token.type === "star" || token.type === "double-star") return true;
    if (token.type === "literal") return token.character !== "/";
    if (token.type === "any") return true;
    return classCanMatchWithoutSlash(token.content);
  });
}

function globCanMatchPrefix(pattern, prefix) {
  const tokens = parseGlobTokens(pattern);
  if (!tokens) return true;
  const memo = new Map();
  const canMatch = (tokenIndex, prefixIndex) => {
    const key = `${tokenIndex}:${prefixIndex}`;
    if (memo.has(key)) return memo.get(key);
    if (prefixIndex === prefix.length) {
      const matched = remainingGlobCanMatchWithoutSlash(tokens, tokenIndex);
      memo.set(key, matched);
      return matched;
    }
    if (tokenIndex === tokens.length) {
      memo.set(key, false);
      return false;
    }
    const token = tokens[tokenIndex];
    let matched;
    if (token.type === "star" || token.type === "double-star") {
      const mayConsume = token.type === "double-star" || prefix[prefixIndex] !== "/";
      matched = canMatch(tokenIndex + 1, prefixIndex)
        || (mayConsume && canMatch(tokenIndex, prefixIndex + 1));
    } else {
      matched = tokenMatches(token, prefix[prefixIndex])
        && canMatch(tokenIndex + 1, prefixIndex + 1);
    }
    memo.set(key, matched);
    return matched;
  };
  return canMatch(0, 0);
}

function overlapsProductionTagPattern(pattern) {
  if (typeof pattern !== "string" || pattern === "~ALL") return true;
  return globCanMatchPrefix(pattern, "refs/tags/prod-");
}

export function productionReleaseRulesetConflictsWithCanonicalTarget(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include;
  if (!Array.isArray(include) || include.length === 0) return true;
  if (ruleset.target === "branch") {
    return include.some((entry) =>
      entry === "~DEFAULT_BRANCH" || globMatches(entry, "refs/heads/master"));
  }
  if (ruleset.target === "tag") {
    return include.some(overlapsProductionTagPattern);
  }
  return true;
}
