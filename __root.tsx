import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LanguageProvider } from "@/lib/i18n";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Nizam";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 4000 },
  },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#1a2744" },
      { name: "description", content: "Nizam — bilingual institution operations for staff, students, schedules, and records." },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LanguageProvider>
              <Outlet />
              <Toaster position="top-center" />
            </LanguageProvider>
          </AuthProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  ),
});
