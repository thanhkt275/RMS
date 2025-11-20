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
  requireSession?: boolean;
  requireRegisteredUser?: boolean;
  requireAnonymousUser?: boolean;
};

export type AccessControlUser = {
  id?: string;
  role?: string | null;
  type?: string | null;
  isAnonymous?: boolean | null;
};

export const ACCESS_RULES = {
  public: {},
  sessionOnly: {
    requireSession: true,
  },
  anonymousOnly: {
    requireAnonymousUser: true,
  },
  registeredOnly: {
    requireRegisteredUser: true,
  },
  adminOnly: {
    requireRegisteredUser: true,
    roles: ["ADMIN"] as const,
  },
  orgStaffOnly: {
    requireRegisteredUser: true,
    roles: ORG_ROLES,
  },
} as const satisfies Record<string, AccessRule>;

export function isAnonymousUser(user?: AccessControlUser | null) {
  return Boolean(user?.isAnonymous);
}

export function isRegisteredUser(user?: AccessControlUser | null) {
  return Boolean(user && !isAnonymousUser(user));
}

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
  if (rule.requireAnonymousUser) {
    return isAnonymousUser(user);
  }
  if (rule.requireRegisteredUser) {
    if (!isRegisteredUser(user)) {
      return false;
    }
  } else if (rule.requireSession && !user) {
    return false;
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
