import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema Contable · DC Consultora",
  description: "Sistema contable interno de DC Consultora",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
