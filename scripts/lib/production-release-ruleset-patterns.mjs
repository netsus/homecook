function parseGlobTokens(pattern) {
  const tokens = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      let runLength = 1;
      while (pattern[index + runLength] === "*") runLength += 1;
      const segmentBoundary = index === 0 || pattern[index - 1] === "/";
      const globstarDirectory = runLength === 2
        && segmentBoundary
        && pattern[index + 2] === "/";
      if (runLength > 1 && !globstarDirectory) return null;
      tokens.push({ type: globstarDirectory ? "globstar-directory" : "star" });
      if (globstarDirectory) index += 2;
    } else if (character === "?") {
      tokens.push({ type: "any" });
    } else if (character === "[") {
      const closeIndex = pattern.indexOf("]", index + 1);
      if (closeIndex === -1 || closeIndex === index + 1) return null;
      const content = pattern.slice(index + 1, closeIndex);
      if (content.startsWith("^")) return null;
      tokens.push({ content, type: "class" });
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
  if (typeof pattern !== "string") return null;
  if (pattern === "~ALL") return true;
  const tokens = parseGlobTokens(pattern);
  if (!tokens) return null;
  const memo = new Map();
  const canMatch = (tokenIndex, valueIndex) => {
    const key = `${tokenIndex}:${valueIndex}`;
    if (memo.has(key)) return memo.get(key);
    if (valueIndex === value.length) {
      const matched = tokens.slice(tokenIndex).every(
        (token) => token.type === "star" || token.type === "globstar-directory",
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
    if (token.type === "star" || token.type === "globstar-directory") {
      const mayConsume = token.type === "globstar-directory" || value[valueIndex] !== "/";
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
    if (token.type === "star" || token.type === "globstar-directory") return true;
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
    if (token.type === "star" || token.type === "globstar-directory") {
      const mayConsume = token.type === "globstar-directory" || prefix[prefixIndex] !== "/";
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

function excludesAllProductionTags(pattern) {
  return ["~ALL", "refs/tags/**", "refs/tags/*", "refs/tags/prod-*"].includes(pattern);
}

export function productionReleaseRulesetConflictsWithCanonicalTarget(ruleset) {
  if (["push", "repository"].includes(ruleset?.target)) return false;
  if (!ruleset || !["branch", "tag"].includes(ruleset.target)) return true;
  const refName = ruleset?.conditions?.ref_name;
  const include = refName?.include;
  const exclude = refName?.exclude;
  if (
    !Array.isArray(include)
    || include.length === 0
    || !Array.isArray(exclude)
  ) return true;
  if (ruleset.target === "branch") {
    const includeMatches = include.map((entry) =>
      entry === "~DEFAULT_BRANCH" ? true : globMatches(entry, "refs/heads/master"));
    const excludeMatches = exclude.map((entry) =>
      entry === "~DEFAULT_BRANCH" ? true : globMatches(entry, "refs/heads/master"));
    if (includeMatches.includes(null) || excludeMatches.includes(null)) return true;
    return includeMatches.includes(true) && !excludeMatches.includes(true);
  }
  if (include.some((entry) => typeof entry !== "string" || !parseGlobTokens(entry))) {
    return true;
  }
  if (exclude.some((entry) => typeof entry !== "string" || !parseGlobTokens(entry))) {
    return true;
  }
  return include.some(overlapsProductionTagPattern)
    && !exclude.some(excludesAllProductionTags);
}
