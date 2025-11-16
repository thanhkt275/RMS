const TOURNAMENT_STATUSES = ["UPCOMING", "ONGOING", "COMPLETED"] as const;

const TOURNAMENT_RESOURCE_TYPES = [
  "DOCUMENT",
  "LAW",
  "MANUAL",
  "TUTORIAL",
  "OTHER",
] as const;

const TOURNAMENT_FIELD_ROLES = [
  "TSO",
  "HEAD_REFEREE",
  "SCORE_KEEPER",
  "QUEUER",
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type TournamentResourceType = (typeof TOURNAMENT_RESOURCE_TYPES)[number];
export type TournamentFieldRoleKey = (typeof TOURNAMENT_FIELD_ROLES)[number];

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "muted";

export const TOURNAMENT_STATUS_META: Record<
  TournamentStatus,
  {
    label: string;
    description: string;
    badgeVariant: BadgeVariant;
  }
> = {
  UPCOMING: {
    label: "Upcoming",
    description: "Registration is open and the event has not started yet.",
    badgeVariant: "warning",
  },
  ONGOING: {
    label: "In Progress",
    description: "Matches are currently being played.",
    badgeVariant: "success",
  },
  COMPLETED: {
    label: "Completed",
    description: "The tournament has wrapped up.",
    badgeVariant: "muted",
  },
};

export const TOURNAMENT_RESOURCE_LABELS: Record<
  TournamentResourceType,
  string
> = {
  DOCUMENT: "Document",
  LAW: "Rules & Law",
  MANUAL: "Game manual",
  TUTORIAL: "Tutorial",
  OTHER: "Other",
};

export function getTournamentStatusMeta(status?: string | null) {
  if (!status) {
    return {
      label: "Unknown",
      description: "Status not provided",
      badgeVariant: "outline" as const,
    };
  }
  const normalized = status.toUpperCase() as TournamentStatus;
  return (
    TOURNAMENT_STATUS_META[normalized] ?? {
      label: normalized,
      description: "Status not recognized",
      badgeVariant: "outline" as const,
    }
  );
}

export function getResourceLabel(type?: string | null) {
  if (!type) {
    return TOURNAMENT_RESOURCE_LABELS.DOCUMENT;
  }
  const normalized = type.toUpperCase() as TournamentResourceType;
  return (
    TOURNAMENT_RESOURCE_LABELS[normalized] ??
    TOURNAMENT_RESOURCE_LABELS.DOCUMENT
  );
}

export const TOURNAMENT_FIELD_ROLE_LABELS: Record<
  TournamentFieldRoleKey,
  string
> = {
  TSO: "TSO",
  HEAD_REFEREE: "Head Referee",
  SCORE_KEEPER: "Scorekeeper",
  QUEUER: "Queuer",
};

export {
  TOURNAMENT_FIELD_ROLES,
  TOURNAMENT_RESOURCE_TYPES,
  TOURNAMENT_STATUSES,
};
