import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

// Se ejecuta antes de pintar: aplica el tema guardado (o el del sistema) para
// evitar el parpadeo claro→oscuro en la carga.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

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
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
