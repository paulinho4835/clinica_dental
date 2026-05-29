import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Restricción dura: nada de optimización de imágenes porque NO se suben imágenes.
  // Todo lo clínico se renderiza como SVG desde datos estructurados (JSONB).
};

export default nextConfig;
