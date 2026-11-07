/** Permissions a super administrator may grant. Account, settings, routing, and audit stay role-locked. */
export const GRANTABLE_PERMISSIONS = [
  "directory.view",
  "students.view",
  "students.manage",
  "attendance.students",
  "attendance.staff",
  "attendance.own",
  "leave.view",
  "leave.submit",
  "leave.class_review",
  "leave.final",
  "leave.receive",
  "leave.absence",
  "complaints.submit",
  "complaints.manage",
  "reports.manage",
  "schedules.academic",
  "schedules.food",
  "schedules.cleaning",
  "schedules.meals",
  "schedules.manage",
  "records.view",
  "records.manage",
  "announcements.view",
  "announcements.manage",
] as const;

export type Permission = (typeof GRANTABLE_PERMISSIONS)[number];

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  "schedules.academic",
  "schedules.food",
  "schedules.cleaning",
  "schedules.meals",
  "announcements.view",
  "attendance.own",
  "complaints.submit",
];

export function isGrantable(value: string): value is Permission {
  return (GRANTABLE_PERMISSIONS as readonly string[]).includes(value);
}

export type Role = "super_admin" | "staff";
export type MemberStatus = "active" | "pending" | "disabled";
export type Lang = "en" | "ur";

export type Me = {
  userId: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  status: MemberStatus;
  language: Lang;
  permissions: string[];
  staffId: number | null;
  staffNameEn: string | null;
  staffNameUr: string | null;
  complaintsEnabled: boolean;
  anonymousComplaints: boolean;
  ownReportEnabled: boolean;
  institutionEn: string;
  institutionUr: string;
  assignedComplaints: number;
};

export function can(me: Pick<Me, "role" | "status" | "permissions">, permission: string): boolean {
  if (me.status !== "active") return false;
  if (me.role === "super_admin") return true;
  return me.permissions.includes(permission);
}

export function canAny(me: Pick<Me, "role" | "status" | "permissions">, permissions: string[]): boolean {
  return permissions.some((permission) => can(me, permission));
}
