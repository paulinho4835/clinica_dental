import type { MetadataRoute } from "next";

// Manifest PWA: permite "instalar" la app en tablet/celular de recepción y
// abrirla en modo standalone (sin barra del navegador).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dentia — Gestión de Clínicas Dentales",
    short_name: "Dentia",
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
      // PNG generados (lib/brandIcon). Chrome/Android exigen 192 y 512 PNG para
      // ofrecer "Instalar app"; el "maskable" evita que recorten el ícono.
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
