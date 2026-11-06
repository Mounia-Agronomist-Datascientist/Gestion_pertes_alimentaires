import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pertes — La Brigade",
    short_name: "Pertes",
    description: "Déclaration et suivi des pertes alimentaires et matières",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    lang: "fr",
  };
}
