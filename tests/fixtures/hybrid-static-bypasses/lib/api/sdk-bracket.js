export function removeThroughBracketSdk(objectPath) {
  return window.supabase["storage"]["from"]("recipe-images")["remove"]([
    objectPath,
  ]);
}
