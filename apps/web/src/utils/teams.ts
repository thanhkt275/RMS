const TEAM_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
const TEAM_ROLES = ["TEAM_MENTOR", "TEAM_LEADER", "TEAM_MEMBER"] as const;
const TEAM_CREATOR_ROLES = ["COMMON", "TEAM_MENTOR"] as const;
const TEAM_INVITE_TARGET_ROLES = ["TEAM_LEADER", "TEAM_MEMBER"] as const;
export const MIN_TEAM_CREATION_AGE = 18;

export type TeamStatus = (typeof TEAM_STATUSES)[number];
export type TeamRole = (typeof TEAM_ROLES)[number];
export type TeamInviteRole = (typeof TEAM_INVITE_TARGET_ROLES)[number];

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "muted";

export const TEAM_STATUS_META: Record<
  TeamStatus,
  {
    label: string;
    description: string;
    badgeVariant: BadgeVariant;
  }
> = {
  DRAFT: {
    label: "Draft",
    description: "Team is being set up and not yet public",
    badgeVariant: "warning",
  },
  ACTIVE: {
    label: "Active",
    description: "Team is actively competing and accepting members",
    badgeVariant: "success",
  },
  ARCHIVED: {
    label: "Archived",
    description: "Team is no longer active",
    badgeVariant: "muted",
  },
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  TEAM_MENTOR: "Mentor",
  TEAM_LEADER: "Leader",
  TEAM_MEMBER: "Member",
};

export const TEAM_ROLE_BADGE_VARIANT: Record<TeamRole, BadgeVariant> = {
  TEAM_MENTOR: "success",
  TEAM_LEADER: "secondary",
  TEAM_MEMBER: "muted",
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  TEAM_MENTOR: "Can manage team settings, invite members, and edit all details",
  TEAM_LEADER:
    "Can help coordinate activities but cannot change critical settings",
  TEAM_MEMBER: "Standard team member with basic access",
};

function parseDateInput(value?: Date | string | number | null) {
  if (!value) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateAge(date: Date) {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export function canCreateTeam(user?: {
  role?: string | null;
  dateOfBirth?: Date | string | number | null;
}) {
  if (
    !(
      user?.role &&
      TEAM_CREATOR_ROLES.includes(
        user.role as (typeof TEAM_CREATOR_ROLES)[number]
      )
    )
  ) {
    return false;
  }
  const dob = parseDateInput(user.dateOfBirth);
  if (!dob) {
    return false;
  }
  return calculateAge(dob) >= MIN_TEAM_CREATION_AGE;
}

export function formatStatus(status: string) {
  const normalized = status.toUpperCase() as TeamStatus;
  const meta = TEAM_STATUS_META[normalized];
  if (meta) {
    return meta;
  }
  return { label: status, badgeVariant: "muted" as const };
}

export function formatRole(role?: string | null) {
  if (!role) {
    return null;
  }
  const normalized = role.toUpperCase() as TeamRole;
  if (!TEAM_ROLE_LABELS[normalized]) {
    return null;
  }
  return {
    label: TEAM_ROLE_LABELS[normalized],
    description: TEAM_ROLE_DESCRIPTIONS[normalized],
    badgeVariant: TEAM_ROLE_BADGE_VARIANT[normalized],
  };
}

export function getAllowedTeamStatuses() {
  return [...TEAM_STATUSES];
}

export function getInviteRoles() {
  return [...TEAM_INVITE_TARGET_ROLES];
}
