import { useEffect, useState, type ReactNode } from "react";
import { can, type Me } from "@/lib/access";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { attendanceSummary, listStaff, listStaffAttendance, listStudentAttendance, listStudents, saveStaffAttendance, saveStudentAttendance } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { Button, Card, Empty, Field, MonthYear, ShownText, todayIso } from "@/components/ui";
import { currentMonthYear } from "@/lib/weeks";

const STATUSES = ["present", "absent", "leave", "late"] as const;

export function AttendanceModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const canStudents = can(me, "attendance.students");
  const canStaff = can(me, "attendance.staff");
  const ownOnly = can(me, "attendance.own") && !canStudents && !canStaff;
  const [tab, setTab] = useState<"students" | "staff" | "own">(ownOnly ? "own" : canStudents ? "students" : "staff");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canStudents ? <Button tone={tab === "students" ? "primary" : "quiet"} onClick={() => setTab("students")}>{t("attendance.students")}</Button> : null}
        {canStaff ? <Button tone={tab === "staff" ? "primary" : "quiet"} onClick={() => setTab("staff")}>{t("attendance.staff")}</Button> : null}
        {can(me, "attendance.own") ? <Button tone={tab === "own" ? "primary" : "quiet"} onClick={() => setTab("own")}>{t("attendance.own")}</Button> : null}
      </div>
      {tab === "students" ? <StudentSheet me={me} /> : null}
      {tab === "staff" ? <StaffSheet me={me} /> : null}
      {tab === "own" ? <OwnSheet me={me} /> : null}
    </div>
  );
}

function StudentSheet({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const [date, setDate] = useState(todayIso());
  const period = currentMonthYear();
  const [month, setMonth] = useState(period.month);
  const [year, setYear] = useState(period.year);
  const people = useRemote(["students", me.userId], () => listStudents());
  const marks = useRemote(["student-attendance", date], () => listStudentAttendance({ data: { date } }));
  const summary = useRemote(["student-summary", month, year], () => attendanceSummary({ data: { month, year, kind: "student" } }));
  const [local, setLocal] = useState<Record<number, { status: string; remarks: string }>>({});
  useEffect(() => {
    const next: Record<number, { status: string; remarks: string }> = {};
    for (const row of marks.data ?? []) next[row.student_id] = { status: row.status, remarks: row.remarks ?? "" };
    setLocal(next);
  }, [marks.data]);
  const active = (people.data ?? []).filter((student) => student.status === "active");
  return (
    <div className="space-y-4">
      <Field label={t("attendance.date")} type="date" value={date} onChange={setDate} />
      {active.map((student) => (
        <PersonCard
          key={student.id}
          title={<ShownText en={student.name_en} ur={student.name_ur} />}
          status={local[student.id]?.status ?? ""}
          remarks={local[student.id]?.remarks ?? ""}
          onStatus={(status) => setLocal({ ...local, [student.id]: { status, remarks: local[student.id]?.remarks ?? "" } })}
          onRemarks={(remarks) => setLocal({ ...local, [student.id]: { status: local[student.id]?.status ?? "", remarks } })}
        />
      ))}
      {can(me, "attendance.students") ? (
        <Button onClick={() => {
          void save(() => saveStudentAttendance({
            data: {
              date,
              rows: active.map((student) => ({ id: student.id, status: local[student.id]?.status ?? "", remarks: local[student.id]?.remarks ?? "" })),
            },
          }), [["student-attendance", date], ["student-summary", month, year]]);
        }}>{t("action.save")}</Button>
      ) : null}
      <Summary month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} rows={summary.data ?? []} people={active.map((student) => ({ id: student.id, en: student.name_en, ur: student.name_ur }))} />
    </div>
  );
}

function StaffSheet({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const [date, setDate] = useState(todayIso());
  const period = currentMonthYear();
  const [month, setMonth] = useState(period.month);
  const [year, setYear] = useState(period.year);
  const people = useRemote(["staff", me.userId], () => listStaff());
  const marks = useRemote(["staff-attendance", date], () => listStaffAttendance({ data: { date } }));
  const summary = useRemote(["staff-summary", month, year], () => attendanceSummary({ data: { month, year, kind: "staff" } }));
  const [local, setLocal] = useState<Record<number, { status: string; remarks: string; arrival: string; departure: string; leaveInfo: string }>>({});
  useEffect(() => {
    const next: typeof local = {};
    for (const row of marks.data ?? []) {
      next[row.staff_id] = { status: row.status, remarks: row.remarks ?? "", arrival: row.arrival_time ?? "", departure: row.departure_time ?? "", leaveInfo: row.leave_info ?? "" };
    }
    setLocal(next);
  }, [marks.data]);
  const active = (people.data ?? []).filter((profile) => profile.status === "active");
  return (
    <div className="space-y-4">
      <Field label={t("attendance.date")} type="date" value={date} onChange={setDate} />
      {active.map((profile) => {
        const row = local[profile.id] ?? { status: "", remarks: "", arrival: "", departure: "", leaveInfo: "" };
        return (
          <PersonCard
            key={profile.id}
            title={<ShownText en={profile.name_en} ur={profile.name_ur} />}
            status={row.status}
            remarks={row.remarks}
            extra={
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label={t("attendance.arrival")} type="time" value={row.arrival} onChange={(arrival) => setLocal({ ...local, [profile.id]: { ...row, arrival } })} />
                <Field label={t("attendance.departure")} type="time" value={row.departure} onChange={(departure) => setLocal({ ...local, [profile.id]: { ...row, departure } })} />
                <Field label={t("attendance.leaveInfo")} value={row.leaveInfo} onChange={(leaveInfo) => setLocal({ ...local, [profile.id]: { ...row, leaveInfo } })} />
              </div>
            }
            onStatus={(status) => setLocal({ ...local, [profile.id]: { ...row, status } })}
            onRemarks={(remarks) => setLocal({ ...local, [profile.id]: { ...row, remarks } })}
          />
        );
      })}
      <Button onClick={() => {
        void save(() => saveStaffAttendance({
          data: {
            date,
            rows: active.map((profile) => ({ id: profile.id, ...(local[profile.id] ?? { status: "", remarks: "", arrival: "", departure: "", leaveInfo: "" }) })),
          },
        }), [["staff-attendance", date], ["staff-summary", month, year]]);
      }}>{t("action.save")}</Button>
      <Summary month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} rows={summary.data ?? []} people={active.map((profile) => ({ id: profile.id, en: profile.name_en, ur: profile.name_ur }))} />
    </div>
  );
}

function OwnSheet({ me }: { me: Me }) {
  const { t } = useI18n();
  const rows = useRemote(["my-attendance", me.userId], () => listStaffAttendance({ data: { date: "", own: true } }));
  if ((rows.data ?? []).length === 0) return <Empty text={t("attendance.emptyOwn")} />;
  return (
    <div className="space-y-2">
      {(rows.data ?? []).map((row) => (
        <Card key={row.id}>
          <p className="num font-medium">{row.attendance_date}</p>
          <p>{t(`attendance.${row.status}` as MessageKey)}</p>
          {row.leave_info ? <p className="text-sm text-slate">{row.leave_info}</p> : null}
        </Card>
      ))}
    </div>
  );
}

function PersonCard({
  title, status, remarks, onStatus, onRemarks, extra,
}: {
  title: ReactNode;
  status: string;
  remarks: string;
  onStatus: (status: string) => void;
  onRemarks: (remarks: string) => void;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className="space-y-3">
      <p className="font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((item) => (
          <Button key={item} tone={status === item ? "primary" : "quiet"} onClick={() => onStatus(item)}>
            {t(`attendance.${item}` as MessageKey)}
          </Button>
        ))}
        <Button tone="ghost" onClick={() => onStatus("")}>{t("attendance.clear")}</Button>
      </div>
      {extra}
      <Field label={t("attendance.remarks")} value={remarks} onChange={onRemarks} />
    </Card>
  );
}

function Summary({
  month, year, onChange, rows, people,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
  rows: { person_id: number; status: string; n: number }[];
  people: { id: number; en: string; ur: string }[];
}) {
  const { t } = useI18n();
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">{t("attendance.summary")}</h3>
      <p className="text-sm text-slate">{t("attendance.recorded")}</p>
      <MonthYear month={month} year={year} onChange={onChange} />
      {people.map((person) => {
        const mine = rows.filter((row) => row.person_id === person.id);
        if (!mine.length) return null;
        return (
          <p key={person.id} className="text-sm">
            <ShownText en={person.en} ur={person.ur} />{" "}
            {mine.map((row) => (
              <span key={row.status} className="num me-2">{t(`attendance.${row.status}` as MessageKey)} {row.n}</span>
            ))}
          </p>
        );
      })}
    </Card>
  );
}
