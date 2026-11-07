import { useEffect, useState } from "react";
import { GRANTABLE_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS, can, type Me } from "@/lib/access";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  deleteAnnouncement, deleteRecord, getSettings, listAnnouncements, listAudit, listRecords, listStaff, listUsers,
  resetUserPassword, saveAnnouncement, saveRecord, saveSettings, createUser, updateUser,
} from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { BiPair, Button, Card, Empty, Field, SelectField, ShownText, Area } from "@/components/ui";

export function AnnouncementsModule({ me }: { me: Me }) {
  const { t, lang } = useI18n();
  const manage = can(me, "announcements.manage");
  const query = useRemote(["announcements", me.userId], () => listAnnouncements());
  const save = useSaver();
  const [open, setOpen] = useState(false);
  const [titleEn, setTitleEn] = useState("");
  const [titleUr, setTitleUr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyUr, setBodyUr] = useState("");
  const [published, setPublished] = useState(true);
  const [editing, setEditing] = useState(0);
  return (
    <div className="space-y-4">
      {manage ? <Button onClick={() => { setEditing(0); setTitleEn(""); setTitleUr(""); setBodyEn(""); setBodyUr(""); setOpen(true); }}>{t("announce.new")}</Button> : null}
      {(query.data ?? []).length === 0 ? <Empty text={t("state.empty")} /> : null}
      {(query.data ?? []).map((item) => (
        <Card key={item.id}>
          <h3 className="font-semibold">{lang === "ur" ? item.title_ur || item.title_en : item.title_en}</h3>
          <p className="text-sm">{lang === "ur" ? item.body_ur || item.body_en : item.body_en}</p>
          {manage ? (
            <div className="mt-3 flex gap-2">
              <Button tone="quiet" onClick={() => { setEditing(item.id); setTitleEn(item.title_en); setTitleUr(item.title_ur); setBodyEn(item.body_en); setBodyUr(item.body_ur); setPublished(item.published); setOpen(true); }}>{t("action.edit")}</Button>
              <Button tone="danger" onClick={() => { if (window.confirm(t("records.confirm"))) void save(() => deleteAnnouncement({ data: { id: item.id } }), [["announcements"]]); }}>{t("announce.delete")}</Button>
            </div>
          ) : null}
        </Card>
      ))}
      {open ? (
        <Card className="space-y-3">
          <BiPair en={titleEn} ur={titleUr} onEn={setTitleEn} onUr={setTitleUr} />
          <BiPair en={bodyEn} ur={bodyUr} onEn={setBodyEn} onUr={setBodyUr} multiline />
          <label className="flex items-center gap-2"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />{t("announce.published")}</label>
          <Button onClick={() => void save(() => saveAnnouncement({ data: { id: editing || undefined, titleEn, titleUr, bodyEn, bodyUr, published } }), [["announcements"]]).then((result) => { if (result) setOpen(false); })}>{t("action.save")}</Button>
        </Card>
      ) : null}
    </div>
  );
}

export function RecordsModule({ me }: { me: Me }) {
  const { t } = useI18n();
  const manage = can(me, "records.manage");
  const query = useRemote(["records", me.userId], () => listRecords());
  const save = useSaver();
  const [titleEn, setTitleEn] = useState("");
  const [titleUr, setTitleUr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyUr, setBodyUr] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [categoryUr, setCategoryUr] = useState("");
  const [editing, setEditing] = useState(0);
  return (
    <div className="space-y-4">
      {(query.data ?? []).map((item) => (
        <Card key={item.id}>
          <h3 className="font-semibold"><ShownText en={item.title_en} ur={item.title_ur} /></h3>
          <p className="text-sm text-slate"><ShownText en={item.category_en} ur={item.category_ur} /></p>
          <p><ShownText en={item.body_en} ur={item.body_ur} /></p>
          {manage ? (
            <div className="mt-3 flex gap-2">
              <Button tone="quiet" onClick={() => { setEditing(item.id); setTitleEn(item.title_en); setTitleUr(item.title_ur); setBodyEn(item.body_en); setBodyUr(item.body_ur); setCategoryEn(item.category_en); setCategoryUr(item.category_ur); }}>{t("action.edit")}</Button>
              <Button tone="danger" onClick={() => { if (window.confirm(t("records.confirm"))) void save(() => deleteRecord({ data: { id: item.id } }), [["records"]]); }}>{t("records.delete")}</Button>
            </div>
          ) : null}
        </Card>
      ))}
      {manage ? (
        <Card className="space-y-3">
          <h3 className="font-semibold">{editing ? t("action.edit") : t("records.new")}</h3>
          <BiPair en={titleEn} ur={titleUr} onEn={setTitleEn} onUr={setTitleUr} />
          <p className="text-sm font-medium">{t("records.category")}</p>
          <BiPair en={categoryEn} ur={categoryUr} onEn={setCategoryEn} onUr={setCategoryUr} />
          <BiPair en={bodyEn} ur={bodyUr} onEn={setBodyEn} onUr={setBodyUr} multiline />
          <Button onClick={() => void save(() => saveRecord({ data: { id: editing || undefined, titleEn, titleUr, bodyEn, bodyUr, categoryEn, categoryUr } }), [["records"]]).then((result) => {
            if (!result) return;
            setEditing(0); setTitleEn(""); setTitleUr(""); setBodyEn(""); setBodyUr("");
          })}>{t("action.save")}</Button>
        </Card>
      ) : null}
      {(query.data ?? []).length === 0 ? <Empty text={t("state.empty")} /> : null}
    </div>
  );
}

export function UsersModule() {
  const { t } = useI18n();
  const save = useSaver();
  const query = useRemote(["users"], () => listUsers());
  const staff = useRemote(["staff", "admin"], () => listStaff());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [language, setLanguage] = useState("en");
  const [staffId, setStaffId] = useState("");
  const [perms, setPerms] = useState<string[]>([...DEFAULT_STAFF_PERMISSIONS]);
  const [resetFor, setResetFor] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [requestId, setRequestId] = useState(0);

  function toggle(permission: string) {
    setPerms(perms.includes(permission) ? perms.filter((item) => item !== permission) : [...perms, permission]);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="font-semibold">{t("users.add")}</h3>
        <Field label={t("login.name")} value={name} onChange={setName} />
        <Field label="Email" value={email} onChange={setEmail} />
        <Field label={t("profile.username")} value={username} onChange={setUsername} />
        <Field label={t("login.password")} type="password" value={password} onChange={setPassword} />
        <SelectField label={t("users.role")} value={role} onChange={setRole}>
          <option value="staff">{t("users.roleStaff")}</option>
          <option value="super_admin">{t("users.roleAdmin")}</option>
        </SelectField>
        <SelectField label={t("profile.language")} value={language} onChange={setLanguage}>
          <option value="en">{t("lang.en")}</option>
          <option value="ur">{t("lang.ur")}</option>
        </SelectField>
        <SelectField label={t("users.link")} value={staffId} onChange={setStaffId}>
          <option value="">{t("users.unlinked")}</option>
          {(staff.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name_en}</option>)}
        </SelectField>
        {role === "staff" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {GRANTABLE_PERMISSIONS.map((permission) => (
              <label key={permission} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={perms.includes(permission)} onChange={() => toggle(permission)} />
                {t(`perm.${permission}` as MessageKey)}
              </label>
            ))}
          </div>
        ) : null}
        <Button onClick={() => void save(() => createUser({ data: { name, email, username, password, role, language, staffId: Number(staffId), permissions: perms } }), [["users"]]).then((result) => {
          if (result) { setName(""); setEmail(""); setPassword(""); }
        })}>{t("users.add")}</Button>
      </Card>
      <Card className="space-y-3">
        <h3 className="font-semibold">{t("users.requests")}</h3>
        {(query.data?.resets ?? []).length === 0 ? <p className="text-sm text-slate">{t("state.empty")}</p> : null}
        {(query.data?.resets ?? []).map((request) => (
          <button key={request.id} type="button" className="block text-sm underline" onClick={() => { setResetFor(request.user_id ?? ""); setRequestId(request.id); }}>
            {request.email}
          </button>
        ))}
        <Field label={t("users.reset")} type="password" value={resetPassword} onChange={setResetPassword} />
        <SelectField label={t("users.reset")} value={resetFor} onChange={setResetFor}>
          <option value="">{t("complaints.none")}</option>
          {(query.data?.users ?? []).map((user) => <option key={user.user_id} value={user.user_id}>{user.name}</option>)}
        </SelectField>
        <Button onClick={() => void save(() => resetUserPassword({ data: { userId: resetFor, password: resetPassword, requestId } }), [["users"]])}>{t("users.reset")}</Button>
      </Card>
      {(query.data?.users ?? []).map((user) => (
        <UserRow key={user.user_id} user={user} staff={staff.data ?? []} />
      ))}
    </div>
  );
}

function UserRow({
  user,
  staff,
}: {
  user: { user_id: string; name: string; email: string; username: string | null; role: string; status: string; language: string; staff_id: number | null; permissions: string[] };
  staff: { id: number; name_en: string }[];
}) {
  const { t } = useI18n();
  const save = useSaver();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [language, setLanguage] = useState(user.language);
  const [username, setUsername] = useState(user.username ?? "");
  const [staffId, setStaffId] = useState(user.staff_id ? String(user.staff_id) : "");
  const [perms, setPerms] = useState<string[]>(user.permissions);
  return (
    <Card>
      <button type="button" className="w-full text-start" onClick={() => setOpen((value) => !value)}>
        <p className="font-semibold">{user.name}</p>
        <p className="text-sm text-slate">{user.email} · {user.role} · {user.status}</p>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <Field label={t("profile.username")} value={username} onChange={setUsername} />
          <SelectField label={t("users.role")} value={role} onChange={setRole}>
            <option value="staff">{t("users.roleStaff")}</option>
            <option value="super_admin">{t("users.roleAdmin")}</option>
          </SelectField>
          <SelectField label={t("staff.status")} value={status} onChange={setStatus}>
            <option value="active">{t("staff.active")}</option>
            <option value="pending">{t("state.pending")}</option>
            <option value="disabled">{t("state.disabled")}</option>
          </SelectField>
          <SelectField label={t("profile.language")} value={language} onChange={setLanguage}>
            <option value="en">English</option>
            <option value="ur">اردو</option>
          </SelectField>
          <SelectField label={t("users.link")} value={staffId} onChange={setStaffId}>
            <option value="">{t("users.unlinked")}</option>
            {staff.map((profile) => <option key={profile.id} value={profile.id}>{profile.name_en}</option>)}
          </SelectField>
          {role === "staff" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {GRANTABLE_PERMISSIONS.map((permission) => (
                <label key={permission} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={perms.includes(permission)} onChange={() => setPerms(perms.includes(permission) ? perms.filter((item) => item !== permission) : [...perms, permission])} />
                  {t(`perm.${permission}` as MessageKey)}
                </label>
              ))}
            </div>
          ) : null}
          <Button onClick={() => void save(() => updateUser({
            data: { userId: user.user_id, name: user.name, role, status, language, username, staffId: Number(staffId), permissions: perms },
          }), [["users"]])}>{t("action.save")}</Button>
        </div>
      ) : null}
    </Card>
  );
}

export function SettingsModule() {
  const { t } = useI18n();
  const save = useSaver();
  const query = useRemote(["settings"], () => getSettings());
  const data = query.data;
  const [nameEn, setNameEn] = useState("");
  const [nameUr, setNameUr] = useState("");
  const [complaints, setComplaints] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [ownReport, setOwnReport] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!data || ready) return;
    setNameEn(data.name_en);
    setNameUr(data.name_ur);
    setComplaints(data.complaints_enabled);
    setAnonymous(data.anonymous_complaints);
    setOwnReport(data.staff_can_view_own_report);
    setReady(true);
  }, [data, ready]);
  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium">{t("settings.name")}</p>
      <BiPair en={nameEn} ur={nameUr} onEn={setNameEn} onUr={setNameUr} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={complaints} onChange={(event) => setComplaints(event.target.checked)} />{t("settings.complaints")}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />{t("settings.anonymous")}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={ownReport} onChange={(event) => setOwnReport(event.target.checked)} />{t("settings.ownReport")}</label>
      <Button onClick={() => void save(() => saveSettings({ data: { nameEn, nameUr, complaintsEnabled: complaints, anonymousComplaints: anonymous, staffCanViewOwnReport: ownReport } }), [["settings"], ["me"]])}>{t("action.save")}</Button>
    </Card>
  );
}

export function ActivityModule() {
  const { t, lang } = useI18n();
  const query = useRemote(["audit"], () => listAudit());
  return (
    <div className="space-y-2">
      {(query.data ?? []).length === 0 ? <Empty text={t("state.empty")} /> : null}
      {(query.data ?? []).map((item) => (
        <Card key={item.id}>
          <p>{lang === "ur" ? item.summary_ur : item.summary_en}</p>
          <p className="text-xs text-slate">{item.actor_name} · <span className="num">{item.created_at}</span></p>
        </Card>
      ))}
    </div>
  );
}
