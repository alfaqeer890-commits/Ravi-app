import { useState, type ReactNode } from "react";
import { useI18n, pickText, translationMissing, type MessageKey } from "@/lib/i18n";
import type { Lang } from "@/lib/access";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  children,
  onClick,
  type = "button",
  tone = "primary",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "primary" | "quiet" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const tones = {
    primary: "bg-teal text-paper hover:bg-teal-deep",
    quiet: "bg-paper text-ink border border-line hover:bg-ivory",
    danger: "bg-danger text-paper hover:opacity-90",
    ghost: "bg-transparent text-ink hover:bg-mist",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50",
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="num h-11 w-full rounded-xl border border-line bg-paper px-3 text-ink outline-none ring-teal focus:ring-2"
      />
    </label>
  );
}

export function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink outline-none ring-teal focus:ring-2"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-ink outline-none ring-teal focus:ring-2"
      >
        {children}
      </select>
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-paper p-4 shadow-card", className)}>{children}</section>;
}

export function BiPair({
  en,
  ur,
  onEn,
  onUr,
  multiline,
}: {
  en: string;
  ur: string;
  onEn: (value: string) => void;
  onUr: (value: string) => void;
  multiline?: boolean;
}) {
  const { t, lang } = useI18n();
  const Input = multiline ? "textarea" : "input";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate">{t("field.en")}</span>
        <Input
          value={en}
          onChange={(event) => onEn(event.target.value)}
          rows={multiline ? 3 : undefined}
          className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink outline-none ring-teal focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate">
          {t("field.ur")}
          {translationMissing(lang, en, ur) ? <em className="text-xs font-medium text-lavender not-italic">{t("state.missing")}</em> : null}
        </span>
        <Input
          value={ur}
          dir="rtl"
          onChange={(event) => onUr(event.target.value)}
          rows={multiline ? 3 : undefined}
          className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink outline-none ring-teal focus:ring-2"
        />
      </label>
    </div>
  );
}

export function ShownText({ en, ur }: { en?: string | null; ur?: string | null }) {
  const { lang, t } = useI18n();
  const text = pickText(lang, en, ur);
  if (!text) return null;
  return (
    <span>
      {text}
      {translationMissing(lang, en, ur) ? <em className="ms-2 text-xs text-lavender not-italic">{t("state.missing")}</em> : null}
    </span>
  );
}

export function MonthYear({
  month,
  year,
  onChange,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}) {
  const { t } = useI18n();
  const years = [year - 1, year, year + 1, year + 2];
  return (
    <div className="grid grid-cols-2 gap-3">
      <SelectField label={t("schedule.month")} value={String(month)} onChange={(value) => onChange(Number(value), year)}>
        {Array.from({ length: 12 }, (_, index) => (
          <option key={index + 1} value={index + 1}>
            {t(`month.${index + 1}` as MessageKey)}
          </option>
        ))}
      </SelectField>
      <SelectField label={t("schedule.year")} value={String(year)} onChange={(value) => onChange(month, Number(value))}>
        {[...new Set(years)].map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line bg-paper px-4 py-8 text-center text-slate">{text}</p>;
}

export function Banner({ text }: { text: string }) {
  return <p className="rounded-xl bg-lilac px-3 py-2 text-sm text-lavender">{text}</p>;
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "teal" | "lavender" | "danger" }) {
  const tones = {
    slate: "bg-ivory text-slate",
    teal: "bg-mist text-teal-deep",
    lavender: "bg-lilac text-lavender",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/40 p-3 md:items-center">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-ivory p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button tone="quiet" onClick={onClose}>
            {t("action.close")}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  return { busy, setBusy };
}

export function errorText(lang: Lang, code: string): string {
  const key = `err.${code}` as MessageKey;
  return translateSafe(lang, key, code);
}

function translateSafe(lang: Lang, key: MessageKey, fallback: string): string {
  try {
    return translate(lang, key);
  } catch {
    return fallback;
  }
}

export function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
