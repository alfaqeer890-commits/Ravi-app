import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Brush,
  CalendarCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  Home,
  KeyRound,
  Megaphone,
  MessageSquare,
  ScrollText,
  Settings,
  UserRound,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { can, canAny, type Me } from "@/lib/access";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { ensureMe, listNotifications, markNotifications, setLanguage } from "@/lib/server/api";
import { useRemote } from "@/components/remote";
import { Button, cx } from "@/components/ui";
import { HomeModule } from "@/components/modules/home";
import { ProfileModule } from "@/components/modules/profile";
import { StaffModule } from "@/components/modules/staff";
import { StudentsModule } from "@/components/modules/students";
import { AttendanceModule } from "@/components/modules/attendance";
import { LeaveModule } from "@/components/modules/leave";
import { ComplaintsModule } from "@/components/modules/complaints";
import { ReportsModule } from "@/components/modules/reports";
import { TimetableModule, MenuModule, CleaningModule, MealsModule } from "@/components/modules/schedules";
import { AnnouncementsModule, RecordsModule, UsersModule, SettingsModule, ActivityModule } from "@/components/modules/desk";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  profile: UserRound,
  staff: Users,
  students: GraduationCap,
  attendance: CalendarCheck,
  leave: CalendarDays,
  complaints: MessageSquare,
  reports: FileText,
  timetable: BookOpen,
  menu: Utensils,
  cleaning: Brush,
  meals: Utensils,
  announcements: Megaphone,
  records: ScrollText,
  users: KeyRound,
  settings: Settings,
  activity: ScrollText,
};

function navFor(me: Me): { id: string; label: MessageKey }[] {
  const items: { id: string; label: MessageKey }[] = [
    { id: "home", label: "nav.home" },
    { id: "profile", label: "nav.profile" },
  ];
  const add = (id: string, label: MessageKey, show: boolean) => {
    if (show) items.push({ id, label });
  };
  add("staff", "nav.staff", can(me, "directory.view") || me.staffId != null);
  add("students", "nav.students", canAny(me, ["students.view", "students.manage"]));
  add("attendance", "nav.attendance", canAny(me, ["attendance.students", "attendance.staff", "attendance.own"]));
  add("leave", "nav.leave", canAny(me, ["leave.view", "leave.submit", "leave.class_review", "leave.final", "leave.receive", "leave.absence"]));
  add("complaints", "nav.complaints", me.role === "super_admin" || canAny(me, ["complaints.submit", "complaints.manage"]) || me.assignedComplaints > 0);
  add("reports", "nav.reports", can(me, "reports.manage") || (me.ownReportEnabled && me.staffId != null));
  add("timetable", "nav.timetable", canAny(me, ["schedules.academic", "schedules.manage"]));
  add("menu", "nav.menu", canAny(me, ["schedules.food", "schedules.manage"]));
  add("cleaning", "nav.cleaning", canAny(me, ["schedules.cleaning", "schedules.manage"]));
  add("meals", "nav.meals", canAny(me, ["schedules.meals", "schedules.manage"]));
  add("announcements", "nav.announcements", canAny(me, ["announcements.view", "announcements.manage"]));
  add("records", "nav.records", canAny(me, ["records.view", "records.manage"]));
  add("users", "nav.users", me.role === "super_admin");
  add("settings", "nav.settings", me.role === "super_admin");
  add("activity", "nav.activity", me.role === "super_admin");
  return items;
}

export function BootScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-6">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy text-xl font-semibold text-paper">N</div>
        <p className="mt-4 text-2xl font-semibold text-ink">Nizam</p>
      </div>
    </main>
  );
}

export function AppShell({ section, onSection }: { section: string; onSection: (section: string) => void }) {
  const { user, isPending } = useCurrentUserState();
  const { lang, setLang, t } = useI18n();
  const meQuery = useRemote(["me", user?.id], () => ensureMe(), Boolean(user));
  const notes = useRemote(["notes", user?.id], () => listNotifications(), Boolean(user && meQuery.data));
  const [syncedLang, setSyncedLang] = useState(false);
  const [more, setMore] = useState(false);
  const [bell, setBell] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!meQuery.data || syncedLang) return;
    setLang(meQuery.data.language);
    setSyncedLang(true);
  }, [meQuery.data, setLang, syncedLang]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (isPending || (user && meQuery.isPending)) return <BootScreen />;
  if (!user) return null;
  if (meQuery.isError) {
    return (
      <main className="grid min-h-screen place-items-center bg-ivory p-6">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-lg font-semibold">{t("state.error")}</p>
          <Button onClick={() => meQuery.refetch()}>{t("action.retry")}</Button>
        </div>
      </main>
    );
  }
  const me = meQuery.data;
  if (!me) return <BootScreen />;
  if (me.status === "pending") {
    return (
      <main className="grid min-h-screen place-items-center bg-ivory p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">{t("state.pending")}</h1>
          <UserButton />
        </div>
      </main>
    );
  }
  if (me.status === "disabled") {
    return (
      <main className="grid min-h-screen place-items-center bg-ivory p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">{t("state.disabled")}</h1>
          <UserButton />
        </div>
      </main>
    );
  }

  const items = navFor(me);
  const current = items.some((item) => item.id === section) ? section : "home";
  const currentLabel = items.find((item) => item.id === current)?.label ?? "nav.home";
  const unread = (notes.data ?? []).filter((note) => !note.read_at).length;
  const mobile = items.slice(0, 4);
  const overflow = items.slice(4);

  async function chooseLanguage(next: "en" | "ur") {
    setLang(next);
    await setLanguage({ data: { language: next } });
  }

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <div className="md:grid md:grid-cols-[240px_1fr]">
        <aside className="no-print hidden min-h-screen flex-col bg-navy text-paper md:flex">
          <div className="flex items-center gap-3 px-5 py-6">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal text-lg font-semibold">N</div>
            <div>
              <p className="text-lg font-semibold leading-none">{t("app.name")}</p>
              <p className="mt-1 text-sm text-foam">{pickInstitution(me, lang)}</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {items.map((item) => {
              const Icon = ICONS[item.id] ?? Home;
              const active = item.id === current;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSection(item.id)}
                  className={cx(
                    "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium",
                    active ? "bg-paper/15 text-paper" : "text-foam hover:bg-paper/10",
                  )}
                >
                  <Icon className="size-4" />
                  {t(item.label)}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ivory/95 px-4 py-3 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{t(currentLabel)}</p>
              <p className="text-xs text-slate">{online ? t("state.synced") : t("state.offline")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="h-11 rounded-xl px-3 text-sm font-semibold text-slate" onClick={() => chooseLanguage(lang === "en" ? "ur" : "en")}>
                {lang === "en" ? "اردو" : "EN"}
              </button>
              <button type="button" className="relative grid h-11 w-11 place-items-center rounded-xl bg-paper" onClick={() => setBell((open) => !open)} aria-label={t("notify.title")}>
                <Bell className="size-4" />
                {unread > 0 ? <span className="num absolute end-1 top-1 rounded-full bg-teal px-1 text-xs text-paper">{unread}</span> : null}
              </button>
              <UserButton />
            </div>
          </header>
          {bell ? (
            <div className="no-print border-b border-line bg-paper px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">{t("notify.title")}</p>
                <Button
                  tone="quiet"
                  onClick={() => {
                    void markNotifications({ data: { all: true } }).then(() => notes.refetch());
                  }}
                >
                  {t("notify.read")}
                </Button>
              </div>
              {(notes.data ?? []).length === 0 ? <p className="text-sm text-slate">{t("notify.empty")}</p> : null}
              <div className="space-y-2">
                {(notes.data ?? []).map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="block w-full rounded-xl bg-ivory px-3 py-2 text-start"
                    onClick={() => {
                      void markNotifications({ data: { id: note.id } }).then(() => notes.refetch());
                      if (note.href) onSection(note.href);
                      setBell(false);
                    }}
                  >
                    <p className="font-medium">{lang === "ur" ? note.title_ur : note.title_en}</p>
                    <p className="text-sm text-slate">{lang === "ur" ? note.body_ur : note.body_en}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!online ? <p className="no-print bg-danger-soft px-4 py-2 text-sm text-danger">{t("state.offline")}</p> : null}
          <main className="px-4 py-5 pb-28 md:pb-10">
            {current === "home" ? <HomeModule me={me} onSection={onSection} /> : null}
            {current === "profile" ? <ProfileModule me={me} /> : null}
            {current === "staff" ? <StaffModule me={me} /> : null}
            {current === "students" ? <StudentsModule me={me} /> : null}
            {current === "attendance" ? <AttendanceModule me={me} /> : null}
            {current === "leave" ? <LeaveModule me={me} /> : null}
            {current === "complaints" ? <ComplaintsModule me={me} /> : null}
            {current === "reports" ? <ReportsModule me={me} /> : null}
            {current === "timetable" ? <TimetableModule me={me} /> : null}
            {current === "menu" ? <MenuModule me={me} /> : null}
            {current === "cleaning" ? <CleaningModule me={me} /> : null}
            {current === "meals" ? <MealsModule me={me} /> : null}
            {current === "announcements" ? <AnnouncementsModule me={me} /> : null}
            {current === "records" ? <RecordsModule me={me} /> : null}
            {current === "users" ? <UsersModule /> : null}
            {current === "settings" ? <SettingsModule /> : null}
            {current === "activity" ? <ActivityModule /> : null}
          </main>
        </div>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-paper md:hidden">
        {mobile.map((item) => {
          const Icon = ICONS[item.id] ?? Home;
          return (
            <button key={item.id} type="button" className={cx("flex h-16 flex-col items-center justify-center text-xs", item.id === current ? "text-teal" : "text-slate")} onClick={() => onSection(item.id)}>
              <Icon className="size-4" />
              {t(item.label)}
            </button>
          );
        })}
        <button type="button" className="flex h-16 flex-col items-center justify-center text-xs text-slate" onClick={() => setMore(true)}>
          <ScrollText className="size-4" />
          {t("nav.more")}
        </button>
      </nav>
      {more ? (
        <div className="fixed inset-0 z-30 bg-navy/40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-paper p-4" onClick={(event) => event.stopPropagation()}>
            <div className="grid grid-cols-2 gap-2">
              {overflow.map((item) => (
                <Button key={item.id} tone="quiet" onClick={() => { onSection(item.id); setMore(false); }}>
                  {t(item.label)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pickInstitution(me: Me, lang: "en" | "ur") {
  return lang === "ur" ? me.institutionUr || me.institutionEn : me.institutionEn;
}
