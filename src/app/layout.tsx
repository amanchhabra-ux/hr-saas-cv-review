import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CV Review",
  description: "Upload, view original candidate CVs, review, and notify candidate decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
