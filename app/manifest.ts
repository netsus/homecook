import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    description:
      "레시피 찾기, 식단 계획, 장보기, 요리 기록까지 이어지는 무엇을 먹든 서비스",
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/brand/mumeok-symbol-192.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/brand/app-icon-512.png",
        type: "image/png",
      },
    ],
    name: "무엇을 먹든",
    short_name: "무먹",
    start_url: "/",
    theme_color: "#00a1ff",
  };
}
