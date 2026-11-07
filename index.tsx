import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AppShell, BootScreen } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" ? search.section : "home",
  }),
  component: Home,
});

function Home() {
  const { user, isPending } = useCurrentUserState();
  const search = Route.useSearch();
  const navigate = useNavigate();
  if (isPending) return <BootScreen />;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppShell
      section={search.section}
      onSection={(section) => {
        void navigate({ to: "/", search: { section } });
      }}
    />
  );
}
