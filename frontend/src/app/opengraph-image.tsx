import { ImageResponse } from "next/og";

export const alt = "Pregnancy Care: your pregnancy journey, one step at a time";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #FFF7F2 0%, #FCE3E5 100%)",
          color: "#512D46",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "#D45D7A" }} />
          Pregnancy Care
        </div>
        <div style={{ marginTop: 40, fontSize: 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
          Your pregnancy journey, one step at a time.
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#51454D" }}>
          Week-by-week guidance reviewed by clinicians.
        </div>
      </div>
    ),
    size,
  );
}
