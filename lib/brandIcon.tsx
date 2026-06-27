import { ImageResponse } from "next/og";

// Logo de la app (diente sobre fondo de marca). Mismo arte que app/icon.svg; se
// rasteriza a PNG para los íconos del manifest PWA (Chrome exige PNG 192/512 para
// permitir "Instalar app"; el SVG solo no alcanza en Android/Chrome).
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0ea5a4"/><path fill="#ffffff" d="M256 104c-44 0-66 22-110 22-38 0-58-18-58 40 0 52 18 88 34 140 12 39 18 78 34 96 14 16 30 6 36-22 7-32 12-68 30-68s23 36 30 68c6 28 22 38 36 22 16-18 22-57 34-96 16-52 34-88 34-140 0-58-20-40-58-40-44 0-66-22-110-22z"/></svg>`;

const DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`;

// Genera un PNG cuadrado del logo en el tamaño pedido. Lo usan las rutas
// /icons/192 y /icons/512 referenciadas por el manifest.
export function renderIconPng(size: number): ImageResponse {
  return new ImageResponse(
    (
      <img
        width={size}
        height={size}
        src={DATA_URI}
        style={{ width: size, height: size }}
        alt=""
      />
    ),
    { width: size, height: size },
  );
}
