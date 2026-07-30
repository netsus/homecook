export function uploadThroughAliasedSdk(file) {
  const sdk = window.supabase;
  const storageAlias = sdk["storage"];
  const bucketAlias = storageAlias["from"]("recipe-images");
  return bucketAlias["upload"]("unsafe.png", file);
}
