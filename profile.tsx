import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import type { Me } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { listStaff, setLanguage, updateOwnProfile } from "@/lib/server/api";
import { useRemote, useSaver } from "@/components/remote";
import { Button, Card, Field, ShownText } from "@/components/ui";

export function ProfileModule({ me }: { me: Me }) {
  const { t, lang, setLang } = useI18n();
  const save = useSaver();
  const staff = useRemote(["staff", me.userId], () => listStaff());
  const mine = (staff.data ?? []).find((profile) => profile.id === me.staffId);
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="space-y-3">
        <Field label={t("login.name")} value={name} onChange={setName} />
        <Field label={t("profile.username")} value={username} onChange={setUsername} />
        <p className="text-sm text-slate">{me.email}</p>
        <div className="flex gap-2">
          <Button tone={lang === "en" ? "primary" : "quiet"} onClick={() => { setLang("en"); void setLanguage({ data: { language: "en" } }); }}>{t("lang.en")}</Button>
          <Button tone={lang === "ur" ? "primary" : "quiet"} onClick={() => { setLang("ur"); void setLanguage({ data: { language: "ur" } }); }}>{t("lang.ur")}</Button>
        </div>
        <Button
          onClick={() => {
            void save(() => updateOwnProfile({ data: { name, username } }), [["me", me.userId]]);
          }}
        >
          {t("action.save")}
        </Button>
      </Card>
      <Card className="space-y-3">
        <h3 className="font-semibold">{t("profile.password")}</h3>
        <Field label={t("profile.current")} type="password" value={currentPassword} onChange={setCurrentPassword} />
        <Field label={t("profile.next")} type="password" value={nextPassword} onChange={setNextPassword} />
        <Button
          onClick={() => {
            void authClient.changePassword({ currentPassword, newPassword: nextPassword, revokeOtherSessions: true }).then((result) => {
              if (result.error) return;
              setCurrentPassword("");
              setNextPassword("");
            });
          }}
        >
          {t("profile.password")}
        </Button>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">{t("home.responsibilities")}</h3>
        {mine ? (
          <>
            <p className="font-medium"><ShownText en={mine.name_en} ur={mine.name_ur} /></p>
            <p className="text-sm text-slate"><ShownText en={mine.designation_en} ur={mine.designation_ur} /></p>
            <ol className="mt-3 list-decimal space-y-1 ps-5">
              {mine.responsibilities.map((item) => (
                <li key={item.id}><ShownText en={item.text_en} ur={item.text_ur} /></li>
              ))}
            </ol>
            {mine.duties.length > 0 ? (
              <div className="mt-4">
                <p className="font-medium">{t("staff.duties")}</p>
                <ul className="mt-1 list-disc ps-5">
                  {mine.duties.map((item) => (
                    <li key={item.id}><ShownText en={item.text_en} ur={item.text_ur} /></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-slate">{t("home.noLink")}</p>
        )}
      </Card>
    </div>
  );
}
