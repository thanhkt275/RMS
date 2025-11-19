const TOURNAMENT_STAGE_STATUSES = ["PENDING", "ACTIVE", "COMPLETED"] as const;
const TOURNAMENT_STAGE_TYPES = [
  "FIRST_ROUND",
  "SEMI_FINAL_ROUND_ROBIN",
  "FINAL_DOUBLE_ELIMINATION",
] as const;

const MATCH_STATUSES = [
  "SCHEDULED",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
] as const;

export type TournamentStageStatus = (typeof TOURNAMENT_STAGE_STATUSES)[number];
export type TournamentStageType = (typeof TOURNAMENT_STAGE_TYPES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "muted";

const STAGE_STATUS_META: Record<
  TournamentStageStatus,
  { label: string; badgeVariant: BadgeVariant; description: string }
> = {
  PENDING: {
    label: "Pending",
    badgeVariant: "outline",
    description: "Stage has been defined but matches are not active yet.",
  },
  ACTIVE: {
    label: "Active",
    badgeVariant: "success",
    description: "Matches are underway and results may impact progression.",
  },
  COMPLETED: {
    label: "Completed",
    badgeVariant: "muted",
    description: "All matches are finished and the stage is locked.",
  },
};

const STAGE_TYPE_META: Record<
  TournamentStageType,
  { label: string; description: string; matchHint: string }
> = {
  FIRST_ROUND: {
    label: "First Round",
    description:
      "Swiss-style opening phase where every team plays multiple matches.",
    matchHint: "Each team is scheduled for up to 4 matches.",
  },
  SEMI_FINAL_ROUND_ROBIN: {
    label: "Semi-final Round Robin",
    description: "Short round-robin phase used to identify the top performers.",
    matchHint: "Each team meets up to 3 opponents once.",
  },
  FINAL_DOUBLE_ELIMINATION: {
    label: "Final - Double Elimination",
    description:
      "Bracket with winners and losers paths that crowns the champion.",
    matchHint: "Automatically builds a double-elimination bracket.",
  },
};

const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED: "Scheduled",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

export function getStageStatusMeta(status?: string | null) {
  if (!status) {
    return {
      label: "Unknown",
      badgeVariant: "outline" as BadgeVariant,
      description: "Stage status not available",
    };
  }
  const normalized = status.toUpperCase() as TournamentStageStatus;
  return (
    STAGE_STATUS_META[normalized] ?? {
      label: normalized,
      badgeVariant: "outline" as BadgeVariant,
      description: "Status not recognized",
    }
  );
}

export function getStageTypeMeta(type?: string | null) {
  if (!type) {
    return {
      label: "Unspecified",
      description: "Stage type not provided",
      matchHint: "",
    };
  }
  const normalized = type.toUpperCase() as TournamentStageType;
  return (
    STAGE_TYPE_META[normalized] ?? {
      label: normalized,
      description: "Type not recognized",
      matchHint: "",
    }
  );
}

export function getMatchStatusLabel(status?: string | null) {
  if (!status) {
    return "Unknown";
  }
  const normalized = status.toUpperCase() as MatchStatus;
  return MATCH_STATUS_LABELS[normalized] ?? normalized;
}

export { MATCH_STATUSES, TOURNAMENT_STAGE_STATUSES, TOURNAMENT_STAGE_TYPES };
