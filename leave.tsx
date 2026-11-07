import { useState } from "react";
import { can, type Me } from "@/lib/access";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { createLeave, decideLeave, listAbsences, listLeaves, listStaff, listStudents, saveAbsence } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { Button, Card, Empty, Field, Pill, SelectField, ShownText, todayIso } from "@/components/ui";

export function LeaveModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const leaves = useRemote(["leaves", me.userId], () => listLeaves(), can(me, "leave.view") || can(me, "leave.submit") || can(me, "leave.class_review") || can(me, "leave.final") || can(me, "leave.receive"));
  const students = useRemote(["students", me.userId], () => listStudents(), can(me, "leave.submit") || can(me, "leave.absence"));
  const staff = useRemote(["staff", me.userId, "brief"], () => listStaff(), true);
  const mine = (staff.data ?? []).find((profile) => profile.id === me.staffId);
  const absences = useRemote(["absences", me.userId], () => listAbsences(), can(me, "leave.absence"));
  const [studentId, setStudentId] = useState("");
  const [incharge, setIncharge] = useState("");
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-lavender">{t("leave.notFinal")}</p>
      {can(me, "leave.submit") ? (
        <Card className="space-y-3">
          <h3 className="font-semibold">{t("leave.new")}</h3>
          <SelectField label={t("leave.student")} value={studentId} onChange={setStudentId}>
            <option value="">{t("complaints.none")}</option>
            {(students.data ?? []).filter((student) => student.status === "active").map((student) => (
              <option key={student.id} value={student.id}>{student.name_en}</option>
            ))}
          </SelectField>
          <SelectField label={t("leave.incharge")} value={incharge} onChange={setIncharge}>
            <option value="">{t("complaints.none")}</option>
            {(staff.data ?? []).filter((profile) => profile.status === "active").map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name_en}{profile.is_class_incharge ? " ·" : ""}</option>
            ))}
          </SelectField>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("leave.start")} type="date" value={start} onChange={setStart} />
            <Field label={t("leave.end")} type="date" value={end} onChange={setEnd} />
          </div>
          <Field label={t("leave.reason")} value={reason} onChange={setReason} />
          <Button onClick={() => {
            void save(() => createLeave({ data: { studentId: Number(studentId), classInchargeId: Number(incharge), startDate: start, endDate: end, reason } }), [["leaves", me.userId]]).then((result) => {
              if (result) setReason("");
            });
          }}>{t("action.save")}</Button>
        </Card>
      ) : null}
      {(leaves.data ?? []).length === 0 && !leaves.isPending ? <Empty text={t("state.empty")} /> : null}
      {(leaves.data ?? []).map((leave) => {
        const classTurn = leave.stage === "class_review" && (me.role === "super_admin" || (can(me, "leave.class_review") && (me.staffId === leave.class_incharge_staff_id || leave.class_incharge_staff_id == null)));
        const finalTurn = leave.stage === "awaiting_final" && (me.role === "super_admin" || can(me, "leave.final") || Boolean(mine?.is_leave_final_approver));
        return (
          <Card key={leave.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold"><ShownText en={leave.student_en} ur={leave.student_ur} /></h3>
              <Pill tone={leave.stage === "approved" ? "teal" : leave.stage === "rejected" ? "danger" : "lavender"}>{t(`leave.stage.${leave.stage}` as MessageKey)}</Pill>
            </div>
            <p className="num text-sm">{leave.start_date} → {leave.end_date}</p>
            <p>{leave.reason}</p>
            <p className="text-sm text-slate">{t("leave.classStep")}: {t(`leave.stage.${leave.class_status === "pending" ? "class_review" : leave.class_status}` as MessageKey)}</p>
            {leave.class_note ? <p className="text-sm">{leave.class_note}</p> : null}
            <p className="text-sm text-slate">{t("leave.finalStep")}: {leave.final_status}</p>
            {leave.final_note ? <p className="text-sm">{leave.final_note}</p> : null}
            {classTurn || finalTurn ? (
              <div className="space-y-2">
                <Field label={t("leave.note")} value={note} onChange={setNote} />
                <div className="flex gap-2">
                  <Button onClick={() => void save(() => decideLeave({ data: { id: leave.id, step: classTurn ? "class" : "final", decision: "approved", note } }), [["leaves", me.userId]])}>{t("leave.approve")}</Button>
                  <Button tone="danger" onClick={() => void save(() => decideLeave({ data: { id: leave.id, step: classTurn ? "class" : "final", decision: "rejected", note } }), [["leaves", me.userId]])}>{t("leave.reject")}</Button>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
      {can(me, "leave.absence") ? <AbsencePanel me={me} students={students.data ?? []} rows={absences.data ?? []} /> : null}
    </div>
  );
}

function AbsencePanel({
  me,
  students,
  rows,
}: {
  me: Me;
  students: { id: number; name_en: string; status: string }[];
  rows: { id: number; student_id: number; consecutive_days: number; guardian_contact: string; contact_date: string | null; remarks: string; follow_up_status: string; name_en: string; name_ur: string }[];
}) {
  const { t } = useI18n();
  const save = useSaver();
  const [studentId, setStudentId] = useState("");
  const [days, setDays] = useState("");
  const [contact, setContact] = useState("");
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState("open");
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">{t("leave.absence")}</h3>
      <SelectField label={t("leave.student")} value={studentId} onChange={setStudentId}>
        <option value="">{t("complaints.none")}</option>
        {students.filter((student) => student.status === "active").map((student) => <option key={student.id} value={student.id}>{student.name_en}</option>)}
      </SelectField>
      <Field label={t("leave.days")} value={days} onChange={setDays} />
      <Field label={t("students.guardianContact")} value={contact} onChange={setContact} />
      <Field label={t("leave.contactDate")} type="date" value={date} onChange={setDate} />
      <Field label={t("attendance.remarks")} value={remarks} onChange={setRemarks} />
      <SelectField label={t("leave.follow")} value={status} onChange={setStatus}>
        <option value="open">{t("leave.follow.open")}</option>
        <option value="contacted">{t("leave.follow.contacted")}</option>
        <option value="closed">{t("leave.follow.closed")}</option>
      </SelectField>
      <Button onClick={() => void save(() => saveAbsence({ data: { studentId: Number(studentId), consecutiveDays: Number(days), guardianContact: contact, contactDate: date, remarks, followUpStatus: status } }), [["absences", me.userId]])}>{t("action.save")}</Button>
      <div className="space-y-2">
        {rows.map((row) => (
          <p key={row.id} className="text-sm">
            <ShownText en={row.name_en} ur={row.name_ur} /> · <span className="num">{row.consecutive_days}</span> · {t(`leave.follow.${row.follow_up_status}` as MessageKey)}
          </p>
        ))}
      </div>
    </Card>
  );
}
