export function removeFromUnsafeFeature() {
  return fetch("/storage/v1/object/recipe-images/feature.png", {
    method: "DELETE",
  });
}
