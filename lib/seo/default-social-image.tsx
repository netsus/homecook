import { ImageResponse } from "next/og";

export const socialImageAlt = "집밥 — 레시피부터 장보기, 요리 기록까지";
export const socialImageSize = { height: 630, width: 1200 };
export const socialImageContentType = "image/png";

export function createDefaultSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #fff8eb 0%, #ffe0a8 100%)",
          color: "#2f241d",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: "72px",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "flex-start",
            background: "#fffdf8",
            border: "4px solid #2f241d",
            borderRadius: "40px",
            boxShadow: "18px 18px 0 #ff8a3d",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "center",
            padding: "64px 72px",
            width: "100%",
          }}
        >
          <div style={{ color: "#ff6b24", display: "flex", fontSize: 34, fontWeight: 800 }}>
            HOMECOOK
          </div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 900, letterSpacing: -3, marginTop: 12 }}>
            GOOD FOOD,
          </div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 900, letterSpacing: -3 }}>
            MADE SIMPLE.
          </div>
          <div style={{ color: "#76645a", display: "flex", fontSize: 30, fontWeight: 600, marginTop: 28 }}>
            RECIPE  ·  PLAN  ·  SHOP  ·  COOK
          </div>
        </div>
      </div>
    ),
    socialImageSize,
  );
}
