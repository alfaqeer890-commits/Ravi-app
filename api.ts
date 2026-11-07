import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  can,
  canAny,
  isGrantable,
  type Lang,
  type Me,
  type MemberStatus,
  type Permission,
  type Role,
} from "@/lib/access";
import { monthWeeks } from "@/lib/weeks";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}
function err(error: string): Err {
  return { ok: false, error };
}

function clip(value: unknown, max = 4000): string {
  return String(value ?? "").trim().slice(0, max);
}

function monthYear(month: unknown, year: unknown): { month: number; year: number } | null {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  return { month: m, year: y };
}

function optInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 400) return null;
  return n;
}

function pgTextArray(values: string[]): string {
  return `{${values.filter((value) => /^[a-z0-9._]+$/.test(value)).join(",")}}`;
}

type MemberRow = {
  user_id: string;
  role: Role;
  status: MemberStatus;
  language: Lang;
  username: string | null;
  staff_id: number | null;
  name: string;
  email: string;
  staff_name_en: string | null;
  staff_name_ur: string | null;
};

async function readMe(sql: Sql, userId: string): Promise<Me | null> {
  const rows = await sql<MemberRow>`
    select m.user_id, m.role, m.status, m.language, m.username, m.staff_id,
           u.name, u.email, s.name_en as staff_name_en, s.name_ur as staff_name_ur
    from members m
    join "user" u on u.id = m.user_id
    left join staff_profiles s on s.id = m.staff_id
    where m.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  const perms = await sql<{ permission: string }>`
    select permission from member_permissions where user_id = ${userId}
  `;
  const settings = await sql<{
    complaints_enabled: boolean;
    anonymous_complaints: boolean;
    staff_can_view_own_report: boolean;
    name_en: string;
    name_ur: string;
  }>`select complaints_enabled, anonymous_complaints, staff_can_view_own_report, name_en, name_ur from settings where id = 1`;
  const assigned = await sql<{ n: number }>`
    select count(*)::int as n from complaint_assignments where user_id = ${userId}
  `;
  const setting = settings[0];
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    username: row.username ?? "",
    role: row.role,
    status: row.status,
    language: row.language,
    permissions: perms.map((item) => item.permission),
    staffId: row.staff_id,
    staffNameEn: row.staff_name_en,
    staffNameUr: row.staff_name_ur,
    complaintsEnabled: setting?.complaints_enabled ?? false,
    anonymousComplaints: setting?.anonymous_complaints ?? false,
    ownReportEnabled: setting?.staff_can_view_own_report ?? false,
    institutionEn: setting?.name_en ?? "Institution",
    institutionUr: setting?.name_ur ?? "ادارہ",
    assignedComplaints: assigned[0]?.n ?? 0,
  };
}

async function gate(userId: string): Promise<{ me: Me; sql: Sql } | Err> {
  const sql = await getSql();
  const me = await readMe(sql, userId);
  if (!me) return err("NO_PROFILE");
  if (me.status === "disabled") return err("DISABLED");
  if (me.status !== "active") return err("PENDING");
  return { me, sql };
}

function superOnly(me: Me): Err | null {
  if (me.role !== "super_admin") return err("FORBIDDEN");
  return null;
}

function need(me: Me, permission: string): Err | null {
  if (!can(me, permission)) return err("FORBIDDEN");
  return null;
}

async function audit(sql: Sql, actorId: string, action: string, summaryEn: string, summaryUr: string) {
  await sql`
    insert into audit_logs (actor_id, action, summary_en, summary_ur)
    values (${actorId}, ${action}, ${summaryEn}, ${summaryUr})
  `;
}

async function notify(
  sql: Sql,
  userIds: string[],
  note: { titleEn: string; titleUr: string; bodyEn: string; bodyUr: string; href: string },
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    await sql`
      insert into notifications (user_id, title_en, title_ur, body_en, body_ur, href)
      values (${userId}, ${note.titleEn}, ${note.titleUr}, ${note.bodyEn}, ${note.bodyUr}, ${note.href})
    `;
  }
}

async function idsWith(sql: Sql, permission: string): Promise<string[]> {
  const rows = await sql<{ user_id: string }>`
    select m.user_id
    from members m
    left join member_permissions p on p.user_id = m.user_id and p.permission = ${permission}
    where m.status = 'active' and (m.role = 'super_admin' or p.permission is not null)
  `;
  return rows.map((row) => row.user_id);
}

async function adminIds(sql: Sql): Promise<string[]> {
  const rows = await sql<{ user_id: string }>`
    select user_id from members where role = 'super_admin' and status = 'active'
  `;
  return rows.map((row) => row.user_id);
}

async function replacePermissions(sql: Sql, userId: string, permissions: string[]) {
  const clean = permissions.filter(isGrantable);
  await sql`
    with deleted as (
      delete from member_permissions where user_id = ${userId} returning permission
    )
    insert into member_permissions (user_id, permission)
    select ${userId}, item
    from unnest(${pgTextArray(clean)}::text[]) as item
    where (select count(*) from deleted) >= 0
  `;
}

export const bootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from members where role = 'super_admin' and status = 'active'
  `;
  return { open: (rows[0]?.n ?? 0) === 0 };
});

export const lookupLogin = createServerFn({ method: "POST" })
  .validator((input: { identifier: string }) => ({ identifier: clip(input?.identifier, 200) }))
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();
    if (!identifier) return { email: null as string | null };
    if (identifier.includes("@")) return { email: identifier.toLowerCase() };
    const sql = await getSql();
    const rows = await sql<{ email: string }>`
      select u.email
      from members m
      join "user" u on u.id = m.user_id
      where lower(m.username) = lower(${identifier}) and m.status = 'active'
      limit 1
    `;
    return { email: rows[0]?.email ?? null };
  });

export const requestPasswordHelp = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => ({ email: clip(input?.email, 200).toLowerCase() }))
  .handler(async ({ data }) => {
    if (!data.email.includes("@")) return { ok: true as const };
    const sql = await getSql();
    const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${data.email} limit 1`;
    if (users[0]) {
      await sql`insert into password_requests (email, user_id) values (${data.email}, ${users[0].id})`;
      await notify(sql, await adminIds(sql), {
        titleEn: "Password help requested",
        titleUr: "پاس ورڈ کی مدد کی درخواست",
        bodyEn: "Someone asked for a new password. Set it from account management.",
        bodyUr: "کسی نے نئے پاس ورڈ کی درخواست کی ہے۔ اسے اکاؤنٹ کے انتظام سے مقرر کریں۔",
        href: "users",
      });
      await audit(sql, users[0].id, "password.request", "Password help was requested.", "پاس ورڈ کی مدد کی درخواست ہوئی۔");
    }
    return { ok: true as const };
  });

export const ensureMe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Result<Me>> => {
    const sql = await getSql();
    const existing = await readMe(sql, context.userId);
    if (existing) {
      if (existing.status === "disabled") {
        await sql`delete from session where "userId" = ${context.userId}`;
      }
      return ok(existing);
    }
    const user = await sql<{ id: string }>`select id from "user" where id = ${context.userId}`;
    if (!user[0]) return err("NO_USER");
    await sql`
      insert into members (user_id, role, status, language, username)
      select ${context.userId},
        case when exists (
          select 1 from members where role = 'super_admin' and status = 'active'
        ) then 'staff' else 'super_admin' end,
        case when exists (
          select 1 from members where role = 'super_admin' and status = 'active'
        ) then 'pending' else 'active' end,
        'en',
        null
      from (select pg_advisory_xact_lock(841201)) held
      where not exists (select 1 from members where user_id = ${context.userId})
    `;
    const created = await readMe(sql, context.userId);
    if (!created) return err("NO_USER");
    if (created.role === "super_admin") {
      await audit(
        sql,
        context.userId,
        "admin.open",
        "The institution administrator account was opened.",
        "ادارے کے منتظم کا اکاؤنٹ کھولا گیا۔",
      );
    }
    return ok(created);
  });

export const setLanguage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { language: string }) => ({ language: input?.language === "ur" ? "ur" : "en" }))
  .handler(async ({ context, data }): Promise<Result<{ language: Lang }>> => {
    const sql = await getSql();
    const me = await readMe(sql, context.userId);
    if (!me) return err("NO_PROFILE");
    if (me.status === "disabled") return err("DISABLED");
    await sql`update members set language = ${data.language}, updated_at = now() where user_id = ${context.userId}`;
    return ok({ language: data.language as Lang });
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; username: string }) => ({
    name: clip(input?.name, 120),
    username: clip(input?.username, 60).toLowerCase(),
  }))
  .handler(async ({ context, data }): Promise<Result<{ name: string }>> => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!data.name) return err("INVALID");
    if (data.username && !/^[a-z0-9._-]{3,60}$/.test(data.username)) return err("USERNAME");
    try {
      await access.sql`update "user" set name = ${data.name}, "updatedAt" = now() where id = ${context.userId}`;
      await access.sql`
        update members set username = ${data.username || null}, updated_at = now() where user_id = ${context.userId}
      `;
    } catch {
      return err("USERNAME_TAKEN");
    }
    return ok({ name: data.name });
  });

type Line = { textEn: string; textUr: string };

function lines(value: unknown, max = 40): Line[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map((item) => {
    const row = item as { textEn?: unknown; textUr?: unknown };
    return { textEn: clip(row?.textEn, 1000), textUr: clip(row?.textUr, 1000) };
  });
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const full = can(access.me, "directory.view");
    const seeAll =
      full ||
      canAny(access.me, [
        "leave.submit",
        "leave.class_review",
        "leave.final",
        "attendance.staff",
        "attendance.students",
        "complaints.manage",
        "complaints.submit",
        "reports.manage",
        "students.manage",
      ]);
    const sql = access.sql;
    const profiles = await sql<{
      id: number;
      name_en: string;
      name_ur: string;
      designation_en: string;
      designation_ur: string;
      department_en: string;
      department_ur: string;
      contact: string;
      status: string;
      user_id: string | null;
      is_attendance_coordinator: boolean;
      is_leave_final_approver: boolean;
      is_class_incharge: boolean;
      sort_order: number;
    }>`
      select id, name_en, name_ur, designation_en, designation_ur, department_en, department_ur,
             contact, status, user_id, is_attendance_coordinator, is_leave_final_approver,
             is_class_incharge, sort_order
      from staff_profiles
      order by sort_order, id
    `;
    const visible = seeAll ? profiles : profiles.filter((profile) => profile.id === access.me.staffId);
    const ids = visible.map((profile) => profile.id);
    const responsibilities = ids.length
      ? await sql<{ id: number; staff_id: number; sort_order: number; text_en: string; text_ur: string }>`
          select id, staff_id, sort_order, text_en, text_ur from staff_responsibilities order by sort_order, id
        `
      : [];
    const duties = ids.length
      ? await sql<{ id: number; staff_id: number; sort_order: number; text_en: string; text_ur: string }>`
          select id, staff_id, sort_order, text_en, text_ur from staff_duties order by sort_order, id
        `
      : [];
    return ok(
      visible.map((profile) => ({
        ...profile,
        contact: full || profile.id === access.me.staffId ? profile.contact : "",
        responsibilities:
          full || profile.id === access.me.staffId
            ? responsibilities.filter((item) => item.staff_id === profile.id)
            : [],
        duties:
          full || profile.id === access.me.staffId
            ? duties.filter((item) => item.staff_id === profile.id)
            : [],
      })),
    );
  });

export const saveStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }): Promise<Result<{ id: number }>> => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const nameEn = clip(data.nameEn, 160);
    const nameUr = clip(data.nameUr, 160);
    const designationEn = clip(data.designationEn, 200);
    const designationUr = clip(data.designationUr, 200);
    if (!nameEn || !designationEn) return err("INVALID");
    const responsibilities = lines(data.responsibilities).filter((line) => line.textEn || line.textUr);
    const duties = lines(data.duties).filter((line) => line.textEn || line.textUr);
    const id = Number(data.id);
    let staffId = id;
    if (Number.isInteger(id) && id > 0) {
      const updated = await access.sql`
        update staff_profiles set
          name_en = ${nameEn},
          name_ur = ${nameUr},
          designation_en = ${designationEn},
          designation_ur = ${designationUr},
          department_en = ${clip(data.departmentEn, 160)},
          department_ur = ${clip(data.departmentUr, 160)},
          contact = ${clip(data.contact, 160)},
          is_attendance_coordinator = ${Boolean(data.isAttendanceCoordinator)},
          is_leave_final_approver = ${Boolean(data.isLeaveFinalApprover)},
          is_class_incharge = ${Boolean(data.isClassIncharge)},
          sort_order = ${Number.isInteger(Number(data.sortOrder)) ? Number(data.sortOrder) : 0},
          updated_at = now()
        where id = ${id}
        returning id
      `;
      if (!updated.length) return err("NOT_FOUND");
    } else {
      const inserted = await access.sql<{ id: number }>`
        insert into staff_profiles (
          name_en, name_ur, designation_en, designation_ur, department_en, department_ur, contact,
          is_attendance_coordinator, is_leave_final_approver, is_class_incharge, sort_order
        ) values (
          ${nameEn}, ${nameUr}, ${designationEn}, ${designationUr},
          ${clip(data.departmentEn, 160)}, ${clip(data.departmentUr, 160)}, ${clip(data.contact, 160)},
          ${Boolean(data.isAttendanceCoordinator)}, ${Boolean(data.isLeaveFinalApprover)},
          ${Boolean(data.isClassIncharge)}, ${Number.isInteger(Number(data.sortOrder)) ? Number(data.sortOrder) : 99}
        ) returning id
      `;
      staffId = inserted[0].id;
    }
    await access.sql`delete from staff_responsibilities where staff_id = ${staffId}`;
    await access.sql`delete from staff_duties where staff_id = ${staffId}`;
    for (let index = 0; index < responsibilities.length; index += 1) {
      const line = responsibilities[index];
      await access.sql`
        insert into staff_responsibilities (staff_id, sort_order, text_en, text_ur)
        values (${staffId}, ${index + 1}, ${line.textEn}, ${line.textUr})
      `;
    }
    for (let index = 0; index < duties.length; index += 1) {
      const line = duties[index];
      await access.sql`
        insert into staff_duties (staff_id, sort_order, text_en, text_ur)
        values (${staffId}, ${index + 1}, ${line.textEn}, ${line.textUr})
      `;
    }
    await audit(access.sql, context.userId, "staff.save", `Staff profile saved: ${nameEn}`, `عملے کا پروفائل محفوظ ہوا: ${nameUr || nameEn}`);
    return ok({ id: staffId });
  });

export const setStaffStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: string }) => ({
    id: Number(input?.id),
    status: input?.status === "inactive" ? "inactive" : "active",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    if (!Number.isInteger(data.id)) return err("INVALID");
    await access.sql`
      update staff_profiles
      set status = ${data.status},
          deactivated_at = case when ${data.status} = 'inactive' then now() else null end,
          updated_at = now()
      where id = ${data.id}
    `;
    await audit(
      access.sql,
      context.userId,
      "staff.status",
      data.status === "inactive" ? "A staff profile was deactivated." : "A staff profile was reactivated.",
      data.status === "inactive" ? "عملے کا پروفائل غیر فعال کیا گیا۔" : "عملے کا پروفائل دوبارہ فعال کیا گیا۔",
    );
    return ok({ id: data.id });
  });

export const listStudents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (
      !canAny(access.me, ["students.view", "students.manage", "attendance.students", "leave.submit", "leave.view", "leave.class_review", "leave.final", "leave.absence"])
    ) {
      return err("FORBIDDEN");
    }
    const rows = await access.sql`
      select id, name_en, name_ur, class_en, class_ur, guardian_name, guardian_contact,
             admission_date::text as admission_date, status, remarks_en, remarks_ur
      from students
      order by status, name_en, id
    `;
    return ok(rows);
  });

export const saveStudent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }): Promise<Result<{ id: number }>> => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "students.manage");
    if (denied) return denied;
    const nameEn = clip(data.nameEn, 160);
    if (!nameEn) return err("INVALID");
    const admission = clip(data.admissionDate, 10);
    const id = Number(data.id);
    if (Number.isInteger(id) && id > 0) {
      await access.sql`
        update students set
          name_en = ${nameEn},
          name_ur = ${clip(data.nameUr, 160)},
          class_en = ${clip(data.classEn, 120)},
          class_ur = ${clip(data.classUr, 120)},
          guardian_name = ${clip(data.guardianName, 160)},
          guardian_contact = ${clip(data.guardianContact, 80)},
          admission_date = ${admission || null},
          remarks_en = ${clip(data.remarksEn, 2000)},
          remarks_ur = ${clip(data.remarksUr, 2000)},
          updated_at = now()
        where id = ${id}
      `;
      await audit(access.sql, context.userId, "student.save", `Student record updated: ${nameEn}`, `طالب علم کا ریکارڈ تبدیل ہوا: ${clip(data.nameUr, 160) || nameEn}`);
      return ok({ id });
    }
    const inserted = await access.sql<{ id: number }>`
      insert into students (
        name_en, name_ur, class_en, class_ur, guardian_name, guardian_contact, admission_date, remarks_en, remarks_ur
      ) values (
        ${nameEn}, ${clip(data.nameUr, 160)}, ${clip(data.classEn, 120)}, ${clip(data.classUr, 120)},
        ${clip(data.guardianName, 160)}, ${clip(data.guardianContact, 80)}, ${admission || null},
        ${clip(data.remarksEn, 2000)}, ${clip(data.remarksUr, 2000)}
      ) returning id
    `;
    const studentId = inserted[0].id;
    if (admission) {
      await access.sql`
        insert into student_events (student_id, kind, event_date, notes_en, notes_ur, recorded_by)
        values (${studentId}, 'admission', ${admission}, ${clip(data.remarksEn, 2000)}, ${clip(data.remarksUr, 2000)}, ${context.userId})
      `;
    }
    await audit(access.sql, context.userId, "student.create", `Student admitted to the register: ${nameEn}`, `طالب علم رجسٹر میں داخل ہوا: ${clip(data.nameUr, 160) || nameEn}`);
    return ok({ id: studentId });
  });

export const departStudent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; date: string; notesEn: string; notesUr: string }) => ({
    id: Number(input?.id),
    date: clip(input?.date, 10),
    notesEn: clip(input?.notesEn, 2000),
    notesUr: clip(input?.notesUr, 2000),
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "students.manage");
    if (denied) return denied;
    if (!Number.isInteger(data.id) || !data.date) return err("INVALID");
    await access.sql`
      update students set status = 'departed', updated_at = now() where id = ${data.id}
    `;
    await access.sql`
      insert into student_events (student_id, kind, event_date, notes_en, notes_ur, recorded_by)
      values (${data.id}, 'departure', ${data.date}, ${data.notesEn}, ${data.notesUr}, ${context.userId})
    `;
    await audit(access.sql, context.userId, "student.depart", "A student departure was recorded.", "ایک طالب علم کی رخصتی درج ہوئی۔");
    return ok({ id: data.id });
  });

export const listStudentEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "students.view");
    if (denied && !can(access.me, "students.manage")) return denied;
    const rows = await access.sql`
      select e.id, e.student_id, e.kind, e.event_date::text as event_date, e.notes_en, e.notes_ur,
             e.created_at::text as created_at, s.name_en, s.name_ur
      from student_events e
      join students s on s.id = e.student_id
      order by e.event_date desc, e.id desc
    `;
    return ok(rows);
  });

type AttendanceInput = { date: string; rows: { id: number; status: string; remarks?: string; arrival?: string; departure?: string; leaveInfo?: string }[] };

function cleanStatus(value: string): string {
  return ["present", "absent", "leave", "late"].includes(value) ? value : "";
}

export const listStudentAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { date: string }) => ({ date: clip(input?.date, 10) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!canAny(access.me, ["attendance.students", "students.view"])) return err("FORBIDDEN");
    const rows = await access.sql`
      select id, student_id, attendance_date::text as attendance_date, status, remarks, recorded_by
      from student_attendance
      where attendance_date = ${data.date}
    `;
    return ok(rows);
  });

export const saveStudentAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: AttendanceInput) => ({
    date: clip(input?.date, 10),
    rows: Array.isArray(input?.rows) ? input.rows.slice(0, 500) : [],
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "attendance.students");
    if (denied) return denied;
    if (!data.date) return err("INVALID");
    for (const row of data.rows) {
      const studentId = Number(row.id);
      const status = cleanStatus(String(row.status ?? ""));
      if (!Number.isInteger(studentId)) continue;
      if (!status) {
        await access.sql`delete from student_attendance where student_id = ${studentId} and attendance_date = ${data.date}`;
        continue;
      }
      await access.sql`
        insert into student_attendance (student_id, attendance_date, status, remarks, recorded_by)
        values (${studentId}, ${data.date}, ${status}, ${clip(row.remarks, 500)}, ${context.userId})
        on conflict (student_id, attendance_date) do update set
          status = excluded.status,
          remarks = excluded.remarks,
          recorded_by = excluded.recorded_by,
          updated_at = now()
      `;
    }
    await audit(access.sql, context.userId, "attendance.students", `Student attendance saved for ${data.date}.`, `طلبہ کی حاضری محفوظ ہوئی: ${data.date}`);
    return ok({ date: data.date });
  });

export const listStaffAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { date: string; own?: boolean }) => ({
    date: clip(input?.date, 10),
    own: Boolean(input?.own),
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (data.own) {
      if (!can(access.me, "attendance.own") || !access.me.staffId) return err("FORBIDDEN");
      const rows = await access.sql`
        select id, staff_id, attendance_date::text as attendance_date, status, arrival_time, departure_time, leave_info, remarks
        from staff_attendance
        where staff_id = ${access.me.staffId}
        order by attendance_date desc
        limit 120
      `;
      return ok(rows);
    }
    if (!can(access.me, "attendance.staff")) return err("FORBIDDEN");
    const rows = await access.sql`
      select id, staff_id, attendance_date::text as attendance_date, status, arrival_time, departure_time, leave_info, remarks, recorded_by
      from staff_attendance
      where attendance_date = ${data.date}
    `;
    return ok(rows);
  });

export const saveStaffAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: AttendanceInput) => ({
    date: clip(input?.date, 10),
    rows: Array.isArray(input?.rows) ? input.rows.slice(0, 300) : [],
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "attendance.staff");
    if (denied) return denied;
    if (!data.date) return err("INVALID");
    for (const row of data.rows) {
      const staffId = Number(row.id);
      const status = cleanStatus(String(row.status ?? ""));
      if (!Number.isInteger(staffId)) continue;
      if (!status) {
        await access.sql`delete from staff_attendance where staff_id = ${staffId} and attendance_date = ${data.date}`;
        continue;
      }
      await access.sql`
        insert into staff_attendance (
          staff_id, attendance_date, status, arrival_time, departure_time, leave_info, remarks, recorded_by
        ) values (
          ${staffId}, ${data.date}, ${status}, ${clip(row.arrival, 8)}, ${clip(row.departure, 8)},
          ${clip(row.leaveInfo, 500)}, ${clip(row.remarks, 500)}, ${context.userId}
        )
        on conflict (staff_id, attendance_date) do update set
          status = excluded.status,
          arrival_time = excluded.arrival_time,
          departure_time = excluded.departure_time,
          leave_info = excluded.leave_info,
          remarks = excluded.remarks,
          recorded_by = excluded.recorded_by,
          updated_at = now()
      `;
    }
    await audit(access.sql, context.userId, "attendance.staff", `Staff attendance saved for ${data.date}.`, `عملے کی حاضری محفوظ ہوئی: ${data.date}`);
    return ok({ date: data.date });
  });

export const attendanceSummary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number; kind: string }) => ({
    month: Number(input?.month),
    year: Number(input?.year),
    kind: input?.kind === "staff" ? "staff" : "student",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const start = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
    const endMonth = period.month === 12 ? 1 : period.month + 1;
    const endYear = period.month === 12 ? period.year + 1 : period.year;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    if (data.kind === "staff") {
      if (!can(access.me, "attendance.staff")) return err("FORBIDDEN");
      const rows = await access.sql`
        select staff_id as person_id, status, count(*)::int as n
        from staff_attendance
        where attendance_date >= ${start} and attendance_date < ${end}
        group by staff_id, status
      `;
      return ok(rows);
    }
    if (!canAny(access.me, ["attendance.students", "students.view"])) return err("FORBIDDEN");
    const rows = await access.sql`
      select student_id as person_id, status, count(*)::int as n
      from student_attendance
      where attendance_date >= ${start} and attendance_date < ${end}
      group by student_id, status
    `;
    return ok(rows);
  });

export const listLeaves = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!canAny(access.me, ["leave.view", "leave.submit", "leave.class_review", "leave.final", "leave.receive"])) {
      return err("FORBIDDEN");
    }
    const rows = await access.sql`
      select l.id, l.student_id, l.class_incharge_staff_id, l.start_date::text as start_date,
             l.end_date::text as end_date, l.reason, l.class_status, l.class_note, l.final_status,
             l.final_note, l.stage, l.created_at::text as created_at,
             s.name_en as student_en, s.name_ur as student_ur, s.class_en, s.class_ur,
             c.name_en as incharge_en, c.name_ur as incharge_ur
      from leave_requests l
      join students s on s.id = l.student_id
      left join staff_profiles c on c.id = l.class_incharge_staff_id
      order by l.created_at desc
    `;
    return ok(rows);
  });

export const createLeave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "leave.submit");
    if (denied) return denied;
    const studentId = Number(data.studentId);
    const incharge = Number(data.classInchargeId);
    const start = clip(data.startDate, 10);
    const end = clip(data.endDate, 10);
    const reason = clip(data.reason, 2000);
    if (!Number.isInteger(studentId) || !start || !end || !reason) return err("INVALID");
    const inserted = await access.sql<{ id: number }>`
      insert into leave_requests (
        student_id, class_incharge_staff_id, start_date, end_date, reason, created_by
      ) values (
        ${studentId}, ${Number.isInteger(incharge) && incharge > 0 ? incharge : null}, ${start}, ${end}, ${reason}, ${context.userId}
      ) returning id
    `;
    const recipients = await idsWith(access.sql, "leave.class_review");
    if (Number.isInteger(incharge) && incharge > 0) {
      const linked = await access.sql<{ user_id: string | null }>`select user_id from staff_profiles where id = ${incharge}`;
      if (linked[0]?.user_id) recipients.push(linked[0].user_id);
    }
    await notify(access.sql, recipients, {
      titleEn: "Leave request awaiting class review",
      titleUr: "چھٹی کی درخواست کلاس جائزے کے منتظر ہے",
      bodyEn: "A student leave request needs the class in-charge.",
      bodyUr: "ایک طالب علم کی چھٹی کی درخواست کلاس انچارج کے جائزے کی منتظر ہے۔",
      href: "leave",
    });
    await audit(access.sql, context.userId, "leave.create", "A student leave request was submitted.", "طالب علم کی چھٹی کی درخواست جمع ہوئی۔");
    return ok({ id: inserted[0].id });
  });

export const decideLeave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; step: string; decision: string; note: string }) => ({
    id: Number(input?.id),
    step: input?.step === "final" ? "final" : "class",
    decision: input?.decision === "approved" ? "approved" : "rejected",
    note: clip(input?.note, 2000),
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const rows = await access.sql<{
      id: number;
      stage: string;
      class_incharge_staff_id: number | null;
    }>`select id, stage, class_incharge_staff_id from leave_requests where id = ${data.id}`;
    const request = rows[0];
    if (!request) return err("NOT_FOUND");
    if (data.step === "class") {
      if (request.stage !== "class_review") return err("INVALID_STAGE");
      const isAssigned =
        access.me.staffId != null && access.me.staffId === request.class_incharge_staff_id;
      if (access.me.role !== "super_admin" && !(can(access.me, "leave.class_review") && (isAssigned || request.class_incharge_staff_id == null))) {
        return err("FORBIDDEN");
      }
      const stage = data.decision === "approved" ? "awaiting_final" : "rejected";
      await access.sql`
        update leave_requests set
          class_status = ${data.decision},
          class_note = ${data.note},
          class_by = ${context.userId},
          class_at = now(),
          stage = ${stage},
          updated_at = now()
        where id = ${data.id}
      `;
      if (data.decision === "approved") {
        const finals = await idsWith(access.sql, "leave.final");
        const flagged = await access.sql<{ user_id: string | null }>`
          select user_id from staff_profiles where is_leave_final_approver = true and user_id is not null
        `;
        await notify(access.sql, [...finals, ...flagged.map((row) => row.user_id ?? "")], {
          titleEn: "Leave request awaiting final approval",
          titleUr: "چھٹی کی درخواست حتمی منظوری کی منتظر ہے",
          bodyEn: "The class in-charge approved a request. It is not official until final approval.",
          bodyUr: "کلاس انچارج نے درخواست منظور کی۔ حتمی منظوری کے بغیر یہ باقاعدہ نہیں۔",
          href: "leave",
        });
      }
    } else {
      if (request.stage !== "awaiting_final") return err("INVALID_STAGE");
      const flagged = await access.sql<{ id: number }>`
        select id from staff_profiles
        where id = ${access.me.staffId ?? 0} and is_leave_final_approver = true
      `;
      if (access.me.role !== "super_admin" && !can(access.me, "leave.final") && !flagged.length) {
        return err("FORBIDDEN");
      }
      const stage = data.decision === "approved" ? "approved" : "rejected";
      await access.sql`
        update leave_requests set
          final_status = ${data.decision},
          final_note = ${data.note},
          final_by = ${context.userId},
          final_at = now(),
          stage = ${stage},
          updated_at = now()
        where id = ${data.id}
      `;
      if (data.decision === "approved") {
        const receivers = await idsWith(access.sql, "leave.receive");
        const coordinators = await access.sql<{ user_id: string | null }>`
          select user_id from staff_profiles where is_attendance_coordinator = true and user_id is not null
        `;
        await notify(access.sql, [...receivers, ...coordinators.map((row) => row.user_id ?? "")], {
          titleEn: "Student leave finally approved",
          titleUr: "طالب علم کی چھٹی حتمی طور پر منظور ہوئی",
          bodyEn: "Approved leave was forwarded for attendance records.",
          bodyUr: "منظور شدہ چھٹی حاضری کے ریکارڈ کے لیے بھیج دی گئی۔",
          href: "leave",
        });
      }
    }
    await audit(access.sql, context.userId, "leave.decide", "A leave request decision was recorded.", "چھٹی کی درخواست کا فیصلہ درج ہوا۔");
    return ok({ id: data.id });
  });

export const listAbsences = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "leave.absence");
    if (denied) return denied;
    const rows = await access.sql`
      select a.id, a.student_id, a.consecutive_days, a.guardian_contact, a.contact_date::text as contact_date,
             a.remarks, a.follow_up_status, s.name_en, s.name_ur
      from absence_followups a
      join students s on s.id = a.student_id
      order by a.created_at desc
    `;
    return ok(rows);
  });

export const saveAbsence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "leave.absence");
    if (denied) return denied;
    const studentId = Number(data.studentId);
    const days = optInt(data.consecutiveDays);
    const status = ["open", "contacted", "closed"].includes(String(data.followUpStatus))
      ? String(data.followUpStatus)
      : "open";
    if (!Number.isInteger(studentId) || days == null) return err("INVALID");
    const id = Number(data.id);
    if (Number.isInteger(id) && id > 0) {
      await access.sql`
        update absence_followups set
          consecutive_days = ${days},
          guardian_contact = ${clip(data.guardianContact, 80)},
          contact_date = ${clip(data.contactDate, 10) || null},
          remarks = ${clip(data.remarks, 2000)},
          follow_up_status = ${status},
          updated_at = now()
        where id = ${id}
      `;
      return ok({ id });
    }
    const inserted = await access.sql<{ id: number }>`
      insert into absence_followups (
        student_id, consecutive_days, guardian_contact, contact_date, remarks, follow_up_status, recorded_by
      ) values (
        ${studentId}, ${days}, ${clip(data.guardianContact, 80)}, ${clip(data.contactDate, 10) || null},
        ${clip(data.remarks, 2000)}, ${status}, ${context.userId}
      ) returning id
    `;
    await audit(access.sql, context.userId, "absence.save", "A continuous-absence follow-up was recorded.", "مسلسل غیر حاضری کا فالو اپ درج ہوا۔");
    return ok({ id: inserted[0].id });
  });

export const listComplaintSetup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const categories = await access.sql`
      select id, label_en, label_ur, active, sort_order from complaint_categories order by sort_order, id
    `;
    const routes = access.me.role === "super_admin"
      ? await access.sql`select id, category_id, staff_id from complaint_routes order by id`
      : [];
    return ok({ categories, routes, canConfigure: access.me.role === "super_admin" });
  });

export const saveComplaintCategory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const labelEn = clip(data.labelEn, 160);
    const labelUr = clip(data.labelUr, 160);
    if (!labelEn) return err("INVALID");
    const id = Number(data.id);
    if (Number.isInteger(id) && id > 0) {
      await access.sql`
        update complaint_categories
        set label_en = ${labelEn}, label_ur = ${labelUr}, active = ${data.active !== false}
        where id = ${id}
      `;
      return ok({ id });
    }
    const inserted = await access.sql<{ id: number }>`
      insert into complaint_categories (label_en, label_ur, sort_order)
      values (${labelEn}, ${labelUr}, 50)
      returning id
    `;
    return ok({ id: inserted[0].id });
  });

export const saveComplaintRoutes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { categoryId: number; staffIds: number[] }) => ({
    categoryId: Number(input?.categoryId),
    staffIds: Array.isArray(input?.staffIds) ? input.staffIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [],
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    await access.sql`
      with deleted as (
        delete from complaint_routes where category_id = ${data.categoryId} returning id
      )
      insert into complaint_routes (category_id, staff_id)
      select ${data.categoryId}, item
      from unnest(${`{${data.staffIds.join(",")}}`}::int[]) as item
      where (select count(*) from deleted) >= 0
    `;
    await audit(access.sql, context.userId, "complaints.routes", "Complaint routing rules were updated.", "شکایت کے راستے کی قواعد تبدیل ہوئیں۔");
    return ok({ categoryId: data.categoryId });
  });

export const submitComplaint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!access.me.complaintsEnabled && access.me.role !== "super_admin") return err("COMPLAINTS_OFF");
    if (!can(access.me, "complaints.submit") && access.me.role !== "super_admin") return err("FORBIDDEN");
    const anonymous = Boolean(data.anonymous);
    if (anonymous && !access.me.anonymousComplaints) return err("ANON_OFF");
    const subject = clip(data.subject, 200);
    const body = clip(data.body, 8000);
    const categoryId = Number(data.categoryId);
    if (!subject || !body || !Number.isInteger(categoryId)) return err("INVALID");
    const name = anonymous ? "" : clip(data.complainantName, 160) || access.me.name;
    const attachment = clip(data.attachmentData, 900000);
    if (attachment && !attachment.startsWith("data:") && attachment.length > 0) {
      /* raw base64 accepted */
    }
    const inserted = await access.sql<{ id: number }>`
      insert into complaints (
        complainant_name, is_anonymous, category_id, subject, body, related_staff_id, submitted_by,
        attachment_name, attachment_mime, attachment_data
      ) values (
        ${name}, ${anonymous}, ${categoryId}, ${subject}, ${body},
        ${Number(data.relatedStaffId) > 0 ? Number(data.relatedStaffId) : null},
        ${context.userId},
        ${attachment ? clip(data.attachmentName, 180) : null},
        ${attachment ? clip(data.attachmentMime, 80) : null},
        ${attachment || null}
      ) returning id
    `;
    const complaintId = inserted[0].id;
    const routes = await access.sql<{ staff_id: number; user_id: string | null; name_en: string }>`
      select r.staff_id, s.user_id, s.name_en
      from complaint_routes r
      join staff_profiles s on s.id = r.staff_id
      where r.category_id = ${categoryId}
    `;
    const recipients = await adminIds(access.sql);
    for (const route of routes) {
      await access.sql`
        insert into complaint_assignments (complaint_id, user_id, staff_id)
        values (${complaintId}, ${route.user_id}, ${route.staff_id})
      `;
      if (route.user_id) recipients.push(route.user_id);
    }
    for (const adminId of await adminIds(access.sql)) {
      await access.sql`
        insert into complaint_assignments (complaint_id, user_id, staff_id)
        values (${complaintId}, ${adminId}, null)
      `;
    }
    await notify(access.sql, recipients, {
      titleEn: "New complaint assigned",
      titleUr: "نئی شکایت موصول ہوئی",
      bodyEn: subject,
      bodyUr: subject,
      href: "complaints",
    });
    await audit(access.sql, context.userId, "complaint.submit", "A complaint was submitted.", "ایک شکایت جمع ہوئی۔");
    return ok({ id: complaintId });
  });

export const listComplaints = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const manage = can(access.me, "complaints.manage");
    const complaints = await access.sql<{
      id: number;
      complainant_name: string;
      is_anonymous: boolean;
      category_id: number | null;
      subject: string;
      body: string;
      related_staff_id: number | null;
      status: string;
      submitted_by: string | null;
      attachment_name: string | null;
      attachment_mime: string | null;
      attachment_data: string | null;
      created_at: string;
    }>`
      select id, complainant_name, is_anonymous, category_id, subject, body, related_staff_id, status,
             submitted_by, attachment_name, attachment_mime, attachment_data, created_at::text as created_at
      from complaints
      order by created_at desc
    `;
    const assignments = await access.sql<{ complaint_id: number; user_id: string | null; staff_id: number | null }>`
      select complaint_id, user_id, staff_id from complaint_assignments
    `;
    const notes = await access.sql<{
      id: number;
      complaint_id: number;
      author_id: string;
      kind: string;
      body: string;
      created_at: string;
    }>`
      select id, complaint_id, author_id, kind, body, created_at::text as created_at
      from complaint_notes order by id
    `;
    const mine = new Set(
      assignments.filter((item) => item.user_id === context.userId).map((item) => item.complaint_id),
    );
    const visible = complaints.filter((complaint) => {
      if (manage) return true;
      if (mine.has(complaint.id)) return true;
      return complaint.submitted_by === context.userId;
    });
    if (!manage && !visible.length && !can(access.me, "complaints.submit") && access.me.assignedComplaints === 0) {
      return err("FORBIDDEN");
    }
    return ok(
      visible.map((complaint) => {
        const full = manage || mine.has(complaint.id);
        const own = complaint.submitted_by === context.userId;
        return {
          id: complaint.id,
          subject: complaint.subject,
          body: full || own ? complaint.body : "",
          status: complaint.status,
          categoryId: complaint.category_id,
          relatedStaffId: complaint.related_staff_id,
          createdAt: complaint.created_at,
          isAnonymous: complaint.is_anonymous,
          complainantName: complaint.is_anonymous && !manage ? "" : complaint.complainant_name,
          submittedBy: manage && !complaint.is_anonymous ? complaint.submitted_by : manage && complaint.is_anonymous ? complaint.submitted_by : null,
          anonymousAccountVisible: manage && complaint.is_anonymous,
          attachmentName: full || own ? complaint.attachment_name : null,
          attachmentMime: full || own ? complaint.attachment_mime : null,
          attachmentData: full || own ? complaint.attachment_data : null,
          scope: full ? "full" : "own",
          notes: notes
            .filter((note) => note.complaint_id === complaint.id)
            .filter((note) => full || (own && note.kind === "response"))
            .map((note) => ({ id: note.id, kind: note.kind, body: note.body, createdAt: note.created_at })),
        };
      }),
    );
  });

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: string; note: string; kind: string }) => ({
    id: Number(input?.id),
    status: String(input?.status ?? ""),
    note: clip(input?.note, 4000),
    kind: input?.kind === "response" ? "response" : "investigation",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const statuses = ["submitted", "pending_review", "under_investigation", "resolved", "rejected"];
    if (!statuses.includes(data.status)) return err("INVALID");
    const assigned = await access.sql<{ id: number }>`
      select id from complaint_assignments where complaint_id = ${data.id} and user_id = ${context.userId} limit 1
    `;
    if (!can(access.me, "complaints.manage") && !assigned.length) return err("FORBIDDEN");
    await access.sql`update complaints set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (data.note) {
      await access.sql`
        insert into complaint_notes (complaint_id, author_id, kind, body)
        values (${data.id}, ${context.userId}, ${data.kind}, ${data.note})
      `;
    }
    await access.sql`
      insert into complaint_notes (complaint_id, author_id, kind, body)
      values (${data.id}, ${context.userId}, 'status', ${data.status})
    `;
    const owner = await access.sql<{ submitted_by: string | null }>`select submitted_by from complaints where id = ${data.id}`;
    if (owner[0]?.submitted_by && data.kind === "response") {
      await notify(access.sql, [owner[0].submitted_by], {
        titleEn: "Complaint response posted",
        titleUr: "شکایت کا جواب درج ہوا",
        bodyEn: "An administrator posted a response to your complaint.",
        bodyUr: "منتظم نے آپ کی شکایت کا جواب درج کیا۔",
        href: "complaints",
      });
    }
    await audit(access.sql, context.userId, "complaint.update", "A complaint was updated.", "ایک شکایت تبدیل ہوئی۔");
    return ok({ id: data.id });
  });

export const listReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const manage = can(access.me, "reports.manage");
    const own = access.me.ownReportEnabled && access.me.staffId != null;
    if (!manage && !own) return err("FORBIDDEN");
    const rows = await access.sql`
      select id, staff_id, month, year, working_days, leaves, unapproved_absences, late_arrivals,
             fulfilled_en, fulfilled_ur, unfulfilled_en, unfulfilled_ur, improvement_en, improvement_ur,
             remarks_en, remarks_ur, evaluation_en, evaluation_ur, evaluator_name, archived,
             created_at::text as created_at, updated_at::text as updated_at
      from performance_reports
      where ${manage}::boolean or staff_id = ${access.me.staffId ?? 0}
      order by year desc, month desc, id desc
    `;
    return ok(rows);
  });

export const saveReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "reports.manage");
    if (denied) return denied;
    const staffId = Number(data.staffId);
    const period = monthYear(data.month, data.year);
    if (!Number.isInteger(staffId) || !period) return err("INVALID");
    const inserted = await access.sql<{ id: number }>`
      insert into performance_reports (
        staff_id, month, year, working_days, leaves, unapproved_absences, late_arrivals,
        fulfilled_en, fulfilled_ur, unfulfilled_en, unfulfilled_ur, improvement_en, improvement_ur,
        remarks_en, remarks_ur, evaluation_en, evaluation_ur, evaluator_name, created_by
      ) values (
        ${staffId}, ${period.month}, ${period.year}, ${optInt(data.workingDays)}, ${optInt(data.leaves)},
        ${optInt(data.unapprovedAbsences)}, ${optInt(data.lateArrivals)},
        ${clip(data.fulfilledEn, 4000)}, ${clip(data.fulfilledUr, 4000)},
        ${clip(data.unfulfilledEn, 4000)}, ${clip(data.unfulfilledUr, 4000)},
        ${clip(data.improvementEn, 4000)}, ${clip(data.improvementUr, 4000)},
        ${clip(data.remarksEn, 4000)}, ${clip(data.remarksUr, 4000)},
        ${clip(data.evaluationEn, 1000)}, ${clip(data.evaluationUr, 1000)},
        ${clip(data.evaluatorName, 160) || access.me.name}, ${context.userId}
      )
      on conflict (staff_id, month, year) do update set
        working_days = excluded.working_days,
        leaves = excluded.leaves,
        unapproved_absences = excluded.unapproved_absences,
        late_arrivals = excluded.late_arrivals,
        fulfilled_en = excluded.fulfilled_en,
        fulfilled_ur = excluded.fulfilled_ur,
        unfulfilled_en = excluded.unfulfilled_en,
        unfulfilled_ur = excluded.unfulfilled_ur,
        improvement_en = excluded.improvement_en,
        improvement_ur = excluded.improvement_ur,
        remarks_en = excluded.remarks_en,
        remarks_ur = excluded.remarks_ur,
        evaluation_en = excluded.evaluation_en,
        evaluation_ur = excluded.evaluation_ur,
        evaluator_name = excluded.evaluator_name,
        updated_at = now()
      returning id
    `;
    await notify(access.sql, await idsWith(access.sql, "reports.manage"), {
      titleEn: "Confidential report saved",
      titleUr: "خفیہ رپورٹ محفوظ ہوئی",
      bodyEn: "A monthly performance report was updated for authorized reviewers.",
      bodyUr: "ماہانہ کارکردگی کی رپورٹ مجاز جائزہ کاروں کے لیے تبدیل ہوئی۔",
      href: "reports",
    });
    await audit(access.sql, context.userId, "report.save", "A confidential monthly report was saved.", "ماہانہ خفیہ رپورٹ محفوظ ہوئی۔");
    return ok({ id: inserted[0].id });
  });

export const archiveReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; archived: boolean }) => ({
    id: Number(input?.id),
    archived: Boolean(input?.archived),
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "reports.manage");
    if (denied) return denied;
    await access.sql`update performance_reports set archived = ${data.archived}, updated_at = now() where id = ${data.id}`;
    return ok({ id: data.id });
  });

export const suggestReportTotals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { staffId: number; month: number; year: number }) => ({
    staffId: Number(input?.staffId),
    month: Number(input?.month),
    year: Number(input?.year),
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "reports.manage");
    if (denied) return denied;
    const period = monthYear(data.month, data.year);
    if (!period || !Number.isInteger(data.staffId)) return err("INVALID");
    const start = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
    const endMonth = period.month === 12 ? 1 : period.month + 1;
    const endYear = period.month === 12 ? period.year + 1 : period.year;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    const rows = await access.sql<{ status: string; n: number }>`
      select status, count(*)::int as n
      from staff_attendance
      where staff_id = ${data.staffId} and attendance_date >= ${start} and attendance_date < ${end}
      group by status
    `;
    const count = (status: string) => rows.find((row) => row.status === status)?.n ?? 0;
    return ok({
      workingDays: count("present") + count("late"),
      leaves: count("leave"),
      unapprovedAbsences: count("absent"),
      lateArrivals: count("late"),
      recorded: rows.reduce((sum, row) => sum + row.n, 0),
    });
  });

async function publishNote(sql: Sql, href: string, titleEn: string, titleUr: string) {
  await notify(sql, await idsWith(sql, "announcements.view"), {
    titleEn,
    titleUr,
    bodyEn: "A published schedule was updated.",
    bodyUr: "ایک شائع شدہ شیڈول تبدیل ہوا۔",
    href,
  });
}

export const loadTimetable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!can(access.me, "schedules.manage") && !can(access.me, "schedules.academic")) return err("FORBIDDEN");
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const rows = await access.sql<{ id: number; status: string; month: number; year: number }>`
      select id, status, month, year from timetables where month = ${period.month} and year = ${period.year}
    `;
    if (!rows[0]) return ok({ exists: false as const });
    const manage = can(access.me, "schedules.manage");
    if (!manage && rows[0].status !== "published") return ok({ exists: true as const, hidden: true as const, status: rows[0].status });
    const lectures = await access.sql`
      select lecture_number, teacher_name, start_time, end_time, book_name, class_subject, notes
      from timetable_lectures where timetable_id = ${rows[0].id} order by lecture_number
    `;
    return ok({ exists: true as const, hidden: false as const, id: rows[0].id, status: rows[0].status, month: period.month, year: period.year, lectures });
  });

export const createTimetable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const existing = await access.sql<{ id: number }>`select id from timetables where month = ${period.month} and year = ${period.year}`;
    if (existing[0]) return ok({ id: existing[0].id });
    const inserted = await access.sql<{ id: number }>`
      insert into timetables (month, year, created_by) values (${period.month}, ${period.year}, ${context.userId}) returning id
    `;
    for (let lecture = 1; lecture <= 7; lecture += 1) {
      await access.sql`
        insert into timetable_lectures (timetable_id, lecture_number) values (${inserted[0].id}, ${lecture})
      `;
    }
    await audit(access.sql, context.userId, "timetable.create", `Empty timetable created for ${period.month}/${period.year}.`, `خالی ٹائم ٹیبل بنا: ${period.month}/${period.year}`);
    return ok({ id: inserted[0].id });
  });

export const saveTimetable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; lectures: Record<string, string>[] }) => ({
    id: Number(input?.id),
    lectures: Array.isArray(input?.lectures) ? input.lectures : [],
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    for (const lecture of data.lectures) {
      const number = Number(lecture.lectureNumber);
      if (number < 1 || number > 7) continue;
      await access.sql`
        update timetable_lectures set
          teacher_name = ${clip(lecture.teacherName, 160)},
          start_time = ${clip(lecture.startTime, 8)},
          end_time = ${clip(lecture.endTime, 8)},
          book_name = ${clip(lecture.bookName, 200)},
          class_subject = ${clip(lecture.classSubject, 200)},
          notes = ${clip(lecture.notes, 1000)}
        where timetable_id = ${data.id} and lecture_number = ${number}
      `;
    }
    await access.sql`update timetables set updated_at = now() where id = ${data.id}`;
    await audit(access.sql, context.userId, "timetable.save", "Academic timetable was edited.", "تعلیمی ٹائم ٹیبل میں ترمیم ہوئی۔");
    return ok({ id: data.id });
  });

export const setTimetableStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: string }) => ({
    id: Number(input?.id),
    status: ["draft", "published", "archived"].includes(input?.status) ? input.status : "draft",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    await access.sql`update timetables set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (data.status === "published") {
      await publishNote(access.sql, "timetable", "Academic timetable published", "تعلیمی ٹائم ٹیبل شائع ہوا");
    }
    await audit(access.sql, context.userId, "timetable.status", `Timetable marked ${data.status}.`, `ٹائم ٹیبل کی حالت: ${data.status}`);
    return ok({ id: data.id });
  });

const DAY_COUNT = 7;

export const loadMenu = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!can(access.me, "schedules.manage") && !can(access.me, "schedules.food")) return err("FORBIDDEN");
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const rows = await access.sql<{
      id: number;
      status: string;
      breakfast_time: string;
      lunch_time: string;
      dinner_time: string;
    }>`
      select id, status, breakfast_time, lunch_time, dinner_time
      from food_menus where month = ${period.month} and year = ${period.year}
    `;
    if (!rows[0]) return ok({ exists: false as const });
    const manage = can(access.me, "schedules.manage");
    if (!manage && rows[0].status !== "published") return ok({ exists: true as const, hidden: true as const, status: rows[0].status });
    const days = await access.sql`
      select day_index, breakfast, lunch, dinner from food_menu_days where menu_id = ${rows[0].id} order by day_index
    `;
    return ok({ exists: true as const, hidden: false as const, ...rows[0], days });
  });

export const createMenu = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const existing = await access.sql<{ id: number }>`select id from food_menus where month = ${period.month} and year = ${period.year}`;
    if (existing[0]) return ok({ id: existing[0].id });
    const inserted = await access.sql<{ id: number }>`
      insert into food_menus (month, year, created_by) values (${period.month}, ${period.year}, ${context.userId}) returning id
    `;
    for (let day = 1; day <= DAY_COUNT; day += 1) {
      await access.sql`insert into food_menu_days (menu_id, day_index) values (${inserted[0].id}, ${day})`;
    }
    await audit(access.sql, context.userId, "menu.create", `Empty food menu created for ${period.month}/${period.year}.`, `خالی خوراک مینو بنا: ${period.month}/${period.year}`);
    return ok({ id: inserted[0].id });
  });

export const saveMenu = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const id = Number(data.id);
    await access.sql`
      update food_menus set
        breakfast_time = ${clip(data.breakfastTime, 8)},
        lunch_time = ${clip(data.lunchTime, 8)},
        dinner_time = ${clip(data.dinnerTime, 8)},
        updated_at = now()
      where id = ${id}
    `;
    const days = Array.isArray(data.days) ? data.days : [];
    for (const day of days) {
      const row = day as { dayIndex?: unknown; breakfast?: unknown; lunch?: unknown; dinner?: unknown };
      const dayIndex = Number(row.dayIndex);
      if (dayIndex < 1 || dayIndex > 7) continue;
      await access.sql`
        update food_menu_days set
          breakfast = ${clip(row.breakfast, 300)},
          lunch = ${clip(row.lunch, 300)},
          dinner = ${clip(row.dinner, 300)}
        where menu_id = ${id} and day_index = ${dayIndex}
      `;
    }
    await audit(access.sql, context.userId, "menu.save", "Food menu was edited.", "خوراک کے مینو میں ترمیم ہوئی۔");
    return ok({ id });
  });

export const setMenuStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: string }) => ({
    id: Number(input?.id),
    status: ["draft", "published", "archived"].includes(input?.status) ? input.status : "draft",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    await access.sql`update food_menus set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (data.status === "published") await publishNote(access.sql, "menu", "Food menu published", "خوراک کا مینو شائع ہوا");
    return ok({ id: data.id });
  });

export const loadCleaning = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!can(access.me, "schedules.manage") && !can(access.me, "schedules.cleaning")) return err("FORBIDDEN");
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const rows = await access.sql<{ id: number; status: string }>`
      select id, status from cleaning_schedules where month = ${period.month} and year = ${period.year}
    `;
    if (!rows[0]) return ok({ exists: false as const });
    if (!can(access.me, "schedules.manage") && rows[0].status !== "published") {
      return ok({ exists: true as const, hidden: true as const, status: rows[0].status });
    }
    const weeks = await access.sql<{ id: number; week_number: number; start_date: string; end_date: string; instructions: string }>`
      select id, week_number, start_date::text as start_date, end_date::text as end_date, instructions
      from cleaning_weeks where schedule_id = ${rows[0].id} order by week_number
    `;
    const assignees = await access.sql<{ id: number; week_id: number; sort_order: number; student_name: string }>`
      select a.id, a.week_id, a.sort_order, a.student_name
      from cleaning_assignees a
      join cleaning_weeks w on w.id = a.week_id
      where w.schedule_id = ${rows[0].id}
      order by a.sort_order, a.id
    `;
    return ok({
      exists: true as const,
      hidden: false as const,
      id: rows[0].id,
      status: rows[0].status,
      weeks: weeks.map((week) => ({ ...week, students: assignees.filter((item) => item.week_id === week.id) })),
    });
  });

export const createCleaning = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const existing = await access.sql<{ id: number }>`select id from cleaning_schedules where month = ${period.month} and year = ${period.year}`;
    if (existing[0]) return ok({ id: existing[0].id });
    const inserted = await access.sql<{ id: number }>`
      insert into cleaning_schedules (month, year, created_by) values (${period.month}, ${period.year}, ${context.userId}) returning id
    `;
    for (const week of monthWeeks(period.year, period.month)) {
      const created = await access.sql<{ id: number }>`
        insert into cleaning_weeks (schedule_id, week_number, start_date, end_date)
        values (${inserted[0].id}, ${week.week}, ${week.start}, ${week.end})
        returning id
      `;
      for (let slot = 0; slot < 3; slot += 1) {
        await access.sql`
          insert into cleaning_assignees (week_id, sort_order, student_name) values (${created[0].id}, ${slot}, '')
        `;
      }
    }
    await audit(access.sql, context.userId, "cleaning.create", "Empty cleaning schedule created.", "صفائی کا خالی شیڈول بنا۔");
    return ok({ id: inserted[0].id });
  });

export const saveCleaning = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; weeks: { id: number; instructions: string; students: string[] }[] }) => ({
    id: Number(input?.id),
    weeks: Array.isArray(input?.weeks) ? input.weeks : [],
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const owned = await access.sql<{ id: number }>`select id from cleaning_weeks where schedule_id = ${data.id}`;
    const ownedIds = new Set(owned.map((week) => week.id));
    for (const week of data.weeks) {
      if (!ownedIds.has(Number(week.id))) continue;
      await access.sql`update cleaning_weeks set instructions = ${clip(week.instructions, 1000)} where id = ${week.id}`;
      await access.sql`delete from cleaning_assignees where week_id = ${week.id}`;
      const names = Array.isArray(week.students) ? week.students : [];
      const usable = names.length ? names : [""];
      for (let index = 0; index < usable.length; index += 1) {
        await access.sql`
          insert into cleaning_assignees (week_id, sort_order, student_name)
          values (${week.id}, ${index}, ${clip(usable[index], 160)})
        `;
      }
    }
    await access.sql`update cleaning_schedules set updated_at = now() where id = ${data.id}`;
    await audit(access.sql, context.userId, "cleaning.save", "Cleaning duty schedule was edited.", "صفائی ڈیوٹی کے شیڈول میں ترمیم ہوئی۔");
    return ok({ id: data.id });
  });

export const setCleaningStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: string }) => ({
    id: Number(input?.id),
    status: ["draft", "published", "archived"].includes(input?.status) ? input.status : "draft",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    await access.sql`update cleaning_schedules set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (data.status === "published") await publishNote(access.sql, "cleaning", "Cleaning schedule published", "صفائی کا شیڈول شائع ہوا");
    return ok({ id: data.id });
  });

export const loadMeals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!can(access.me, "schedules.manage") && !can(access.me, "schedules.meals")) return err("FORBIDDEN");
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const rows = await access.sql<{ id: number; status: string }>`
      select id, status from meal_schedules where month = ${period.month} and year = ${period.year}
    `;
    if (!rows[0]) return ok({ exists: false as const });
    if (!can(access.me, "schedules.manage") && rows[0].status !== "published") {
      return ok({ exists: true as const, hidden: true as const, status: rows[0].status });
    }
    const weeks = await access.sql<{ id: number; week_number: number; start_date: string; end_date: string }>`
      select id, week_number, start_date::text as start_date, end_date::text as end_date
      from meal_weeks where schedule_id = ${rows[0].id} order by week_number
    `;
    const assignees = await access.sql<{ id: number; week_id: number; meal: string; sort_order: number; person_name: string }>`
      select a.id, a.week_id, a.meal, a.sort_order, a.person_name
      from meal_assignees a
      join meal_weeks w on w.id = a.week_id
      where w.schedule_id = ${rows[0].id}
      order by a.sort_order, a.id
    `;
    return ok({
      exists: true as const,
      hidden: false as const,
      id: rows[0].id,
      status: rows[0].status,
      weeks: weeks.map((week) => ({
        ...week,
        breakfast: assignees.filter((item) => item.week_id === week.id && item.meal === "breakfast"),
        lunch: assignees.filter((item) => item.week_id === week.id && item.meal === "lunch"),
        dinner: assignees.filter((item) => item.week_id === week.id && item.meal === "dinner"),
      })),
    });
  });

export const createMeals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { month: number; year: number }) => ({ month: Number(input?.month), year: Number(input?.year) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const period = monthYear(data.month, data.year);
    if (!period) return err("INVALID");
    const existing = await access.sql<{ id: number }>`select id from meal_schedules where month = ${period.month} and year = ${period.year}`;
    if (existing[0]) return ok({ id: existing[0].id });
    const inserted = await access.sql<{ id: number }>`
      insert into meal_schedules (month, year, created_by) values (${period.month}, ${period.year}, ${context.userId}) returning id
    `;
    for (const week of monthWeeks(period.year, period.month)) {
      const created = await access.sql<{ id: number }>`
        insert into meal_weeks (schedule_id, week_number, start_date, end_date)
        values (${inserted[0].id}, ${week.week}, ${week.start}, ${week.end}) returning id
      `;
      for (const meal of ["breakfast", "lunch", "dinner"]) {
        await access.sql`
          insert into meal_assignees (week_id, meal, sort_order, person_name) values (${created[0].id}, ${meal}, 0, '')
        `;
      }
    }
    await audit(access.sql, context.userId, "meals.create", "Empty meal-serving schedule created.", "کھانا پیش کرنے کا خالی شیڈول بنا۔");
    return ok({ id: inserted[0].id });
  });

export const saveMeals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; weeks: { id: number; breakfast: string[]; lunch: string[]; dinner: string[] }[] }) => ({
    id: Number(input?.id),
    weeks: Array.isArray(input?.weeks) ? input.weeks : [],
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    const owned = await access.sql<{ id: number }>`select id from meal_weeks where schedule_id = ${data.id}`;
    const ownedIds = new Set(owned.map((week) => week.id));
    for (const week of data.weeks) {
      const weekId = Number(week.id);
      if (!ownedIds.has(weekId)) continue;
      await access.sql`delete from meal_assignees where week_id = ${weekId}`;
      const groups: [string, string[]][] = [
        ["breakfast", week.breakfast ?? []],
        ["lunch", week.lunch ?? []],
        ["dinner", week.dinner ?? []],
      ];
      for (const [meal, names] of groups) {
        const usable = names.length ? names : [""];
        for (let index = 0; index < usable.length; index += 1) {
          await access.sql`
            insert into meal_assignees (week_id, meal, sort_order, person_name)
            values (${weekId}, ${meal}, ${index}, ${clip(usable[index], 160)})
          `;
        }
      }
    }
    await access.sql`update meal_schedules set updated_at = now() where id = ${data.id}`;
    await audit(access.sql, context.userId, "meals.save", "Meal-serving schedule was edited.", "کھانا پیش کرنے کے شیڈول میں ترمیم ہوئی۔");
    return ok({ id: data.id });
  });

export const setMealsStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: string }) => ({
    id: Number(input?.id),
    status: ["draft", "published", "archived"].includes(input?.status) ? input.status : "draft",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "schedules.manage");
    if (denied) return denied;
    await access.sql`update meal_schedules set status = ${data.status}, updated_at = now() where id = ${data.id}`;
    if (data.status === "published") await publishNote(access.sql, "meals", "Meal-serving schedule published", "کھانا پیش کرنے کا شیڈول شائع ہوا");
    return ok({ id: data.id });
  });

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const manage = can(access.me, "announcements.manage");
    if (!manage && !can(access.me, "announcements.view")) return err("FORBIDDEN");
    const rows = await access.sql`
      select id, title_en, title_ur, body_en, body_ur, published, created_at::text as created_at
      from announcements
      where ${manage}::boolean or published = true
      order by created_at desc
    `;
    return ok(rows);
  });

export const saveAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "announcements.manage");
    if (denied) return denied;
    const titleEn = clip(data.titleEn, 200);
    if (!titleEn) return err("INVALID");
    const published = Boolean(data.published);
    const id = Number(data.id);
    let saved = id;
    if (Number.isInteger(id) && id > 0) {
      await access.sql`
        update announcements set
          title_en = ${titleEn}, title_ur = ${clip(data.titleUr, 200)},
          body_en = ${clip(data.bodyEn, 8000)}, body_ur = ${clip(data.bodyUr, 8000)},
          published = ${published}, updated_at = now()
        where id = ${id}
      `;
    } else {
      const inserted = await access.sql<{ id: number }>`
        insert into announcements (title_en, title_ur, body_en, body_ur, published, created_by)
        values (${titleEn}, ${clip(data.titleUr, 200)}, ${clip(data.bodyEn, 8000)}, ${clip(data.bodyUr, 8000)}, ${published}, ${context.userId})
        returning id
      `;
      saved = inserted[0].id;
    }
    if (published) {
      await notify(access.sql, await idsWith(access.sql, "announcements.view"), {
        titleEn: "New announcement",
        titleUr: "نیا اعلان",
        bodyEn: titleEn,
        bodyUr: clip(data.titleUr, 200) || titleEn,
        href: "announcements",
      });
    }
    await audit(access.sql, context.userId, "announcement.save", "An announcement was saved.", "ایک اعلان محفوظ ہوا۔");
    return ok({ id: saved });
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "announcements.manage");
    if (denied) return denied;
    await access.sql`delete from announcements where id = ${data.id}`;
    return ok({ id: data.id });
  });

export const listRecords = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!canAny(access.me, ["records.view", "records.manage"])) return err("FORBIDDEN");
    const rows = await access.sql`
      select id, title_en, title_ur, body_en, body_ur, category_en, category_ur, updated_at::text as updated_at
      from institutional_records order by updated_at desc
    `;
    return ok(rows);
  });

export const saveRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "records.manage");
    if (denied) return denied;
    const titleEn = clip(data.titleEn, 200);
    if (!titleEn) return err("INVALID");
    const id = Number(data.id);
    if (Number.isInteger(id) && id > 0) {
      await access.sql`
        update institutional_records set
          title_en = ${titleEn}, title_ur = ${clip(data.titleUr, 200)},
          body_en = ${clip(data.bodyEn, 8000)}, body_ur = ${clip(data.bodyUr, 8000)},
          category_en = ${clip(data.categoryEn, 120)}, category_ur = ${clip(data.categoryUr, 120)},
          updated_at = now()
        where id = ${id}
      `;
      return ok({ id });
    }
    const inserted = await access.sql<{ id: number }>`
      insert into institutional_records (title_en, title_ur, body_en, body_ur, category_en, category_ur, created_by)
      values (
        ${titleEn}, ${clip(data.titleUr, 200)}, ${clip(data.bodyEn, 8000)}, ${clip(data.bodyUr, 8000)},
        ${clip(data.categoryEn, 120)}, ${clip(data.categoryUr, 120)}, ${context.userId}
      ) returning id
    `;
    await audit(access.sql, context.userId, "record.save", "An institutional record was saved.", "ایک ادارہ جاتی ریکارڈ محفوظ ہوا۔");
    return ok({ id: inserted[0].id });
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = need(access.me, "records.manage");
    if (denied) return denied;
    await access.sql`delete from institutional_records where id = ${data.id}`;
    await audit(access.sql, context.userId, "record.delete", "An institutional record was deleted.", "ایک ادارہ جاتی ریکارڈ حذف ہوا۔");
    return ok({ id: data.id });
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const rows = await access.sql`
      select name_en, name_ur, complaints_enabled, anonymous_complaints, staff_can_view_own_report
      from settings where id = 1
    `;
    return ok(rows[0]);
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const nameEn = clip(data.nameEn, 160) || "Institution";
    await access.sql`
      update settings set
        name_en = ${nameEn},
        name_ur = ${clip(data.nameUr, 160) || "ادارہ"},
        complaints_enabled = ${Boolean(data.complaintsEnabled)},
        anonymous_complaints = ${Boolean(data.anonymousComplaints)},
        staff_can_view_own_report = ${Boolean(data.staffCanViewOwnReport)},
        updated_at = now()
      where id = 1
    `;
    await audit(access.sql, context.userId, "settings.save", "Institution settings were updated.", "ادارے کی ترتیبات تبدیل ہوئیں۔");
    return ok({ saved: true });
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const users = await access.sql`
      select m.user_id, m.role, m.status, m.language, m.username, m.staff_id, u.name, u.email, u."createdAt"::text as created_at
      from members m
      join "user" u on u.id = m.user_id
      order by u.name
    `;
    const perms = await access.sql<{ user_id: string; permission: string }>`select user_id, permission from member_permissions`;
    const resets = await access.sql`
      select id, email, user_id, status, created_at::text as created_at
      from password_requests
      where status = 'open'
      order by created_at desc
    `;
    return ok({
      users: (users as { user_id: string }[]).map((user) => ({
        ...user,
        permissions: perms.filter((item) => item.user_id === user.user_id).map((item) => item.permission),
      })),
      resets,
    });
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const name = clip(data.name, 120);
    const email = clip(data.email, 200).toLowerCase();
    const password = String(data.password ?? "");
    const username = clip(data.username, 60).toLowerCase();
    const role: Role = data.role === "super_admin" ? "super_admin" : "staff";
    const language: Lang = data.language === "ur" ? "ur" : "en";
    const staffId = Number(data.staffId);
    const permissions = Array.isArray(data.permissions) ? data.permissions.map(String).filter(isGrantable) : [];
    if (!name || !email.includes("@") || password.length < 8) return err("INVALID");
    if (username && !/^[a-z0-9._-]{3,60}$/.test(username)) return err("USERNAME");
    const { hashPassword } = await import("better-auth/crypto");
    const hash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    try {
      await access.sql`
        insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
        values (${userId}, ${name}, ${email}, true, now(), now())
      `;
      await access.sql`
        insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        values (${accountId}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())
      `;
      await access.sql`
        insert into members (user_id, role, status, language, username, staff_id)
        values (${userId}, ${role}, 'active', ${language}, ${username || null}, ${Number.isInteger(staffId) && staffId > 0 ? staffId : null})
      `;
    } catch {
      await access.sql`delete from "user" where id = ${userId}`;
      return err("EMAIL_IN_USE");
    }
    if (role === "staff") await replacePermissions(access.sql, userId, permissions as Permission[]);
    if (Number.isInteger(staffId) && staffId > 0) {
      await access.sql`update members set staff_id = null where staff_id = ${staffId} and user_id <> ${userId}`;
      await access.sql`update staff_profiles set user_id = null where user_id = ${userId} and id <> ${staffId}`;
      await access.sql`update staff_profiles set user_id = ${userId} where id = ${staffId}`;
    }
    await audit(access.sql, context.userId, "user.create", `Account created for ${name}.`, `${name} کا اکاؤنٹ بنایا گیا۔`);
    return ok({ userId });
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const userId = clip(data.userId, 80);
    if (!userId) return err("INVALID");
    if (userId === context.userId && data.status === "disabled") return err("SELF_DISABLE");
    const role: Role = data.role === "super_admin" ? "super_admin" : "staff";
    const status = ["active", "pending", "disabled"].includes(String(data.status)) ? String(data.status) : "active";
    const language: Lang = data.language === "ur" ? "ur" : "en";
    const username = clip(data.username, 60).toLowerCase();
    const staffId = Number(data.staffId);
    const linked = Number.isInteger(staffId) && staffId > 0 ? staffId : null;
    try {
      await access.sql`
        update members set
          role = ${role},
          status = ${status},
          language = ${language},
          username = ${username || null},
          staff_id = ${linked},
          updated_at = now()
        where user_id = ${userId}
      `;
    } catch {
      return err("USERNAME_TAKEN");
    }
    if (role === "super_admin") {
      await access.sql`delete from member_permissions where user_id = ${userId}`;
    } else if (Array.isArray(data.permissions)) {
      await replacePermissions(access.sql, userId, data.permissions.map(String));
    }
    await access.sql`update staff_profiles set user_id = null where user_id = ${userId}`;
    if (linked) {
      await access.sql`update members set staff_id = null where staff_id = ${linked} and user_id <> ${userId}`;
      await access.sql`update staff_profiles set user_id = ${userId} where id = ${linked}`;
    }
    if (status === "disabled") {
      await access.sql`delete from session where "userId" = ${userId}`;
    }
    if (clip(data.name, 120)) {
      await access.sql`update "user" set name = ${clip(data.name, 120)}, "updatedAt" = now() where id = ${userId}`;
    }
    await audit(access.sql, context.userId, "user.update", "A user account was updated.", "ایک صارف کا اکاؤنٹ تبدیل ہوا۔");
    return ok({ userId });
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; password: string; requestId?: number }) => ({
    userId: clip(input?.userId, 80),
    password: String(input?.password ?? ""),
    requestId: Number(input?.requestId ?? 0),
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    if (data.password.length < 8) return err("INVALID");
    const { hashPassword } = await import("better-auth/crypto");
    const hash = await hashPassword(data.password);
    const updated = await access.sql`
      update account set password = ${hash}, "updatedAt" = now()
      where "userId" = ${data.userId} and "providerId" = 'credential'
      returning id
    `;
    if (!updated.length) {
      await access.sql`
        insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        values (${crypto.randomUUID()}, ${data.userId}, 'credential', ${data.userId}, ${hash}, now(), now())
      `;
    }
    await access.sql`delete from session where "userId" = ${data.userId}`;
    if (data.requestId > 0) {
      await access.sql`
        update password_requests set status = 'resolved', resolved_by = ${context.userId}, resolved_at = now()
        where id = ${data.requestId}
      `;
    }
    await audit(access.sql, context.userId, "user.password", "An account password was reset by the administrator.", "منتظم نے اکاؤنٹ کا پاس ورڈ تبدیل کیا۔");
    return ok({ userId: data.userId });
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await readMe(sql, context.userId);
    if (!me || me.status === "disabled") return err("FORBIDDEN");
    const rows = await sql`
      select id, title_en, title_ur, body_en, body_ur, href, read_at::text as read_at, created_at::text as created_at
      from notifications
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
    return ok(rows);
  });

export const markNotifications = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: number; all?: boolean }) => ({
    id: Number(input?.id ?? 0),
    all: Boolean(input?.all),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.all) {
      await sql`update notifications set read_at = now() where user_id = ${context.userId} and read_at is null`;
    } else if (data.id > 0) {
      await sql`update notifications set read_at = now() where id = ${data.id} and user_id = ${context.userId}`;
    }
    return ok({ marked: true });
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const denied = superOnly(access.me);
    if (denied) return denied;
    const rows = await access.sql`
      select a.id, a.action, a.summary_en, a.summary_ur, a.created_at::text as created_at, u.name as actor_name
      from audit_logs a
      left join "user" u on u.id = a.actor_id
      order by a.id desc
      limit 150
    `;
    return ok(rows);
  });

export const dashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    const me = access.me;
    const sql = access.sql;
    const pendingLeaves = canAny(me, ["leave.class_review", "leave.final", "leave.receive"])
      ? (await sql<{ n: number }>`select count(*)::int as n from leave_requests where stage in ('class_review', 'awaiting_final')`)[0]?.n ?? 0
      : 0;
    const newComplaints = can(me, "complaints.manage")
      ? (await sql<{ n: number }>`select count(*)::int as n from complaints where status in ('submitted', 'pending_review')`)[0]?.n ?? 0
      : me.assignedComplaints;
    const openResets = me.role === "super_admin"
      ? (await sql<{ n: number }>`select count(*)::int as n from password_requests where status = 'open'`)[0]?.n ?? 0
      : 0;
    const activity = me.role === "super_admin"
      ? await sql`select id, summary_en, summary_ur, created_at::text as created_at from audit_logs order by id desc limit 8`
      : [];
    const announcements = can(me, "announcements.view")
      ? await sql`
          select id, title_en, title_ur, body_en, body_ur, created_at::text as created_at
          from announcements where published = true order by created_at desc limit 4
        `
      : [];
    return ok({
      pendingLeaves,
      newComplaints,
      openResets,
      activity,
      announcements,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    });
  });

export const translateDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { text: string; target: string }) => ({
    text: clip(input?.text, 2000),
    target: input?.target === "ur" ? "ur" : "en",
  }))
  .handler(async ({ context, data }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (access.me.role !== "super_admin") return err("FORBIDDEN");
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return err("AI_UNAVAILABLE");
    if (!data.text) return ok({ text: "" });
    const targetName = data.target === "ur" ? "Urdu" : "English";
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 500,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `Translate the institutional text into ${targetName}. Return only the translation.`,
          },
          { role: "user", content: data.text },
        ],
      }),
    });
    if (!res.ok) return err("AI_FAILED");
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return ok({ text: body.choices?.[0]?.message?.content?.trim() ?? "" });
  });

export const scheduleIndex = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await gate(context.userId);
    if ("error" in access) return access;
    if (!can(access.me, "schedules.manage")) return ok([]);
    const rows = await access.sql`
      select kind, month, year, status, updated_at from (
        select 'timetable' as kind, month, year, status, updated_at::text as updated_at from timetables
        union all
        select 'menu', month, year, status, updated_at::text from food_menus
        union all
        select 'cleaning', month, year, status, updated_at::text from cleaning_schedules
        union all
        select 'meals', month, year, status, updated_at::text from meal_schedules
      ) items
      order by updated_at desc
      limit 8
    `;
    return ok(rows);
  });
