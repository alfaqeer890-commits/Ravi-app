import { useState } from "react";
import { can, type Me } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { departStudent, listStudentEvents, listStudents, saveStudent } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { BiPair, Button, Card, Empty, Field, Modal, Pill, ShownText, todayIso } from "@/components/ui";

export function StudentsModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const manage = can(me, "students.manage");
  const students = useRemote(["students", me.userId], () => listStudents());
  const events = useRemote(["student-events", me.userId], () => listStudentEvents(), can(me, "students.view") || manage);
  const [queryText, setQueryText] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [departing, setDeparting] = useState<number | null>(null);
  const rows = (students.data ?? []).filter((student) =>
    `${student.name_en} ${student.name_ur} ${student.class_en}`.toLowerCase().includes(queryText.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><Field label={t("action.search")} value={queryText} onChange={setQueryText} /></div>
        {manage ? <Button onClick={() => setEditing("new")}>{t("students.add")}</Button> : null}
      </div>
      {rows.length === 0 && !students.isPending ? <Empty text={t("state.empty")} /> : null}
      <div className="grid gap-3">
        {rows.map((student) => (
          <Card key={student.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold"><ShownText en={student.name_en} ur={student.name_ur} /></h3>
                <p className="text-sm text-slate"><ShownText en={student.class_en} ur={student.class_ur} /></p>
                <p className="text-sm">{student.guardian_name} <span className="num">{student.guardian_contact}</span></p>
                {student.admission_date ? <p className="num text-sm text-slate">{student.admission_date}</p> : null}
              </div>
              <Pill tone={student.status === "active" ? "teal" : "slate"}>{student.status === "active" ? t("students.active") : t("students.departed")}</Pill>
            </div>
            {manage ? (
              <div className="mt-3 flex gap-2">
                <Button tone="quiet" onClick={() => setEditing(student.id)}>{t("action.edit")}</Button>
                {student.status === "active" ? <Button tone="quiet" onClick={() => setDeparting(student.id)}>{t("students.depart")}</Button> : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {events.data ? (
        <Card>
          <h3 className="mb-2 font-semibold">{t("students.events")}</h3>
          {events.data.length === 0 ? <p className="text-slate">{t("state.empty")}</p> : null}
          <ul className="space-y-2 text-sm">
            {events.data.map((event) => (
              <li key={event.id}>
                <span className="num">{event.event_date}</span> · {event.kind === "admission" ? t("students.admission") : t("students.depart")} · <ShownText en={event.name_en} ur={event.name_ur} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {editing != null ? (
        <StudentEditor
          source={editing === "new" ? null : (students.data ?? []).find((student) => student.id === editing) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void students.refetch(); void events.refetch(); }}
        />
      ) : null}
      {departing != null ? (
        <DepartForm
          onClose={() => setDeparting(null)}
          onSave={(date, notesEn, notesUr) => {
            void save(() => departStudent({ data: { id: departing, date, notesEn, notesUr } }), [["students"], ["student-events"]]).then((result) => {
              if (result) setDeparting(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}

function StudentEditor({
  source,
  onClose,
  onSaved,
}: {
  source: {
    id: number; name_en: string; name_ur: string; class_en: string; class_ur: string;
    guardian_name: string; guardian_contact: string; admission_date: string | null; remarks_en: string; remarks_ur: string;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaver();
  const [nameEn, setNameEn] = useState(source?.name_en ?? "");
  const [nameUr, setNameUr] = useState(source?.name_ur ?? "");
  const [classEn, setClassEn] = useState(source?.class_en ?? "");
  const [classUr, setClassUr] = useState(source?.class_ur ?? "");
  const [guardian, setGuardian] = useState(source?.guardian_name ?? "");
  const [contact, setContact] = useState(source?.guardian_contact ?? "");
  const [admission, setAdmission] = useState(source?.admission_date ?? "");
  const [remarksEn, setRemarksEn] = useState(source?.remarks_en ?? "");
  const [remarksUr, setRemarksUr] = useState(source?.remarks_ur ?? "");
  return (
    <Modal title={source ? t("action.edit") : t("students.add")} onClose={onClose}>
      <div className="space-y-3">
        <BiPair en={nameEn} ur={nameUr} onEn={setNameEn} onUr={setNameUr} />
        <p className="text-sm font-medium">{t("students.class")}</p>
        <BiPair en={classEn} ur={classUr} onEn={setClassEn} onUr={setClassUr} />
        <Field label={t("students.guardian")} value={guardian} onChange={setGuardian} />
        <Field label={t("students.guardianContact")} value={contact} onChange={setContact} />
        <Field label={t("students.admission")} type="date" value={admission} onChange={setAdmission} />
        <p className="text-sm font-medium">{t("students.remarks")}</p>
        <BiPair en={remarksEn} ur={remarksUr} onEn={setRemarksEn} onUr={setRemarksUr} multiline />
        <Button onClick={() => {
          void save(() => saveStudent({
            data: { id: source?.id, nameEn, nameUr, classEn, classUr, guardianName: guardian, guardianContact: contact, admissionDate: admission, remarksEn, remarksUr },
          })).then((result) => { if (result) onSaved(); });
        }}>{t("action.save")}</Button>
      </div>
    </Modal>
  );
}

function DepartForm({ onClose, onSave }: { onClose: () => void; onSave: (date: string, notesEn: string, notesUr: string) => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState(todayIso());
  const [notesEn, setNotesEn] = useState("");
  const [notesUr, setNotesUr] = useState("");
  return (
    <Modal title={t("students.depart")} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t("students.departureDate")} type="date" value={date} onChange={setDate} />
        <BiPair en={notesEn} ur={notesUr} onEn={setNotesEn} onUr={setNotesUr} multiline />
        <Button onClick={() => onSave(date, notesEn, notesUr)}>{t("action.save")}</Button>
      </div>
    </Modal>
  );
}
