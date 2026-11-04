import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Clerk's sign-in and account menu use the app's colour tokens, so they
// follow light/dark mode with everything else.
const clerkAppearance = {
  variables: {
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorNeutral: "var(--foreground)",
    colorInput: "var(--card)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    fontFamily: "var(--font-sans)",
    borderRadius: "0.75rem",
  },
};

export const metadata: Metadata = {
  title: "Sheet2Dash",
  description: "A live dashboard for a small cake business, built from its Google Sheet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the home indicator; the tab bar pads itself with the safe area.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      {/* The theme script toggles `.dark` on <html> before React hydrates. */}
      <html lang="en-AU" className="h-full antialiased" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
        <body className="flex min-h-full flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
