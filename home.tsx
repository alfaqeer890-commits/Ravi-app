import { can, canAny, type Me } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { dashboard, listStaff, scheduleIndex } from "@/lib/server/api";
import { useRemote } from "@/components/remote";
import { Card, ShownText } from "@/components/ui";

export function HomeModule({ me, onSection }: { me: Me; onSection: (section: string) => void }) {
  const { t, lang } = useI18n();
  const home = useRemote(["dashboard", me.userId], () => dashboard());
  const staff = useRemote(["staff", me.userId], () => listStaff(), me.staffId != null);
  const schedules = useRemote(["schedule-index", me.userId], () => scheduleIndex(), can(me, "schedules.manage"));
  const mine = (staff.data ?? []).find((profile) => profile.id === me.staffId);
  const data = home.data;

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate">{t("home.welcome")}</p>
        <h2 className="text-2xl font-semibold">{me.name}</h2>
        <p className="text-slate">{me.role === "super_admin" ? t("home.admin") : t("home.staff")}</p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canAny(me, ["leave.class_review", "leave.final", "leave.receive"]) ? (
          <Metric label={t("home.pendingLeaves")} value={data?.pendingLeaves ?? 0} onClick={() => onSection("leave")} />
        ) : null}
        {can(me, "complaints.manage") || me.assignedComplaints > 0 ? (
          <Metric label={t("home.complaints")} value={data?.newComplaints ?? 0} onClick={() => onSection("complaints")} />
        ) : null}
        {me.role === "super_admin" ? (
          <Metric label={t("home.resets")} value={data?.openResets ?? 0} onClick={() => onSection("users")} />
        ) : null}
        <Metric label={t("home.month")} value={`${t(`month.${data?.month ?? 1}` as "month.1")} ${data?.year ?? ""}`} />
      </div>
      {mine ? (
        <Card>
          <h3 className="mb-2 font-semibold">{t("home.responsibilities")}</h3>
          <p className="font-medium"><ShownText en={mine.name_en} ur={mine.name_ur} /></p>
          <p className="text-sm text-slate"><ShownText en={mine.designation_en} ur={mine.designation_ur} /></p>
          <ol className="mt-3 list-decimal space-y-1 ps-5">
            {mine.responsibilities.map((item) => (
              <li key={item.id}><ShownText en={item.text_en} ur={item.text_ur} /></li>
            ))}
          </ol>
        </Card>
      ) : (
        <Card><p className="text-slate">{t("home.noLink")}</p></Card>
      )}
      {can(me, "announcements.view") ? (
        <Card>
          <h3 className="mb-2 font-semibold">{t("home.announcements")}</h3>
          {(data?.announcements ?? []).length === 0 ? <p className="text-slate">{t("state.empty")}</p> : null}
          <div className="space-y-3">
            {(data?.announcements ?? []).map((item) => (
              <article key={item.id}>
                <p className="font-medium">{lang === "ur" ? item.title_ur || item.title_en : item.title_en}</p>
                <p className="text-sm text-slate">{lang === "ur" ? item.body_ur || item.body_en : item.body_en}</p>
              </article>
            ))}
          </div>
        </Card>
      ) : null}
      {me.role === "super_admin" ? (
        <Card>
          <h3 className="mb-2 font-semibold">{t("home.activity")}</h3>
          {(data?.activity ?? []).length === 0 ? <p className="text-slate">{t("state.empty")}</p> : null}
          <ul className="space-y-2">
            {(data?.activity ?? []).map((item) => (
              <li key={item.id} className="text-sm">{lang === "ur" ? item.summary_ur : item.summary_en}</li>
            ))}
          </ul>
          {(schedules.data ?? []).length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-slate">
              {(schedules.data ?? []).map((item) => (
                <li key={`${item.kind}-${item.month}-${item.year}`}>
                  <button type="button" className="underline" onClick={() => onSection(item.kind === "menu" ? "menu" : item.kind === "timetable" ? "timetable" : item.kind)}>
                    {item.kind} <span className="num">{item.month}/{item.year}</span> · {item.status}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-line bg-paper p-4 text-start shadow-card">
      <p className="text-sm text-slate">{label}</p>
      <p className="num mt-2 text-2xl font-semibold">{value}</p>
      {onClick ? <p className="mt-1 text-xs text-teal">{t("home.open")}</p> : null}
    </button>
  );
}
