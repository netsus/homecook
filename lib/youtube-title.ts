const HTML_ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&amp;/gi, "&"],
  [/&quot;/gi, "\""],
  [/&#39;/gi, "'"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
];

const BRACKETED_NOISE =
  "(?:eng|sub|자막|광고|협찬|레시피|shorts?|쇼츠|recipe)";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeCommonHtmlEntities(value: string) {
  return HTML_ENTITY_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

export function cleanYoutubeTitle(
  rawTitle: string | null | undefined,
  {
    channelTitle,
    fallback = "유튜브 영상 레시피",
  }: {
    channelTitle?: string | null;
    fallback?: string;
  } = {},
) {
  let title = decodeCommonHtmlEntities(rawTitle ?? "")
    .replace(/\s*[-|]\s*YouTube\s*$/i, "")
    .replace(/\s+#(?:shorts|쇼츠)\b/gi, "")
    .replace(new RegExp(`\\s*\\[${BRACKETED_NOISE}\\]\\s*`, "gi"), " ")
    .replace(new RegExp(`\\s*\\(${BRACKETED_NOISE}\\)\\s*`, "gi"), " ");

  const trimmedChannel = channelTitle?.trim();
  if (trimmedChannel) {
    title = title.replace(
      new RegExp(`\\s*(?:-|\\|)\\s*${escapeRegExp(trimmedChannel)}\\s*$`, "i"),
      "",
    );
  }

  title = title.replace(/\s{2,}/g, " ").trim();
  return title || fallback;
}
