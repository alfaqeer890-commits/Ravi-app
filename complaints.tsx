import { useState } from "react";
import type { Me } from "@/lib/access";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { listComplaintSetup, listComplaints, listStaff, saveComplaintCategory, saveComplaintRoutes, submitComplaint, updateComplaint } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { BiPair, Button, Card, Empty, Field, Pill, SelectField, Area } from "@/components/ui";

const STATUSES = ["submitted", "pending_review", "under_investigation", "resolved", "rejected"] as const;

export function ComplaintsModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const save = useSaver();
  const setup = useRemote(["complaint-setup", me.userId], () => listComplaintSetup());
  const complaints = useRemote(["complaints", me.userId], () => listComplaints());
  const staff = useRemote(["staff", me.userId], () => listStaff(), canSubmit || me.role === "super_admin");
  const canSubmit = me.complaintsEnabled && (me.role === "super_admin" || me.permissions.includes("complaints.submit"));
  const [name, setName] = useState(me.name);
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [related, setRelated] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [fileData, setFileData] = useState("");
  const categories = (setup.data?.categories ?? []).filter((category) => category.active || me.role === "super_admin");

  return (
    <div className="space-y-4">
      {canSubmit ? (
        <Card className="space-y-3">
          <h3 className="font-semibold">{t("complaints.submit")}</h3>
          <Field label={t("complaints.name")} value={name} onChange={setName} />
          {me.anonymousComplaints ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
              {t("complaints.anonymous")}
            </label>
          ) : null}
          <SelectField label={t("complaints.category")} value={categoryId} onChange={setCategoryId}>
            <option value="">{t("complaints.none")}</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.label_en}</option>)}
          </SelectField>
          <Field label={t("complaints.subject")} value={subject} onChange={setSubject} />
          <Area label={t("complaints.detail")} value={body} onChange={setBody} />
          <SelectField label={t("complaints.related")} value={related} onChange={setRelated}>
            <option value="">{t("complaints.none")}</option>
            {(staff.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name_en}</option>)}
          </SelectField>
          <label className="block text-sm text-slate">
            {t("complaints.file")}
            <input
              type="file"
              className="mt-1 block w-full"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || file.size > 700000) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const result = String(reader.result ?? "");
                  const comma = result.indexOf(",");
                  setFileName(file.name);
                  setFileMime(file.type);
                  setFileData(comma >= 0 ? result.slice(comma + 1) : result);
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <Button onClick={() => {
            void save(() => submitComplaint({
              data: {
                complainantName: name,
                anonymous,
                categoryId: Number(categoryId),
                subject,
                body,
                relatedStaffId: Number(related),
                attachmentName: fileName,
                attachmentMime: fileMime,
                attachmentData: fileData,
              },
            }), [["complaints", me.userId]]).then((result) => {
              if (result) { setSubject(""); setBody(""); setFileData(""); }
            });
          }}>{t("action.save")}</Button>
        </Card>
      ) : null}
      {me.role === "super_admin" && setup.data ? (
        <Routing me={me} categories={setup.data.categories} routes={setup.data.routes} staff={staff.data ?? []} />
      ) : null}
      {(complaints.data ?? []).length === 0 && !complaints.isPending ? <Empty text={t("state.empty")} /> : null}
      {(complaints.data ?? []).map((complaint) => (
        <ComplaintCard key={complaint.id} complaint={complaint} onChanged={() => void complaints.refetch()} />
      ))}
    </div>
  );
}

function ComplaintCard({
  complaint,
  onChanged,
}: {
  complaint: {
    id: number; subject: string; body: string; status: string; scope: string; complainantName: string;
    isAnonymous: boolean; anonymousAccountVisible: boolean; submittedBy: string | null;
    attachmentName: string | null; attachmentData: string | null; attachmentMime: string | null;
    notes: { id: number; kind: string; body: string }[];
  };
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const save = useSaver();
  const [status, setStatus] = useState(complaint.status);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("investigation");
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{complaint.subject}</h3>
        <Pill>{t(`status.${complaint.status}` as MessageKey)}</Pill>
      </div>
      {complaint.complainantName ? <p className="text-sm">{complaint.complainantName}</p> : null}
      {complaint.anonymousAccountVisible ? <p className="text-xs text-lavender">{t("complaints.accountOnly")}: {complaint.submittedBy}</p> : null}
      <p>{complaint.body}</p>
      {complaint.attachmentData ? (
        <a className="text-sm text-teal underline" href={`data:${complaint.attachmentMime || "application/octet-stream"};base64,${complaint.attachmentData}`} download={complaint.attachmentName || "attachment"}>
          {complaint.attachmentName}
        </a>
      ) : null}
      <ul className="space-y-1 text-sm">
        {complaint.notes.filter((item) => item.kind !== "status").map((item) => (
          <li key={item.id}><span className="text-slate">{item.kind === "response" ? t("complaints.response") : t("complaints.investigation")}: </span>{item.body}</li>
        ))}
      </ul>
      {complaint.scope === "full" ? (
        <div className="space-y-2">
          <SelectField label={t("complaints.status")} value={status} onChange={setStatus}>
            {STATUSES.map((item) => <option key={item} value={item}>{t(`status.${item}` as MessageKey)}</option>)}
          </SelectField>
          <SelectField label={t("complaints.investigation")} value={kind} onChange={setKind}>
            <option value="investigation">{t("complaints.investigation")}</option>
            <option value="response">{t("complaints.response")}</option>
          </SelectField>
          <Area label={t("leave.note")} value={note} onChange={setNote} />
          <Button onClick={() => void save(() => updateComplaint({ data: { id: complaint.id, status, note, kind } })).then((result) => { if (result) onChanged(); })}>{t("action.save")}</Button>
        </div>
      ) : null}
    </Card>
  );
}

function Routing({
  categories,
  routes,
  staff,
}: {
  me: Me;
  categories: { id: number; label_en: string; label_ur: string; active: boolean }[];
  routes: { category_id: number; staff_id: number }[];
  staff: { id: number; name_en: string }[];
}) {
  const { t } = useI18n();
  const save = useSaver();
  const [labelEn, setLabelEn] = useState("");
  const [labelUr, setLabelUr] = useState("");
  const [selected, setSelected] = useState<Record<number, number[]>>(() => {
    const map: Record<number, number[]> = {};
    for (const route of routes) map[route.category_id] = [...(map[route.category_id] ?? []), route.staff_id];
    return map;
  });
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">{t("complaints.routes")}</h3>
      <p className="text-sm text-slate">{t("complaints.routesHint")}</p>
      {categories.map((category) => (
        <div key={category.id} className="space-y-2">
          <p className="font-medium">{category.label_en} / {category.label_ur}</p>
          <div className="flex flex-wrap gap-2">
            {staff.map((profile) => {
              const on = (selected[category.id] ?? []).includes(profile.id);
              return (
                <Button key={profile.id} tone={on ? "primary" : "quiet"} onClick={() => {
                  const current = selected[category.id] ?? [];
                  setSelected({ ...selected, [category.id]: on ? current.filter((id) => id !== profile.id) : [...current, profile.id] });
                }}>{profile.name_en}</Button>
              );
            })}
          </div>
          <Button tone="quiet" onClick={() => void save(() => saveComplaintRoutes({ data: { categoryId: category.id, staffIds: selected[category.id] ?? [] } }))}>{t("action.save")}</Button>
        </div>
      ))}
      <BiPair en={labelEn} ur={labelUr} onEn={setLabelEn} onUr={setLabelUr} />
      <Button onClick={() => void save(() => saveComplaintCategory({ data: { labelEn, labelUr } }), [["complaint-setup"]])}>{t("complaints.addCategory")}</Button>
    </Card>
  );
}
