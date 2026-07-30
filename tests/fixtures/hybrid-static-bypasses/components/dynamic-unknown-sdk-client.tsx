"use client";

export async function mutateThroughUnknownDynamicModule(specifier: string) {
  const loaded = await import(specifier);
  loaded.remove(["unsafe.png"]);

  const { upload } = await import(specifier);
  upload("unsafe.png", new Blob());

  const update = loaded.update;
  update("unsafe.png", new Blob());

  loaded.move("unsafe.png", "unsafe-moved.png");
  loaded.copy("unsafe.png", "unsafe-copy.png");
  loaded.createSignedUploadUrl("unsafe.png");
}
