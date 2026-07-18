import { ImageResponse } from "next/og";

// Logo de la app: constelación de nodos (odontograma) en forma de "d",
// mismo lenguaje visual que el favicon (app/icon.svg) pero con más detalle
// (5 nodos + líneas de conexión) porque estos íconos se ven en tamaños
// grandes (192/512px, instalación de PWA) donde el detalle sí se percibe.
const ICON_SVG_DETAILED = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="dentiaBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#134e4a"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#dentiaBg)"/><g stroke="#2dd4bf" stroke-opacity="0.45" stroke-width="10"><line x1="205" y1="185" x2="110" y2="300"/><line x1="110" y1="300" x2="205" y2="415"/><line x1="205" y1="415" x2="330" y2="345"/><line x1="205" y1="185" x2="330" y2="255"/><line x1="330" y1="345" x2="330" y2="255"/><line x1="330" y1="255" x2="330" y2="105"/></g><circle cx="205" cy="185" r="30" fill="#2dd4bf"/><rect x="80" y="270" width="60" height="60" rx="18" fill="#5eead4"/><circle cx="205" cy="415" r="26" fill="#2dd4bf"/><rect x="300" y="315" width="60" height="60" rx="18" fill="#5eead4"/><circle cx="330" cy="105" r="34" fill="#14b8a6"/></svg>`;

const DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG_DETAILED)}`;

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
