const REGULAR_ROLES = [
  "COMMON",
  "TEAM_MENTOR",
  "TEAM_LEADER",
  "TEAM_MEMBER",
] as const;

const ORG_ROLES = [
  "ADMIN",
  "TSO",
  "HEAD_REFEREE",
  "SCORE_KEEPER",
  "QUEUER",
] as const;

const APP_ROLES = [...REGULAR_ROLES, ...ORG_ROLES] as const;
const VALID_ROLE_SET = new Set<string>(APP_ROLES);
const VALID_TYPE_SET = new Set<string>(["REGULAR", "ORG"]);

export type AppRole = (typeof APP_ROLES)[number];
export type UserType = "REGULAR" | "ORG";

export type AccessRule = {
  roles?: readonly AppRole[];
  userTypes?: readonly UserType[];
};

export type AccessControlUser = {
  role?: string | null;
  type?: string | null;
};

export const ACCESS_RULES = {
  adminOnly: {
    roles: ["ADMIN"] as const,
  },
  orgStaffOnly: {
    roles: ORG_ROLES,
  },
} as const satisfies Record<string, AccessRule>;

function normalizeRole(role?: string | null): AppRole | null {
  if (!role) {
    return null;
  }
  const normalized = role.toUpperCase();
  return VALID_ROLE_SET.has(normalized) ? (normalized as AppRole) : null;
}

function normalizeType(type?: string | null): UserType | null {
  if (!type) {
    return null;
  }
  const normalized = type.toUpperCase();
  return VALID_TYPE_SET.has(normalized) ? (normalized as UserType) : null;
}

export function meetsAccessRule(
  user: AccessControlUser | undefined,
  rule?: AccessRule
) {
  if (!rule) {
    return true;
  }
  const meetsRole =
    !rule.roles?.length ||
    (() => {
      const normalizedRole = normalizeRole(user?.role);
      return normalizedRole
        ? (rule.roles as readonly AppRole[]).includes(normalizedRole)
        : false;
    })();

  const meetsType =
    !rule.userTypes?.length ||
    (() => {
      const normalizedType = normalizeType(user?.type);
      return normalizedType
        ? (rule.userTypes as readonly UserType[]).includes(normalizedType)
        : false;
    })();

  return meetsRole && meetsType;
}

export function isAdminUser(user?: AccessControlUser | null) {
  return meetsAccessRule(user ?? undefined, ACCESS_RULES.adminOnly);
}
