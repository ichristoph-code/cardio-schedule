import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CardioSchedule",
    short_name: "CardioSchedule",
    description: "Cardiology practice scheduling platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#e8f3ff",
    theme_color: "#1d63c7",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
