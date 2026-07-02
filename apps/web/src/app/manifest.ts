import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyPetLink",
    short_name: "MyPetLink",
    description: "A safe and shareable profile for your pet.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F2",
    theme_color: "#1570EF",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
