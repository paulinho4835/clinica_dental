import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DentalSaaS — Gestión de Clínicas Dentales",
  description: "Gestión integral multi-clínica. Sin imágenes: odontograma vectorial y datos estructurados.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DentalSaaS",
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5a4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
