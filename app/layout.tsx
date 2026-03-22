import type { Metadata } from "next";
import { Instrument_Serif, Outfit } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Suspense } from "react";

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const outfit = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "StudyMate",
  description: "RAG-powered study companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${instrumentSerif.variable} ${outfit.variable} antialiased`}
      >
        <ConvexClientProvider>
          <div className="flex h-screen overflow-hidden">
            <Suspense>
              <Sidebar />
            </Suspense>
            <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
