function companyComparisonKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

// Reviewed display aliases only. A new factory or company spelling must not
// inherit the alias from a partial match; the original brand stays untouched.
const REVIEWED_SEMPYO_COMPANIES = new Set([
  "샘표식품주식회사",
  "샘표식품(주)",
  "샘표식품(주)영동공장",
  "샘표식품(주) 이천공장",
  "샘표식품㈜",
  "샘표식품(주)이천공장",
].map(companyComparisonKey));

const EMPTY_COMPANY_VALUES = new Set(["없음", "미상", "n/a", "na", "null", "undefined"]);

function isMissingCompanyName(value: string) {
  return !value || EMPTY_COMPANY_VALUES.has(value.toLowerCase()) || /^[\p{P}\p{S}\s]+$/u.test(value);
}

export function formatRegisteredCompany(brand: string | null): {
  displayName: string;
  originalName: string | null;
} {
  const key = companyComparisonKey(brand ?? "");
  if (isMissingCompanyName(key)) {
    return { displayName: "제품", originalName: null };
  }

  if (REVIEWED_SEMPYO_COMPANIES.has(key)) {
    return { displayName: "샘표", originalName: brand };
  }

  const displayName = key
    .replace(/^주식회사\s*/u, "")
    .replace(/\s*주식회사$/u, "")
    .replace(/\(주\)/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

  return isMissingCompanyName(displayName)
    ? { displayName: "제품", originalName: null }
    : { displayName, originalName: brand };
}
