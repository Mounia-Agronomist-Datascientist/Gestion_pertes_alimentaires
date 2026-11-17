import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "./service-worker";

export const metadata: Metadata = {
  title: "Pertes — La Brigade",
  description: "Déclaration et suivi des pertes alimentaires et matières",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
