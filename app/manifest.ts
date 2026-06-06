import type { MetadataRoute } from "next";

// Manifest PWA: permite "instalar" la app en tablet/celular de recepción y
// abrirla en modo standalone (sin barra del navegador).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DentalSaaS — Gestión de Clínicas Dentales",
    short_name: "DentalSaaS",
    description: "Gestión integral multi-clínica para clínicas dentales.",
    start_url: "/agenda",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0ea5a4",
    lang: "es",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
