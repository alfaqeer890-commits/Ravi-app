import { useMemo, useState } from "react";
import { can, type Me } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { archiveReport, listReports, listStaff, saveReport, suggestReportTotals } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { BiPair, Button, Card, Empty, Field, MonthYear, SelectField, ShownText } from "@/components/ui";
import { currentMonthYear } from "@/lib/weeks";
import { toast } from "sonner";

type Report = {
  id: number;
  staff_id: number;
  month: number;
  year: number;
  working_days: number | null;
  leaves: number | null;
  unapproved_absences: number | null;
  late_arrivals: number | null;
  fulfilled_en: string;
  fulfilled_ur: string;
  unfulfilled_en: string;
  unfulfilled_ur: string;
  improvement_en: string;
  improvement_ur: string;
  remarks_en: string;
  remarks_ur: string;
  evaluation_en: string;
  evaluation_ur: string;
  evaluator_name: string;
  archived: boolean;
  created_at: string;
};

export function ReportsModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const manage = can(me, "reports.manage");
  const reports = useRemote(["reports", me.userId], () => listReports());
  const staff = useRemote(["staff", me.userId], () => listStaff(), manage);
  const period = currentMonthYear();
  const [month, setMonth] = useState(period.month);
  const [year, setYear] = useState(period.year);
  const [staffId, setStaffId] = useState(me.staffId ? String(me.staffId) : "");
  const [compareId, setCompareId] = useState("");
  const rows = (reports.data ?? []) as Report[];
  const current = rows.find((report) => report.staff_id === Number(staffId) && report.month === month && report.year === year);
  const compare = rows.find((report) => report.id === Number(compareId));

  return (
    <div className="space-y-4">
      <p className="text-sm text-lavender">{t("reports.confidential")}</p>
      <Card className="grid gap-3 md:grid-cols-3">
        {manage ? (
          <SelectField label={t("reports.staff")} value={staffId} onChange={setStaffId}>
            <option value="">{t("complaints.none")}</option>
            {(staff.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name_en}</option>)}
          </SelectField>
        ) : null}
        <MonthYear month={month} year={year} onChange={(nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); }} />
      </Card>
      {manage ? (
        <ReportForm me={me} staffId={Number(staffId)} month={month} year={year} current={current} onSaved={() => void reports.refetch()} />
      ) : current ? <ReportView report={current} /> : <Empty text={t("reports.empty")} />}
      <Card className="space-y-2">
        <h3 className="font-semibold">{t("reports.compare")}</h3>
        <SelectField label={t("reports.compare")} value={compareId} onChange={setCompareId}>
          <option value="">{t("complaints.none")}</option>
          {rows.map((report) => <option key={report.id} value={report.id}>{report.month}/{report.year}</option>)}
        </SelectField>
        {current && compare ? (
          <div className="grid gap-3 md:grid-cols-2">
            <ReportView report={current} />
            <ReportView report={compare} />
          </div>
        ) : null}
      </Card>
      <div className="space-y-2">
        {rows.map((report) => (
          <button key={report.id} type="button" className="block w-full rounded-xl bg-paper px-3 py-2 text-start" onClick={() => { setStaffId(String(report.staff_id)); setMonth(report.month); setYear(report.year); }}>
            <span className="num">{report.month}/{report.year}</span>
            {report.archived ? ` · ${t("reports.archived")}` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportForm({
  me, staffId, month, year, current, onSaved,
}: {
  me: Me;
  staffId: number;
  month: number;
  year: number;
  current?: Report;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaver();
  const seed = useMemo(() => current?.id ?? 0, [current?.id]);
  return <ReportFields key={`${staffId}-${month}-${year}-${seed}`} me={me} staffId={staffId} month={month} year={year} current={current} save={save} onSaved={onSaved} />;
}

function ReportFields({
  staffId, month, year, current, save, onSaved,
}: {
  me: Me;
  staffId: number;
  month: number;
  year: number;
  current?: Report;
  save: ReturnType<typeof useSaver>;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [workingDays, setWorkingDays] = useState(current?.working_days?.toString() ?? "");
  const [leaves, setLeaves] = useState(current?.leaves?.toString() ?? "");
  const [absences, setAbsences] = useState(current?.unapproved_absences?.toString() ?? "");
  const [late, setLate] = useState(current?.late_arrivals?.toString() ?? "");
  const [fulfilledEn, setFulfilledEn] = useState(current?.fulfilled_en ?? "");
  const [fulfilledUr, setFulfilledUr] = useState(current?.fulfilled_ur ?? "");
  const [unfulfilledEn, setUnfulfilledEn] = useState(current?.unfulfilled_en ?? "");
  const [unfulfilledUr, setUnfulfilledUr] = useState(current?.unfulfilled_ur ?? "");
  const [improvementEn, setImprovementEn] = useState(current?.improvement_en ?? "");
  const [improvementUr, setImprovementUr] = useState(current?.improvement_ur ?? "");
  const [remarksEn, setRemarksEn] = useState(current?.remarks_en ?? "");
  const [remarksUr, setRemarksUr] = useState(current?.remarks_ur ?? "");
  const [evaluationEn, setEvaluationEn] = useState(current?.evaluation_en ?? "");
  const [evaluationUr, setEvaluationUr] = useState(current?.evaluation_ur ?? "");
  const [evaluator, setEvaluator] = useState(current?.evaluator_name ?? "");

  return (
    <Card className="print-root space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("reports.working")} value={workingDays} onChange={setWorkingDays} />
        <Field label={t("reports.leaves")} value={leaves} onChange={setLeaves} />
        <Field label={t("reports.unapproved")} value={absences} onChange={setAbsences} />
        <Field label={t("reports.late")} value={late} onChange={setLate} />
      </div>
      <Button tone="quiet" onClick={() => {
        void suggestReportTotals({ data: { staffId, month, year } }).then((result) => {
          if (!result.ok) return;
          if (result.data.recorded === 0) {
            toast.message(t("reports.suggestEmpty"));
            return;
          }
          setWorkingDays(String(result.data.workingDays));
          setLeaves(String(result.data.leaves));
          setAbsences(String(result.data.unapprovedAbsences));
          setLate(String(result.data.lateArrivals));
        });
      }}>{t("reports.suggest")}</Button>
      <p className="text-sm font-medium">{t("reports.fulfilled")}</p>
      <BiPair en={fulfilledEn} ur={fulfilledUr} onEn={setFulfilledEn} onUr={setFulfilledUr} multiline />
      <p className="text-sm font-medium">{t("reports.unfulfilled")}</p>
      <BiPair en={unfulfilledEn} ur={unfulfilledUr} onEn={setUnfulfilledEn} onUr={setUnfulfilledUr} multiline />
      <p className="text-sm font-medium">{t("reports.improvement")}</p>
      <BiPair en={improvementEn} ur={improvementUr} onEn={setImprovementEn} onUr={setImprovementUr} multiline />
      <p className="text-sm font-medium">{t("reports.remarks")}</p>
      <BiPair en={remarksEn} ur={remarksUr} onEn={setRemarksEn} onUr={setRemarksUr} multiline />
      <p className="text-sm font-medium">{t("reports.evaluation")}</p>
      <BiPair en={evaluationEn} ur={evaluationUr} onEn={setEvaluationEn} onUr={setEvaluationUr} />
      <Field label={t("reports.evaluator")} value={evaluator} onChange={setEvaluator} />
      <div className="no-print flex flex-wrap gap-2">
        <Button onClick={() => void save(() => saveReport({
          data: {
            staffId, month, year, workingDays, leaves, unapprovedAbsences: absences, lateArrivals: late,
            fulfilledEn, fulfilledUr, unfulfilledEn, unfulfilledUr, improvementEn, improvementUr,
            remarksEn, remarksUr, evaluationEn, evaluationUr, evaluatorName: evaluator,
          },
        }), [["reports"]]).then((result) => { if (result) onSaved(); })}>{t("action.save")}</Button>
        <Button tone="quiet" onClick={() => window.print()}>{t("action.print")}</Button>
        {current ? (
          <Button tone="quiet" onClick={() => void save(() => archiveReport({ data: { id: current.id, archived: !current.archived } }), [["reports"]]).then((result) => { if (result) onSaved(); })}>
            {current.archived ? t("reports.unarchive") : t("reports.archive")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function ReportView({ report }: { report: Report }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1 text-sm">
      <p className="num font-semibold">{report.month}/{report.year}</p>
      <p>{t("reports.working")}: <span className="num">{report.working_days ?? "—"}</span></p>
      <p>{t("reports.leaves")}: <span className="num">{report.leaves ?? "—"}</span></p>
      <p>{t("reports.unapproved")}: <span className="num">{report.unapproved_absences ?? "—"}</span></p>
      <p>{t("reports.late")}: <span className="num">{report.late_arrivals ?? "—"}</span></p>
      <p>{t("reports.fulfilled")}: <ShownText en={report.fulfilled_en} ur={report.fulfilled_ur} /></p>
      <p>{t("reports.evaluation")}: <ShownText en={report.evaluation_en} ur={report.evaluation_ur} /></p>
    </div>
  );
}
