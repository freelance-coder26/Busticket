import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Administration | Gorohitech Billetterie",
  description: "Administration sécurisée de la billetterie de bus.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
