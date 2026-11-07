import { useState } from "react";
import type { Me } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { listStaff, saveStaff, setStaffStatus, translateDraft } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { BiPair, Button, Card, Empty, Field, Modal, Pill, ShownText } from "@/components/ui";
import { toast } from "sonner";

type Line = { textEn: string; textUr: string };

const blank = { textEn: "", textUr: "" };

export function StaffModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const query = useRemote(["staff", me.userId], () => listStaff());
  const [queryText, setQueryText] = useState("");
  const [editing, setEditing] = useState<null | number | "new">(null);
  const manage = me.role === "super_admin";
  const rows = (query.data ?? []).filter((profile) => {
    const blob = `${profile.name_en} ${profile.name_ur} ${profile.designation_en} ${profile.designation_ur}`.toLowerCase();
    return blob.includes(queryText.trim().toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label={t("action.search")} value={queryText} onChange={setQueryText} />
        </div>
        {manage ? <Button onClick={() => setEditing("new")}>{t("staff.add")}</Button> : null}
      </div>
      {query.isError ? <Button onClick={() => query.refetch()}>{t("action.retry")}</Button> : null}
      {rows.length === 0 && !query.isPending ? <Empty text={t("staff.empty")} /> : null}
      <div className="grid gap-3">
        {rows.map((profile) => (
          <Card key={profile.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold"><ShownText en={profile.name_en} ur={profile.name_ur} /></h3>
                <p className="text-sm text-slate"><ShownText en={profile.designation_en} ur={profile.designation_ur} /></p>
                {profile.department_en || profile.department_ur ? (
                  <p className="text-sm"><ShownText en={profile.department_en} ur={profile.department_ur} /></p>
                ) : null}
                {profile.contact ? <p className="num text-sm text-slate">{profile.contact}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Pill tone={profile.status === "active" ? "teal" : "slate"}>{profile.status === "active" ? t("staff.active") : t("staff.inactive")}</Pill>
                {profile.is_attendance_coordinator ? <Pill tone="lavender">{t("staff.coordinator")}</Pill> : null}
                {profile.is_leave_final_approver ? <Pill>{t("staff.finalApprover")}</Pill> : null}
                {profile.is_class_incharge ? <Pill>{t("staff.incharge")}</Pill> : null}
              </div>
            </div>
            <ol className="mt-3 list-decimal space-y-1 ps-5">
              {profile.responsibilities.map((item) => (
                <li key={item.id}><ShownText en={item.text_en} ur={item.text_ur} /></li>
              ))}
            </ol>
            {profile.duties.length > 0 ? (
              <ul className="mt-3 list-disc ps-5 text-sm">
                {profile.duties.map((item) => (
                  <li key={item.id}><ShownText en={item.text_en} ur={item.text_ur} /></li>
                ))}
              </ul>
            ) : null}
            {manage ? (
              <div className="mt-3 flex gap-2">
                <Button tone="quiet" onClick={() => setEditing(profile.id)}>{t("action.edit")}</Button>
                <Button
                  tone="quiet"
                  onClick={() => {
                    void save(
                      () => setStaffStatus({ data: { id: profile.id, status: profile.status === "active" ? "inactive" : "active" } }),
                      [["staff", me.userId]],
                    );
                  }}
                >
                  {profile.status === "active" ? t("staff.deactivate") : t("staff.reactivate")}
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {editing != null ? (
        <StaffEditor
          source={editing === "new" ? null : (query.data ?? []).find((profile) => profile.id === editing) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void query.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function StaffEditor({
  source,
  onClose,
  onSaved,
}: {
  source: {
    id: number;
    name_en: string;
    name_ur: string;
    designation_en: string;
    designation_ur: string;
    department_en: string;
    department_ur: string;
    contact: string;
    sort_order: number;
    is_attendance_coordinator: boolean;
    is_leave_final_approver: boolean;
    is_class_incharge: boolean;
    responsibilities: { text_en: string; text_ur: string }[];
    duties: { text_en: string; text_ur: string }[];
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaver();
  const [nameEn, setNameEn] = useState(source?.name_en ?? "");
  const [nameUr, setNameUr] = useState(source?.name_ur ?? "");
  const [designationEn, setDesignationEn] = useState(source?.designation_en ?? "");
  const [designationUr, setDesignationUr] = useState(source?.designation_ur ?? "");
  const [departmentEn, setDepartmentEn] = useState(source?.department_en ?? "");
  const [departmentUr, setDepartmentUr] = useState(source?.department_ur ?? "");
  const [contact, setContact] = useState(source?.contact ?? "");
  const [coordinator, setCoordinator] = useState(source?.is_attendance_coordinator ?? false);
  const [finalApprover, setFinalApprover] = useState(source?.is_leave_final_approver ?? false);
  const [incharge, setIncharge] = useState(source?.is_class_incharge ?? false);
  const [responsibilities, setResponsibilities] = useState<Line[]>(
    source?.responsibilities.map((item) => ({ textEn: item.text_en, textUr: item.text_ur })) ?? [{ ...blank }],
  );
  const [duties, setDuties] = useState<Line[]>(source?.duties.map((item) => ({ textEn: item.text_en, textUr: item.text_ur })) ?? []);

  async function draft(text: string, target: "en" | "ur", apply: (value: string) => void) {
    const result = await translateDraft({ data: { text, target } });
    if (!result.ok) {
      toast.error(t(`err.${result.error}` as "err.INVALID"));
      return;
    }
    apply(result.data.text);
  }

  return (
    <Modal title={source ? t("action.edit") : t("staff.add")} onClose={onClose}>
      <div className="space-y-4">
        <BiPair en={nameEn} ur={nameUr} onEn={setNameEn} onUr={setNameUr} />
        <div className="flex justify-end">
          <Button tone="ghost" onClick={() => void draft(nameEn, "ur", setNameUr)}>{t("action.translate")}</Button>
        </div>
        <p className="text-sm font-medium">{t("staff.designation")}</p>
        <BiPair en={designationEn} ur={designationUr} onEn={setDesignationEn} onUr={setDesignationUr} />
        <p className="text-sm font-medium">{t("staff.department")}</p>
        <BiPair en={departmentEn} ur={departmentUr} onEn={setDepartmentEn} onUr={setDepartmentUr} />
        <Field label={t("staff.contact")} value={contact} onChange={setContact} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={coordinator} onChange={(event) => setCoordinator(event.target.checked)} />{t("staff.coordinator")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={finalApprover} onChange={(event) => setFinalApprover(event.target.checked)} />{t("staff.finalApprover")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={incharge} onChange={(event) => setIncharge(event.target.checked)} />{t("staff.incharge")}</label>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">{t("staff.responsibilities")}</p>
            <Button tone="quiet" onClick={() => setResponsibilities([...responsibilities, { ...blank }])}>{t("action.add")}</Button>
          </div>
          {responsibilities.map((line, index) => (
            <div key={index} className="space-y-2 rounded-xl bg-paper p-3">
              <BiPair
                en={line.textEn}
                ur={line.textUr}
                multiline
                onEn={(value) => setResponsibilities(responsibilities.map((item, itemIndex) => itemIndex === index ? { ...item, textEn: value } : item))}
                onUr={(value) => setResponsibilities(responsibilities.map((item, itemIndex) => itemIndex === index ? { ...item, textUr: value } : item))}
              />
              <Button tone="ghost" onClick={() => setResponsibilities(responsibilities.filter((_, itemIndex) => itemIndex !== index))}>{t("action.remove")}</Button>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">{t("staff.duties")}</p>
            <Button tone="quiet" onClick={() => setDuties([...duties, { ...blank }])}>{t("action.add")}</Button>
          </div>
          {duties.map((line, index) => (
            <div key={index} className="space-y-2">
              <BiPair
                en={line.textEn}
                ur={line.textUr}
                onEn={(value) => setDuties(duties.map((item, itemIndex) => itemIndex === index ? { ...item, textEn: value } : item))}
                onUr={(value) => setDuties(duties.map((item, itemIndex) => itemIndex === index ? { ...item, textUr: value } : item))}
              />
              <Button tone="ghost" onClick={() => setDuties(duties.filter((_, itemIndex) => itemIndex !== index))}>{t("action.remove")}</Button>
            </div>
          ))}
        </div>
        <Button
          onClick={() => {
            void save(() => saveStaff({
              data: {
                id: source?.id,
                nameEn, nameUr, designationEn, designationUr, departmentEn, departmentUr, contact,
                isAttendanceCoordinator: coordinator,
                isLeaveFinalApprover: finalApprover,
                isClassIncharge: incharge,
                sortOrder: source?.sort_order ?? 99,
                responsibilities,
                duties,
              },
            })).then((result) => {
              if (result) onSaved();
            });
          }}
        >
          {t("action.save")}
        </Button>
      </div>
    </Modal>
  );
}
