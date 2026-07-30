const bucket = client.storage.from("recipe-images");
const destroy = bucket.remove;

export function removeDynamicObject() {
  return destroy(["dynamic.png"]);
}
