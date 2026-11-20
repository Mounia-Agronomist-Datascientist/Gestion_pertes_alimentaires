import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "./service-worker";

/** Police de la charte (site de La Brigade de Véro), servie par l'application elle-même. */
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Pertes — La Brigade",
  description: "Déclaration et suivi des pertes alimentaires et matières",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e8001c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={nunito.variable}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
