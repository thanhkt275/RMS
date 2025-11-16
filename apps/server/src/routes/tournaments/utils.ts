// Tournament-specific helper utilities
import { db } from "@rms-modern/db";
import {
  organizations,
  tournamentMatches,
  tournamentStageRankings,
  tournamentStageTeams,
  tournaments,
  tournamentFieldAssignments,
  tournamentFieldRoles,
} from "@rms-modern/db/schema/organization";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type {
  StageMatchRow,
  StageRankingRow,
  StageTeamRow,
  FieldAssignmentRow,
  FieldRoleField,
  FieldRoleUser,
  FieldRoleAssignmentResponse,
  TournamentStatus,
  ScoreData,
  StageResponseMatch,
  MatchMetadata,
  MatchMetadataSource,
  StageConfiguration,
  StageMatchDependency,
} from "./types";
import { auth } from "@rms-modern/auth";
import { user } from "@rms-modern/db/schema/auth";
import type { TournamentFieldRole } from "@rms-modern/db/schema/organization";
import type {
  MatchScheduleMetadata,
  ScheduledSlot,
} from "../../utils/match-scheduler";

export const stageHomeTeamAlias = alias(organizations, "stage_home_team");
export const stageAwayTeamAlias = alias(organizations, "stage_away_team");

export async function fetchStageTeamsMap(stageIds: string[]) {
  if (!stageIds.length) {
    return new Map<string, StageTeamRow[]>();
  }

  const rows = await db
    .select({
      stageId: tournamentStageTeams.stageId,
      organizationId: tournamentStageTeams.organizationId,
      seed: tournamentStageTeams.seed,
      createdAt: tournamentStageTeams.createdAt,
      teamName: organizations.name,
      teamSlug: organizations.slug,
      teamLogo: organizations.logo,
      teamLocation: organizations.location,
    })
    .from(tournamentStageTeams)
    .leftJoin(
      organizations,
      eq(tournamentStageTeams.organizationId, organizations.id)
    )
    .where(inArray(tournamentStageTeams.stageId, stageIds))
    .orderBy(
      asc(tournamentStageTeams.seed),
      asc(tournamentStageTeams.createdAt),
      asc(organizations.name)
    );

  const map = new Map<string, StageTeamRow[]>();
  for (const row of rows) {
    if (!map.has(row.stageId)) {
      map.set(row.stageId, []);
    }
    map.get(row.stageId)?.push(row);
  }
  return map;
}

export async function fetchStageMatchesMap(stageIds: string[]) {
  if (!stageIds.length) {
    return new Map<string, StageMatchRow[]>();
  }

  const rows = await db
    .select({
      stageId: tournamentMatches.stageId,
      id: tournamentMatches.id,
      round: tournamentMatches.round,
      status: tournamentMatches.status,
      scheduledAt: tournamentMatches.scheduledAt,
      homeTeamId: tournamentMatches.homeTeamId,
      awayTeamId: tournamentMatches.awayTeamId,
      homePlaceholder: tournamentMatches.homePlaceholder,
      awayPlaceholder: tournamentMatches.awayPlaceholder,
      homeScore: tournamentMatches.homeScore,
      awayScore: tournamentMatches.awayScore,
      metadata: tournamentMatches.metadata,
      homeTeamName: stageHomeTeamAlias.name,
      homeTeamSlug: stageHomeTeamAlias.slug,
      homeTeamLogo: stageHomeTeamAlias.logo,
      awayTeamName: stageAwayTeamAlias.name,
      awayTeamSlug: stageAwayTeamAlias.slug,
      awayTeamLogo: stageAwayTeamAlias.logo,
    })
    .from(tournamentMatches)
    .leftJoin(
      stageHomeTeamAlias,
      eq(tournamentMatches.homeTeamId, stageHomeTeamAlias.id)
    )
    .leftJoin(
      stageAwayTeamAlias,
      eq(tournamentMatches.awayTeamId, stageAwayTeamAlias.id)
    )
    .where(inArray(tournamentMatches.stageId, stageIds))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.createdAt));

  const map = new Map<string, StageMatchRow[]>();
  for (const row of rows) {
    if (!row.stageId) {
      continue;
    }
    if (!map.has(row.stageId)) {
      map.set(row.stageId, []);
    }
    map.get(row.stageId)?.push(row);
  }
  return map;
}

export async function fetchStageRankingsMap(stageIds: string[]) {
  if (!stageIds.length) {
    return new Map<string, StageRankingRow[]>();
  }

  const rows = await db
    .select({
      stageId: tournamentStageRankings.stageId,
      organizationId: tournamentStageRankings.organizationId,
      rank: tournamentStageRankings.rank,
      gamesPlayed: tournamentStageRankings.gamesPlayed,
      wins: tournamentStageRankings.wins,
      losses: tournamentStageRankings.losses,
      ties: tournamentStageRankings.ties,
      rankingPoints: tournamentStageRankings.rankingPoints,
      autonomousPoints: tournamentStageRankings.autonomousPoints,
      strengthPoints: tournamentStageRankings.strengthPoints,
      totalScore: tournamentStageRankings.totalScore,
      scoreData: tournamentStageRankings.scoreData,
      loseRate: tournamentStageRankings.loseRate,
      teamName: organizations.name,
      teamSlug: organizations.slug,
      teamLogo: organizations.logo,
      teamLocation: organizations.location,
      seed: tournamentStageTeams.seed,
    })
    .from(tournamentStageRankings)
    .leftJoin(
      tournamentStageTeams,
      and(
        eq(tournamentStageTeams.stageId, tournamentStageRankings.stageId),
        eq(
          tournamentStageTeams.organizationId,
          tournamentStageRankings.organizationId
        )
      )
    )
    .leftJoin(
      organizations,
      eq(tournamentStageRankings.organizationId, organizations.id)
    )
    .where(inArray(tournamentStageRankings.stageId, stageIds))
    .orderBy(
      asc(tournamentStageRankings.stageId),
      asc(tournamentStageRankings.rank),
      asc(organizations.name)
    );

  const map = new Map<string, StageRankingRow[]>();
  for (const row of rows) {
    if (!map.has(row.stageId)) {
      map.set(row.stageId, []);
    }
    map.get(row.stageId)?.push(row);
  }
  return map;
}

export function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>>
) {
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

export async function getTournamentByIdentifier(identifier: string) {
  const tournament = await db
    .select()
    .from(tournaments)
    .where(or(eq(tournaments.id, identifier), eq(tournaments.slug, identifier)))
    .limit(1);

  return tournament[0] ?? null;
}

export function normalizeFieldCount(fieldCount?: number) {
  if (typeof fieldCount !== "number" || Number.isNaN(fieldCount)) {
    return 1;
  }
  return Math.max(1, Math.floor(fieldCount));
}

export function createEmptyFieldRoleState(): Record<
  TournamentFieldRole,
  FieldRoleUser | null
> {
  return tournamentFieldRoles.reduce(
    (acc, role) => {
      acc[role] = null;
      return acc;
    },
    {} as Record<TournamentFieldRole, FieldRoleUser | null>
  );
}

export function createEmptyFieldRoleIdState(): Record<
  TournamentFieldRole,
  string | null
> {
  return tournamentFieldRoles.reduce(
    (acc, role) => {
      acc[role] = null;
      return acc;
    },
    {} as Record<TournamentFieldRole, string | null>
  );
}

export function buildFieldRoleMatrix(
  fieldCount: number,
  rows: FieldAssignmentRow[]
): FieldRoleField[] {
  const assignments = new Map<
    number,
    Record<TournamentFieldRole, FieldRoleUser | null>
  >();

  for (const row of rows) {
    let fieldRoles = assignments.get(row.fieldNumber);
    if (!fieldRoles) {
      fieldRoles = createEmptyFieldRoleState();
      assignments.set(row.fieldNumber, fieldRoles);
    }
    fieldRoles[row.role] = row.userId
      ? {
          userId: row.userId,
          name: row.userName,
          email: row.userEmail,
          role: row.userRole,
        }
      : null;
  }

  const normalizedFieldCount = normalizeFieldCount(fieldCount);
  const baseFields = Array.from(
    { length: normalizedFieldCount },
    (_, index) => {
      const fieldNumber = index + 1;
      return {
        fieldNumber,
        roles: assignments.get(fieldNumber) ?? createEmptyFieldRoleState(),
      };
    }
  );

  const extraFields = [...assignments.entries()]
    .filter(([fieldNumber]) => fieldNumber > normalizedFieldCount)
    .sort((entryA, entryB) => entryA[0] - entryB[0])
    .map(([fieldNumber, roles]) => ({
      fieldNumber,
      roles,
    }));

  return [...baseFields, ...extraFields];
}

export function normalizeFieldRoleAssignments(
  rows: FieldAssignmentRow[]
): FieldRoleAssignmentResponse[] {
  return rows.map((row) => ({
    id: row.id,
    fieldNumber: row.fieldNumber,
    role: row.role,
    user: row.userId
      ? {
          userId: row.userId,
          name: row.userName,
          email: row.userEmail,
          role: row.userRole,
        }
      : null,
  }));
}

export function buildFieldRolesResponse(
  tournament: {
    id: string;
    name: string;
    status: TournamentStatus;
    fieldCount: number;
  },
  assignments: FieldAssignmentRow[]
) {
  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      fieldCount: tournament.fieldCount,
    },
    fields: buildFieldRoleMatrix(tournament.fieldCount, assignments),
    assignments: normalizeFieldRoleAssignments(assignments),
  };
}

export async function fetchTournamentFieldAssignments(
  tournamentId: string
): Promise<FieldAssignmentRow[]> {
  const assignmentsRows = await db
    .select({
      id: tournamentFieldAssignments.id,
      fieldNumber: tournamentFieldAssignments.fieldNumber,
      role: tournamentFieldAssignments.role,
      userId: tournamentFieldAssignments.userId,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
    })
    .from(tournamentFieldAssignments)
    .leftJoin(user, eq(user.id, tournamentFieldAssignments.userId))
    .where(eq(tournamentFieldAssignments.tournamentId, tournamentId));
  return assignmentsRows;
}

export function parseScoreData(value?: string | null): ScoreData | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as ScoreData;
  } catch {
    return null;
  }
}

export function formatMatchTeam(
  match: StageMatchRow,
  side: "home" | "away"
): StageResponseMatch["home"] {
  const isHome = side === "home";
  const id = isHome ? match.homeTeamId : match.awayTeamId;
  const name = isHome ? match.homeTeamName : match.awayTeamName;
  const slug = isHome ? match.homeTeamSlug : match.awayTeamSlug;
  const logo = isHome ? match.homeTeamLogo : match.awayTeamLogo;
  const placeholder = isHome ? match.homePlaceholder : match.awayPlaceholder;

  return {
    id,
    name: name ?? placeholder ?? "TBD",
    slug,
    logo,
    placeholder: placeholder ?? null,
  };
}

export const buildSlug = (name: string) => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = base || "tournament";
  return `${fallback}-${Date.now()}`;
};

export function parseDate(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function computeFieldNumber(matchNumber: number, fieldCount: number) {
  return ((matchNumber - 1) % fieldCount) + 1;
}

export function parseScheduleSlot(raw: unknown): ScheduledSlot | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof (raw as ScheduledSlot).teamId !== "string" ||
    typeof (raw as ScheduledSlot).station !== "string" ||
    ((raw as ScheduledSlot).color !== "RED" &&
      (raw as ScheduledSlot).color !== "BLUE") ||
    typeof (raw as ScheduledSlot).isSurrogate !== "boolean"
  ) {
    return null;
  }
  return {
    teamId: (raw as ScheduledSlot).teamId,
    station: (raw as ScheduledSlot).station as ScheduledSlot["station"],
    color: (raw as ScheduledSlot).color as ScheduledSlot["color"],
    isSurrogate: (raw as ScheduledSlot).isSurrogate,
  };
}

export function parseScheduleMatch(
  raw: unknown
): MatchScheduleMetadata["matches"][number] | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<MatchScheduleMetadata["matches"][number]>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.roundNumber !== "number" ||
    typeof candidate.matchNumber !== "number" ||
    !Array.isArray(candidate.slots)
  ) {
    return null;
  }
  const slots: ScheduledSlot[] = [];
  for (const slot of candidate.slots) {
    const parsedSlot = parseScheduleSlot(slot);
    if (!parsedSlot) {
      return null;
    }
    slots.push(parsedSlot);
  }
  return {
    id: candidate.id,
    roundNumber: candidate.roundNumber,
    matchNumber: candidate.matchNumber,
    slots,
  };
}

export function sanitizeScheduleMetadata(
  value: unknown
): MatchScheduleMetadata | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const candidate = value as Partial<MatchScheduleMetadata>;
  if (
    typeof candidate.rounds !== "number" ||
    typeof candidate.teamsPerAlliance !== "number" ||
    typeof candidate.minMatchGap !== "number" ||
    !Array.isArray(candidate.stations) ||
    !Array.isArray(candidate.matches)
  ) {
    return;
  }

  const stationsAreStrings = candidate.stations.every(
    (station): station is MatchScheduleMetadata["stations"][number] =>
      typeof station === "string"
  );
  if (!stationsAreStrings) {
    return;
  }

  const matches: MatchScheduleMetadata["matches"] = [];
  for (const rawMatch of candidate.matches) {
    const parsedMatch = parseScheduleMatch(rawMatch);
    if (!parsedMatch) {
      return;
    }
    matches.push(parsedMatch);
  }

  return {
    rounds: candidate.rounds,
    teamsPerAlliance: candidate.teamsPerAlliance,
    minMatchGap: candidate.minMatchGap,
    stations: candidate.stations as MatchScheduleMetadata["stations"],
    matches,
  };
}

export function parseMatchMetadata(value?: string | null): MatchMetadata | undefined {
  if (!value) {
    return;
  }
  try {
    const parsed = JSON.parse(value) as Partial<MatchMetadata>;
    const metadata: MatchMetadata = {};
    if (
      parsed.format === "DOUBLE_ELIMINATION" ||
      parsed.format === "ROUND_ROBIN"
    ) {
      metadata.format = parsed.format;
    }
    if (
      parsed.bracket === "WINNERS" ||
      parsed.bracket === "LOSERS" ||
      parsed.bracket === "FINALS"
    ) {
      metadata.bracket = parsed.bracket;
    }
    if (typeof parsed.roundIndex === "number") {
      metadata.roundIndex = parsed.roundIndex;
    }
    if (typeof parsed.matchIndex === "number") {
      metadata.matchIndex = parsed.matchIndex;
    }
    if (typeof parsed.fieldNumber === "number") {
      metadata.fieldNumber = Math.max(1, Math.floor(parsed.fieldNumber));
    }
    if (typeof parsed.label === "string") {
      metadata.label = parsed.label;
    }
    if (Array.isArray(parsed.sources)) {
      const normalizedSources = parsed.sources.filter(
        (source): source is MatchMetadataSource =>
          !!source &&
          typeof source === "object" &&
          typeof source.matchId === "string" &&
          (source.outcome === "WINNER" || source.outcome === "LOSER") &&
          (source.target === "home" || source.target === "away") &&
          typeof source.label === "string"
      );
      if (normalizedSources.length) {
        metadata.sources = normalizedSources.map((source) => ({
          matchId: source.matchId,
          outcome: source.outcome,
          target: source.target,
          label: source.label,
        }));
      }
    }
    return Object.keys(metadata).length ? metadata : undefined;
  } catch {
    return;
  }
}

export function createDefaultStageConfiguration(
  overrides?: Partial<StageConfiguration>
): StageConfiguration {
  return {
    teamOrder: [],
    matchDependencies: [],
    schedule: undefined,
    ...overrides,
  };
}

export function parseStageConfigurationValue(
  value?: string | null
): StageConfiguration {
  if (!value) {
    return createDefaultStageConfiguration();
  }
  try {
    const parsed = JSON.parse(value) as Partial<StageConfiguration>;
    const teamOrder = Array.isArray(parsed.teamOrder)
      ? parsed.teamOrder.filter(
          (team): team is string => typeof team === "string"
        )
      : [];
    const matchDependencies = Array.isArray(parsed.matchDependencies)
      ? parsed.matchDependencies.filter(
          (dependency): dependency is StageMatchDependency =>
            typeof dependency === "object" &&
            dependency !== null &&
            typeof dependency.targetMatchId === "string" &&
            (dependency.targetSide === "home" ||
              dependency.targetSide === "away") &&
            dependency.source &&
            typeof dependency.source === "object" &&
            typeof dependency.source.matchId === "string" &&
            (dependency.source.outcome === "WINNER" ||
              dependency.source.outcome === "LOSER")
        )
      : [];
    return createDefaultStageConfiguration({
      teamOrder,
      matchDependencies,
      schedule: sanitizeScheduleMetadata(parsed.schedule),
    });
  } catch {
    return createDefaultStageConfiguration();
  }
}
