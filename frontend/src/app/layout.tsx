import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "ScaleUp | Business Analytics",
    template: "%s | ScaleUp",
  },
  description:
    "Upload your sales, stock, expense and customer review files. Find out why your sales changed, with the evidence behind every answer.",
  openGraph: {
    type: "website",
    siteName: "ScaleUp",
    title: "ScaleUp | Find out why your sales changed",
    description:
      "Upload your business files and get answers to your questions, with the evidence behind every answer.",
    images: [
      {
        url: "/video/walkthrough-poster.png",
        width: 1920,
        height: 1080,
        alt: "ScaleUp walkthrough showing CSV checks, a business dashboard and an evidence-backed answer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScaleUp | Find out why your sales changed",
    description:
      "Upload your business files and get answers to your questions, with the evidence behind every answer.",
    images: ["/video/walkthrough-poster.png"],
  },
  icons: {
    icon: "/scaleup-mark.png",
    apple: "/scaleup-mark.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} font-sans h-full`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-[#F6F1E8] text-[#1F2A44] antialiased font-sans selection:bg-[#C6A75E] selection:text-[#1F2A44]"
        suppressHydrationWarning
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
