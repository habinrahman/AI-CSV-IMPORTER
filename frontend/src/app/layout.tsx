import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "GrowEasy Importer",
    template: "%s · GrowEasy Importer",
  },
  description:
    "AI-powered CSV importer — map any lead CSV into the GrowEasy CRM with semantic field mapping, normalization, and a full audit trail.",
};

// Mobile browser chrome follows the app theme instead of staying white.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Providers>
            {/* Keyboard users skip the navbar in one Tab + Enter. */}
            <a
              href="#main"
              className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              Skip to main content
            </a>
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main id="main" className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </div>
            <Toaster richColors closeButton position="bottom-right" />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
