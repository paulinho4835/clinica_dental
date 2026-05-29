import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DentalSaaS — Gestión de Clínicas Dentales",
  description: "Gestión integral multi-clínica. Sin imágenes: odontograma vectorial y datos estructurados.",
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
