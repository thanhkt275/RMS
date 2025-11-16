import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { db } from "@rms-modern/db";
import { user } from "@rms-modern/db/schema/auth";
import {
  type MatchStatus,
  organizationMembers,
  organizations,
  scoreProfiles,
  type TournamentFieldRole,
  type TournamentStatus,
  tournamentFieldAssignments,
  tournamentFieldRoles,
  tournamentMatches,
  tournamentParticipations,
  tournamentResources,
  tournamentStageRankings,
  tournamentStages,
  tournamentStageTeams,
  tournamentStatuses,
  tournaments,
} from "@rms-modern/db/schema/organization";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";
import { createRedisSubscriber } from "../lib/redis";
import {
  fetchStageLeaderboardRows,
  readStageLeaderboardOrder,
  syncStageLeaderboard,
} from "../services/leaderboard";
import {
  getStageEventChannel,
  publishStageEvent,
  type StageEventPayload,
} from "../services/stage-events";
import {
  buildMatchSchedule,
  type MatchScheduleMetadata,
  type ScheduledSlot,
} from "../utils/match-scheduler";
import type { TournamentResourceInput } from "./tournaments/schemas";
import {
  fieldRoleUpdateSchema,
  matchGenerationSchema,
  matchUpdateSchema,
  registrationSchema,
  stagePayloadSchema,
  stageUpdateSchema,
  tournamentPayloadSchema,
  tournamentUpdateSchema,
} from "./tournaments/schemas";
import type {
  FieldAssignmentRow,
  FieldRoleAssignmentResponse,
  FieldRoleField,
  FieldRoleUser,
  MatchMetadata,
  MatchMetadataSource,
  ScoreData,
  ScoreProfileSummary,
  StageConfiguration,
  StageGenerationResult,
  StageMatchDependency,
  StageMatchRow,
  StageMatchSeed,
  StageRankingMatchSummary,
  StageRankingRow,
  StageRecord,
  StageResponse,
  StageResponseMatch,
  StageResponseRanking,
  StageResponseTeam,
  StageTeamRow,
} from "./tournaments/types";

const tournamentsRoute = new Hono();
const stageHomeTeamAlias = alias(organizations, "stage_home_team");
const stageAwayTeamAlias = alias(organizations, "stage_away_team");

const DEFAULT_PAGE_SIZE = 10;
const SCORE_PROFILE_WARNING_MESSAGE =
  "No score profile is assigned to this tournament. Add one in tournament settings before generating matches to enable scoring.";

const sortColumnMap = {
  name: tournaments.name,
  startDate: tournaments.startDate,
  registrationDeadline: tournaments.registrationDeadline,
  createdAt: tournaments.createdAt,
} as const;

const sortableFields = Object.keys(sortColumnMap) as Array<
  keyof typeof sortColumnMap
>;

function parseScoreData(value?: string | null): ScoreData | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as ScoreData;
  } catch {
    return null;
  }
}

function formatMatchTeam(
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

function buildStageResponses(
  stages: StageRecord[],
  teamsMap: Map<string, StageTeamRow[]>,
  matchesMap: Map<string, StageMatchRow[]>,
  rankingsMap: Map<string, StageRankingRow[]>
): StageResponse[] {
  return stages.map((stage) => {
    const configuration = parseStageConfigurationValue(stage.configuration);
    const teams =
      teamsMap.get(stage.id)?.map(
        (team): StageResponseTeam => ({
          id: team.organizationId,
          name: team.teamName,
          slug: team.teamSlug,
          logo: team.teamLogo,
          location: team.teamLocation,
          seed: team.seed,
        })
      ) ?? [];

    const matches =
      matchesMap.get(stage.id)?.map(
        (match): StageResponseMatch => ({
          id: match.id,
          round: match.round,
          status: match.status,
          scheduledAt: match.scheduledAt?.toISOString() ?? null,
          home: formatMatchTeam(match, "home"),
          away: formatMatchTeam(match, "away"),
          score: {
            home: match.homeScore,
            away: match.awayScore,
          },
          metadata: parseMatchMetadata(match.metadata),
        })
      ) ?? [];

    const rankings =
      rankingsMap.get(stage.id)?.map(
        (ranking): StageResponseRanking => ({
          teamId: ranking.organizationId,
          name: ranking.teamName,
          slug: ranking.teamSlug,
          logo: ranking.teamLogo,
          location: ranking.teamLocation,
          seed: ranking.seed,
          rank: ranking.rank,
          gamesPlayed: ranking.gamesPlayed,
          wins: ranking.wins,
          losses: ranking.losses,
          ties: ranking.ties,
          rankingPoints: ranking.rankingPoints,
          autonomousPoints: ranking.autonomousPoints,
          strengthPoints: ranking.strengthPoints,
          totalScore: ranking.totalScore,
          loseRate: ranking.loseRate,
          scoreData: parseScoreData(ranking.scoreData),
        })
      ) ?? [];

    return {
      id: stage.id,
      name: stage.name,
      type: stage.type,
      status: stage.status,
      stageOrder: stage.stageOrder,
      fieldCount: stage.fieldCount,
      configuration,
      teamCount: teams.length,
      createdAt: stage.createdAt?.toISOString() ?? null,
      updatedAt: stage.updatedAt?.toISOString() ?? null,
      startedAt: stage.startedAt?.toISOString() ?? null,
      completedAt: stage.completedAt?.toISOString() ?? null,
      teams,
      matches,
      rankings,
    };
  });
}

async function getStagesResponse(tournamentId: string, stageId?: string) {
  const stages = await fetchStages(tournamentId, stageId);
  if (!stages.length) {
    return stageId ? null : [];
  }
  const stageIds = stages.map((stage) => stage.id);
  const [teamsMap, matchesMap, rankingsMap] = await Promise.all([
    fetchStageTeamsMap(stageIds),
    fetchStageMatchesMap(stageIds),
    fetchStageRankingsMap(stageIds),
  ]);
  return buildStageResponses(stages, teamsMap, matchesMap, rankingsMap);
}

async function finalizeStageResponse(
  tournamentId: string,
  stageId: string,
  warnings?: string[]
) {
  const stageResponse = await getStagesResponse(tournamentId, stageId);
  if (!stageResponse) {
    throw new Error("Stage not found.");
  }
  if (warnings?.length) {
    stageResponse[0].warnings = warnings;
  }
  return stageResponse[0];
}

async function resolveStageOrder(
  tournamentId: string,
  requestedOrder?: number
) {
  if (requestedOrder && requestedOrder > 0) {
    return requestedOrder;
  }
  const existingOrder = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${tournamentStages.stageOrder}), 0)`,
    })
    .from(tournamentStages)
    .where(eq(tournamentStages.tournamentId, tournamentId));
  return (existingOrder[0]?.maxOrder ?? 0) + 1;
}

function generateRoundRobinMatches(params: {
  teamIds: string[];
  matchesPerTeam: number;
  roundLabel: string;
  fieldCount: number;
}): StageGenerationResult {
  const { teamIds, roundLabel } = params;
  if (teamIds.length < 2) {
    throw new Error("At least two teams are required to generate matches.");
  }

  const schedule = buildMatchSchedule({
    teamIds,
    rounds: Math.max(1, params.matchesPerTeam),
    teamsPerAlliance: 1,
    minMatchGap: 1,
  });

  const fieldCount = normalizeFieldCount(params.fieldCount);

  const matches: StageMatchSeed[] = schedule.matches.map((match) => ({
    id: match.id,
    round: `${roundLabel} - Round ${match.roundNumber}`,
    homeTeamId: match.redAlliance[0]?.teamId ?? null,
    awayTeamId: match.blueAlliance[0]?.teamId ?? null,
    metadata: {
      format: "ROUND_ROBIN",
      label: `${roundLabel} Match ${match.matchNumber}`,
      roundIndex: match.roundNumber,
      matchIndex: match.matchNumber,
      fieldNumber: computeFieldNumber(match.matchNumber, fieldCount),
    },
  }));

  return {
    matches,
    configuration: createDefaultStageConfiguration({
      teamOrder: [...teamIds],
      schedule: schedule.metadata,
    }),
    warnings: schedule.warnings.length ? schedule.warnings : undefined,
  };
}

function generateDoubleEliminationMatches(
  teamIds: string[],
  fieldCount: number
): StageGenerationResult {
  if (teamIds.length !== 4) {
    throw new Error(
      "Double elimination currently supports exactly 4 teams in the stage."
    );
  }

  const normalizedFieldCount = normalizeFieldCount(fieldCount);

  const matchIds = Array.from({ length: 6 }, () => crypto.randomUUID());
  const matchLabels = new Map(
    matchIds.map((matchId, index) => [matchId, `Match ${index + 1}`])
  );

  const [
    winnersSemiOne,
    winnersSemiTwo,
    winnersFinal,
    losersRoundOne,
    losersFinal,
    grandFinal,
  ] = matchIds;

  const matches: StageMatchSeed[] = [
    {
      id: winnersSemiOne,
      round: "Winners Semi 1",
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[3],
    },
    {
      id: winnersSemiTwo,
      round: "Winners Semi 2",
      homeTeamId: teamIds[1],
      awayTeamId: teamIds[2],
    },
    {
      id: winnersFinal,
      round: "Winners Final",
      homePlaceholder: `Winner of ${matchLabels.get(winnersSemiOne)}`,
      awayPlaceholder: `Winner of ${matchLabels.get(winnersSemiTwo)}`,
    },
    {
      id: losersRoundOne,
      round: "Losers Round 1",
      homePlaceholder: `Loser of ${matchLabels.get(winnersSemiOne)}`,
      awayPlaceholder: `Loser of ${matchLabels.get(winnersSemiTwo)}`,
    },
    {
      id: losersFinal,
      round: "Losers Final",
      homePlaceholder: `Loser of ${matchLabels.get(winnersFinal)}`,
      awayPlaceholder: `Winner of ${matchLabels.get(losersRoundOne)}`,
    },
    {
      id: grandFinal,
      round: "Grand Final",
      homePlaceholder: `Winner of ${matchLabels.get(winnersFinal)}`,
      awayPlaceholder: `Winner of ${matchLabels.get(losersFinal)}`,
    },
  ];

  const matchDependencies: StageMatchDependency[] = [
    {
      targetMatchId: winnersFinal,
      targetSide: "home",
      source: { matchId: winnersSemiOne, outcome: "WINNER" },
      placeholder: `Winner of ${matchLabels.get(winnersSemiOne)}`,
    },
    {
      targetMatchId: winnersFinal,
      targetSide: "away",
      source: { matchId: winnersSemiTwo, outcome: "WINNER" },
      placeholder: `Winner of ${matchLabels.get(winnersSemiTwo)}`,
    },
    {
      targetMatchId: losersRoundOne,
      targetSide: "home",
      source: { matchId: winnersSemiOne, outcome: "LOSER" },
      placeholder: `Loser of ${matchLabels.get(winnersSemiOne)}`,
    },
    {
      targetMatchId: losersRoundOne,
      targetSide: "away",
      source: { matchId: winnersSemiTwo, outcome: "LOSER" },
      placeholder: `Loser of ${matchLabels.get(winnersSemiTwo)}`,
    },
    {
      targetMatchId: losersFinal,
      targetSide: "home",
      source: { matchId: winnersFinal, outcome: "LOSER" },
      placeholder: `Loser of ${matchLabels.get(winnersFinal)}`,
    },
    {
      targetMatchId: losersFinal,
      targetSide: "away",
      source: { matchId: losersRoundOne, outcome: "WINNER" },
      placeholder: `Winner of ${matchLabels.get(losersRoundOne)}`,
    },
    {
      targetMatchId: grandFinal,
      targetSide: "home",
      source: { matchId: winnersFinal, outcome: "WINNER" },
      placeholder: `Winner of ${matchLabels.get(winnersFinal)}`,
    },
    {
      targetMatchId: grandFinal,
      targetSide: "away",
      source: { matchId: losersFinal, outcome: "WINNER" },
      placeholder: `Winner of ${matchLabels.get(losersFinal)}`,
    },
  ];

  const layoutEntries = [
    [winnersSemiOne, { bracket: "WINNERS", roundIndex: 1, matchIndex: 1 }],
    [winnersSemiTwo, { bracket: "WINNERS", roundIndex: 1, matchIndex: 2 }],
    [winnersFinal, { bracket: "WINNERS", roundIndex: 2, matchIndex: 1 }],
    [losersRoundOne, { bracket: "LOSERS", roundIndex: 1, matchIndex: 1 }],
    [losersFinal, { bracket: "LOSERS", roundIndex: 2, matchIndex: 1 }],
    [grandFinal, { bracket: "FINALS", roundIndex: 1, matchIndex: 1 }],
  ] as const;
  const layoutMap = new Map<
    string,
    {
      bracket: "WINNERS" | "LOSERS" | "FINALS";
      roundIndex: number;
      matchIndex: number;
    }
  >(layoutEntries);

  const dependencyMap = new Map<string, StageMatchDependency[]>();
  for (const dependency of matchDependencies) {
    const existing = dependencyMap.get(dependency.targetMatchId) ?? [];
    existing.push(dependency);
    dependencyMap.set(dependency.targetMatchId, existing);
  }

  const matchesWithMetadata = matches.map((match, index) => {
    const layout = layoutMap.get(match.id);
    const sources =
      dependencyMap.get(match.id)?.map((dependency) => ({
        matchId: dependency.source.matchId,
        outcome: dependency.source.outcome,
        target: dependency.targetSide,
        label:
          dependency.placeholder ??
          `${dependency.source.outcome} of ${
            matchLabels.get(dependency.source.matchId) ?? `Match ${index + 1}`
          }`,
      })) ?? [];
    return {
      ...match,
      metadata: {
        format: "DOUBLE_ELIMINATION",
        label: matchLabels.get(match.id),
        bracket: layout?.bracket,
        roundIndex: layout?.roundIndex,
        matchIndex: layout?.matchIndex,
        fieldNumber: computeFieldNumber(index + 1, normalizedFieldCount),
        sources,
      },
    };
  });

  return {
    matches: matchesWithMetadata,
    configuration: createDefaultStageConfiguration({
      teamOrder: [...teamIds],
      matchDependencies,
    }),
  };
}

function normalizeFieldCount(fieldCount?: number) {
  if (typeof fieldCount !== "number" || Number.isNaN(fieldCount)) {
    return 1;
  }
  return Math.max(1, Math.floor(fieldCount));
}

function computeFieldNumber(order: number, fieldCount: number) {
  const normalizedOrder = Math.max(1, Math.floor(order));
  const normalizedFieldCount = normalizeFieldCount(fieldCount);
  if (normalizedFieldCount === 1) {
    return 1;
  }
  return ((normalizedOrder - 1) % normalizedFieldCount) + 1;
}

function createEmptyFieldRoleState(): Record<
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

function createEmptyFieldRoleIdState(): Record<
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

function buildFieldRoleMatrix(
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

function normalizeFieldRoleAssignments(
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

function buildFieldRolesResponse(
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

async function fetchTournamentFieldAssignments(
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

function buildStageGeneration(
  stage: Pick<StageRecord, "type" | "id" | "fieldCount">,
  teamIds: string[]
): StageGenerationResult {
  switch (stage.type) {
    case "FIRST_ROUND":
      return generateRoundRobinMatches({
        teamIds,
        matchesPerTeam: 4,
        roundLabel: "First Round",
        fieldCount: stage.fieldCount,
      });
    case "SEMI_FINAL_ROUND_ROBIN":
      return generateRoundRobinMatches({
        teamIds,
        matchesPerTeam: 3,
        roundLabel: "Semi-final Round Robin",
        fieldCount: stage.fieldCount,
      });
    case "FINAL_DOUBLE_ELIMINATION":
      return generateDoubleEliminationMatches(teamIds, stage.fieldCount);
    default:
      return {
        matches: [],
        configuration: createDefaultStageConfiguration({
          teamOrder: [...teamIds],
        }),
        warnings: ["Unsupported stage type."],
      };
  }
}

async function regenerateStageMatches(stage: StageRecord, teamIds: string[]) {
  const generation = buildStageGeneration(stage, teamIds);

  await db
    .delete(tournamentMatches)
    .where(eq(tournamentMatches.stageId, stage.id));

  if (generation.matches.length) {
    await db.insert(tournamentMatches).values(
      generation.matches.map((match) => ({
        id: match.id ?? crypto.randomUUID(),
        tournamentId: stage.tournamentId,
        stageId: stage.id,
        round: match.round,
        status: "SCHEDULED",
        homeTeamId: match.homeTeamId ?? null,
        awayTeamId: match.awayTeamId ?? null,
        homePlaceholder: match.homePlaceholder ?? null,
        awayPlaceholder: match.awayPlaceholder ?? null,
        metadata: match.metadata ? JSON.stringify(match.metadata) : null,
      }))
    );
  }

  await saveStageConfiguration(stage.id, generation.configuration);

  const warnings = await appendScoreProfileWarning(
    stage.tournamentId,
    generation.warnings
  );

  await recalculateStageRankings(stage.id);
  await publishStageEvent(stage.id, "matches.updated");

  return {
    ...generation,
    warnings,
  };
}

async function handleStageMatchPreparation(
  stage: StageRecord,
  teamIds: string[],
  shouldGenerate: boolean
) {
  if (shouldGenerate) {
    return regenerateStageMatches(stage, teamIds);
  }
  await saveStageConfiguration(
    stage.id,
    createDefaultStageConfiguration({ teamOrder: [...teamIds] })
  );
  return {
    matches: [],
    configuration: createDefaultStageConfiguration({ teamOrder: [...teamIds] }),
    warnings: undefined,
  };
}

async function fetchTournamentScoreProfileId(tournamentId: string) {
  const rows = await db
    .select({ scoreProfileId: tournaments.scoreProfileId })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  return rows[0]?.scoreProfileId ?? null;
}

async function appendScoreProfileWarning(
  tournamentId: string,
  existingWarnings?: string[]
) {
  if (existingWarnings?.includes(SCORE_PROFILE_WARNING_MESSAGE)) {
    return existingWarnings;
  }
  const scoreProfileId = await fetchTournamentScoreProfileId(tournamentId);
  if (scoreProfileId) {
    return existingWarnings?.length ? existingWarnings : undefined;
  }
  return [...(existingWarnings ?? []), SCORE_PROFILE_WARNING_MESSAGE];
}

async function hasUnfinishedStageMatches(stageId: string) {
  const rows = await db
    .select({ id: tournamentMatches.id })
    .from(tournamentMatches)
    .where(
      and(
        eq(tournamentMatches.stageId, stageId),
        ne(tournamentMatches.status, "COMPLETED" as MatchStatus)
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function propagateMatchOutcome(
  stage: StageRecord,
  sourceMatchId: string,
  winnerTeamId: string,
  loserTeamId: string
) {
  const configuration = parseStageConfigurationValue(stage.configuration);
  if (!configuration.matchDependencies.length) {
    return;
  }

  const relatedDependencies = configuration.matchDependencies.filter(
    (dependency) => dependency.source.matchId === sourceMatchId
  );

  await Promise.all(
    relatedDependencies.map((dependency) => {
      const teamId =
        dependency.source.outcome === "WINNER" ? winnerTeamId : loserTeamId;
      const payload: Record<string, unknown> = {};
      if (dependency.targetSide === "home") {
        payload.homeTeamId = teamId;
        payload.homePlaceholder = null;
      } else {
        payload.awayTeamId = teamId;
        payload.awayPlaceholder = null;
      }
      return db
        .update(tournamentMatches)
        .set(payload)
        .where(
          and(
            eq(tournamentMatches.id, dependency.targetMatchId),
            ne(tournamentMatches.status, "COMPLETED" as MatchStatus)
          )
        );
    })
  );
}

function determineMatchOutcome(
  match: Pick<
    StageMatchRow,
    "homeTeamId" | "awayTeamId" | "homeScore" | "awayScore"
  >
) {
  if (
    match.homeTeamId &&
    match.awayTeamId &&
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined
  ) {
    if (match.homeScore === match.awayScore) {
      throw new Error("Matches cannot end in a draw for advancement stages.");
    }
    const winner =
      match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
    const loser =
      match.homeScore > match.awayScore ? match.awayTeamId : match.homeTeamId;
    return { winner, loser };
  }
  throw new Error("Scores must be provided to determine match outcome.");
}

function normalizeMatchUpdatePayload(
  match: StageMatchRow,
  payload: z.infer<typeof matchUpdateSchema>
) {
  const updates: Record<string, unknown> = {};
  if (payload.homeScore !== undefined) {
    updates.homeScore = payload.homeScore;
  }
  if (payload.awayScore !== undefined) {
    updates.awayScore = payload.awayScore;
  }
  if (payload.scheduledAt) {
    updates.scheduledAt = parseDate(payload.scheduledAt);
  }
  if (payload.status) {
    updates.status = payload.status;
  }
  const nextHomeScore =
    payload.homeScore !== undefined ? payload.homeScore : match.homeScore;
  const nextAwayScore =
    payload.awayScore !== undefined ? payload.awayScore : match.awayScore;
  const nextStatus = payload.status ?? match.status;
  return { updates, nextHomeScore, nextAwayScore, nextStatus };
}

function ensureScoresForCompletion(
  status: MatchStatus,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined
) {
  if (
    status === "COMPLETED" &&
    (homeScore === null ||
      homeScore === undefined ||
      awayScore === null ||
      awayScore === undefined)
  ) {
    throw new Error("Scores must be provided to complete a match.");
  }
}

const buildSlug = (name: string) => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = base || "tournament";
  return `${fallback}-${Date.now()}`;
};

function parseDate(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

async function getTournamentByIdentifier(identifier: string) {
  const tournament = await db
    .select()
    .from(tournaments)
    .where(or(eq(tournaments.id, identifier), eq(tournaments.slug, identifier)))
    .limit(1);

  return tournament[0] ?? null;
}

async function resolveScoreProfileId(rawId?: string | null) {
  if (typeof rawId !== "string") {
    return null;
  }
  const trimmed = rawId.trim();
  if (!trimmed.length) {
    return null;
  }
  const rows = await db
    .select({ id: scoreProfiles.id })
    .from(scoreProfiles)
    .where(eq(scoreProfiles.id, trimmed))
    .limit(1);
  if (!rows.length) {
    throw new Error("Score profile not found.");
  }
  return trimmed;
}

async function getScoreProfileSummary(
  scoreProfileId: string
): Promise<ScoreProfileSummary | null> {
  const rows = await db
    .select({
      id: scoreProfiles.id,
      name: scoreProfiles.name,
      description: scoreProfiles.description,
      definition: scoreProfiles.definition,
    })
    .from(scoreProfiles)
    .where(eq(scoreProfiles.id, scoreProfileId))
    .limit(1);
  return rows[0] ?? null;
}

type FilterResult = {
  whereClause?: SQL;
  normalizedStatus?: TournamentStatus;
};

function resolveSortField(sortField?: string | null) {
  return sortableFields.includes(sortField as keyof typeof sortColumnMap)
    ? (sortField as keyof typeof sortColumnMap)
    : "createdAt";
}

function buildFilterClause(
  statusParam?: TournamentStatus,
  search?: string
): FilterResult {
  const expressions: SQL[] = [];
  let normalizedStatus: TournamentStatus | undefined;

  if (statusParam && tournamentStatuses.includes(statusParam)) {
    expressions.push(eq(tournaments.status, statusParam));
    normalizedStatus = statusParam;
  }

  if (search) {
    const likeValue = `%${search.toLowerCase()}%`;
    expressions.push(
      or(
        sql`lower(${tournaments.name}) like ${likeValue}`,
        sql`lower(${tournaments.description}) like ${likeValue}`,
        sql`lower(${tournaments.location}) like ${likeValue}`
      )
    );
  }

  let whereClause: SQL | undefined;
  if (expressions.length === 1) {
    whereClause = expressions[0];
  } else if (expressions.length > 1) {
    whereClause = and(...expressions);
  }

  return { whereClause, normalizedStatus };
}

async function getStageTeamOrder(stageId: string) {
  const rows = await db
    .select({
      organizationId: tournamentStageTeams.organizationId,
      seed: tournamentStageTeams.seed,
      createdAt: tournamentStageTeams.createdAt,
    })
    .from(tournamentStageTeams)
    .where(eq(tournamentStageTeams.stageId, stageId))
    .orderBy(
      asc(tournamentStageTeams.seed),
      asc(tournamentStageTeams.createdAt)
    );
  return rows.map((row) => row.organizationId);
}

async function resolveRegenerationOrder(stageId: string, override?: string[]) {
  if (override?.length) {
    return override;
  }
  return await getStageTeamOrder(stageId);
}

async function ensureValidTeamOrderForGeneration(
  stageId: string,
  requestedOrder?: string[]
) {
  if (!requestedOrder?.length) {
    return getStageTeamOrder(stageId);
  }
  const uniqueOrder = Array.from(new Set(requestedOrder));
  const existingOrder = await getStageTeamOrder(stageId);
  if (uniqueOrder.length !== existingOrder.length) {
    throw new Error(
      "Team order must include every team currently assigned to the stage."
    );
  }
  const existingSet = new Set(existingOrder);
  const missing = uniqueOrder.filter((teamId) => !existingSet.has(teamId));
  if (missing.length) {
    throw new Error(
      "Team order must include only teams that already belong to this stage."
    );
  }
  await assignStageTeams(stageId, uniqueOrder);
  return uniqueOrder;
}

function applyWhereClause<TQuery extends { where: (expr: SQL) => TQuery }>(
  query: TQuery,
  whereClause?: SQL
) {
  return whereClause ? query.where(whereClause) : query;
}

type UpdateInput = z.infer<typeof tournamentUpdateSchema>;

function buildUpdatePayload(
  body: UpdateInput,
  overrides?: { scoreProfileId?: string | null }
) {
  const updatePayload: Record<string, unknown> = {};
  applyBasicFieldUpdates(updatePayload, body);
  applyDateFieldUpdates(updatePayload, body);
  applyAnnouncementUpdate(updatePayload, body);
  applyFieldCountUpdate(updatePayload, body);
  applyScoreProfileUpdate(updatePayload, overrides?.scoreProfileId);
  return updatePayload;
}

function applyBasicFieldUpdates(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.name) {
    updatePayload.name = body.name.trim();
  }
  if (body.description !== undefined) {
    updatePayload.description = body.description?.trim() || null;
  }
  if (body.organizer !== undefined) {
    updatePayload.organizer = body.organizer?.trim() || null;
  }
  if (body.location !== undefined) {
    updatePayload.location = body.location?.trim() || null;
  }
  if (body.season !== undefined) {
    updatePayload.season = body.season?.trim() || null;
  }
  if (body.status) {
    updatePayload.status = body.status;
  }
}

function applyDateFieldUpdates(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.startDate) {
    updatePayload.startDate = parseDate(body.startDate);
  }
  if (body.endDate !== undefined) {
    updatePayload.endDate = parseDate(body.endDate);
  }
  if (body.registrationDeadline) {
    updatePayload.registrationDeadline = parseDate(body.registrationDeadline);
  }
}

function applyAnnouncementUpdate(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.announcement !== undefined) {
    updatePayload.announcement = body.announcement?.trim() || null;
  }
}

function applyFieldCountUpdate(
  updatePayload: Record<string, unknown>,
  body: UpdateInput
) {
  if (body.fieldCount !== undefined) {
    updatePayload.fieldCount = normalizeFieldCount(body.fieldCount);
  }
}

function applyScoreProfileUpdate(
  updatePayload: Record<string, unknown>,
  scoreProfileId: string | null | undefined
) {
  if (scoreProfileId !== undefined) {
    updatePayload.scoreProfileId = scoreProfileId;
  }
}

async function replaceTournamentResources(
  tournamentId: string,
  resources?: TournamentResourceInput[]
) {
  if (resources === undefined) {
    return;
  }

  await db
    .delete(tournamentResources)
    .where(eq(tournamentResources.tournamentId, tournamentId));

  if (!resources.length) {
    return;
  }

  await db.insert(tournamentResources).values(
    resources.map((resource) => ({
      id: crypto.randomUUID(),
      tournamentId,
      title: resource.title.trim(),
      url: resource.url,
      type: resource.type,
      description: resource.description?.trim(),
    }))
  );
}

function ensureAdmin(session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

function createDefaultStageConfiguration(
  overrides?: Partial<StageConfiguration>
): StageConfiguration {
  return {
    teamOrder: [],
    matchDependencies: [],
    schedule: undefined,
    ...overrides,
  };
}

function parseScheduleSlot(raw: unknown): ScheduledSlot | null {
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

function parseScheduleMatch(
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

function sanitizeScheduleMetadata(
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

function parseMatchMetadata(value?: string | null): MatchMetadata | undefined {
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

function parseStageConfigurationValue(
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

async function saveStageConfiguration(
  stageId: string,
  configuration: StageConfiguration
) {
  await db
    .update(tournamentStages)
    .set({ configuration: JSON.stringify(configuration) })
    .where(eq(tournamentStages.id, stageId));
}

async function getStageRecord(
  tournamentId: string,
  stageId: string
): Promise<StageRecord | null> {
  const rows = await db
    .select({
      id: tournamentStages.id,
      tournamentId: tournamentStages.tournamentId,
      name: tournamentStages.name,
      type: tournamentStages.type,
      status: tournamentStages.status,
      stageOrder: tournamentStages.stageOrder,
      configuration: tournamentStages.configuration,
      createdAt: tournamentStages.createdAt,
      updatedAt: tournamentStages.updatedAt,
      startedAt: tournamentStages.startedAt,
      completedAt: tournamentStages.completedAt,
      fieldCount: tournaments.fieldCount,
    })
    .from(tournamentStages)
    .innerJoin(tournaments, eq(tournamentStages.tournamentId, tournaments.id))
    .where(
      and(
        eq(tournamentStages.id, stageId),
        eq(tournamentStages.tournamentId, tournamentId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function validateStageTeams(
  tournamentId: string,
  candidateTeamIds: string[]
) {
  const uniqueTeamIds = Array.from(new Set(candidateTeamIds));
  if (!uniqueTeamIds.length) {
    throw new Error("At least one team is required.");
  }

  const participants = await db
    .select({ organizationId: tournamentParticipations.organizationId })
    .from(tournamentParticipations)
    .where(
      and(
        eq(tournamentParticipations.tournamentId, tournamentId),
        inArray(tournamentParticipations.organizationId, uniqueTeamIds)
      )
    );

  const validIds = new Set(participants.map((entry) => entry.organizationId));
  const missing = uniqueTeamIds.filter((teamId) => !validIds.has(teamId));

  if (missing.length) {
    throw new Error(
      `These teams are not registered for the tournament: ${missing.join(", ")}`
    );
  }

  return uniqueTeamIds;
}

function enforceTeamRegenerationPolicy(
  payload: z.infer<typeof stageUpdateSchema>
) {
  if (payload.teamIds && payload.regenerateMatches === false) {
    throw new Error(
      "Matches must be regenerated when the stage roster changes to maintain bracket integrity."
    );
  }
}

async function ensureStageIsCompletable(stageId: string) {
  const pending = await hasUnfinishedStageMatches(stageId);
  if (pending) {
    throw new Error(
      "All matches must be completed before marking the stage as completed."
    );
  }
}

function buildStageMetadataUpdates(
  stage: StageRecord,
  payload: z.infer<typeof stageUpdateSchema>
) {
  const updates: Record<string, unknown> = {};

  if (payload.name) {
    updates.name = payload.name.trim();
  }
  if (payload.type) {
    updates.type = payload.type;
  }
  if (payload.stageOrder) {
    updates.stageOrder = payload.stageOrder;
  }
  if (payload.status && payload.status !== stage.status) {
    updates.status = payload.status;
    if (payload.status === "ACTIVE" && !stage.startedAt) {
      updates.startedAt = new Date();
      updates.completedAt = null;
    }
    if (payload.status === "PENDING") {
      updates.startedAt = null;
      updates.completedAt = null;
    }
    if (payload.status !== "COMPLETED" && stage.completedAt) {
      updates.completedAt = null;
    }
    if (payload.status === "COMPLETED") {
      updates.completedAt = new Date();
    }
  }

  return updates;
}

function shouldRegenerateMatchesOnUpdate(
  payload: z.infer<typeof stageUpdateSchema>
) {
  if (payload.regenerateMatches !== undefined) {
    return payload.regenerateMatches;
  }
  return Boolean(payload.teamIds || payload.type);
}

async function fetchStageTeamsMap(stageIds: string[]) {
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

async function fetchStageMatchesMap(stageIds: string[]) {
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

async function fetchStageRankingsMap(stageIds: string[]) {
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

const RANKING_WIN_POINTS = 2;
const RANKING_TIE_POINTS = 1;

type RankingAccumulator = {
  organizationId: string;
  seed: number | null;
  teamName: string | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  totalScore: number;
  totalAgainst: number;
  autonomousPoints: number;
  strengthPoints: number;
  matchHistory: StageRankingMatchSummary[];
};

async function recalculateStageRankings(stageId: string) {
  const [teamsMap, matchesMap] = await Promise.all([
    fetchStageTeamsMap([stageId]),
    fetchStageMatchesMap([stageId]),
  ]);
  const teams = teamsMap.get(stageId) ?? [];
  const teamInfoMap = new Map(teams.map((team) => [team.organizationId, team]));
  const resolveOpponentName = (
    id: string | null,
    placeholder: string | null
  ) => {
    if (id) {
      return teamInfoMap.get(id)?.teamName ?? placeholder ?? null;
    }
    return placeholder ?? null;
  };

  if (!teams.length) {
    await db
      .delete(tournamentStageRankings)
      .where(eq(tournamentStageRankings.stageId, stageId));
    await syncStageLeaderboard(stageId, []);
    await publishStageEvent(stageId, "leaderboard.updated");
    return;
  }

  const rankingMap = new Map<string, RankingAccumulator>();
  for (const team of teams) {
    rankingMap.set(team.organizationId, {
      organizationId: team.organizationId,
      seed: team.seed,
      teamName: team.teamName,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      totalScore: 0,
      totalAgainst: 0,
      autonomousPoints: 0,
      strengthPoints: 0,
      matchHistory: [],
    });
  }

  const matches = matchesMap.get(stageId) ?? [];
  for (const match of matches) {
    if (
      match.status !== "COMPLETED" ||
      typeof match.homeScore !== "number" ||
      typeof match.awayScore !== "number" ||
      match.homeTeamId === null ||
      match.awayTeamId === null
    ) {
      continue;
    }
    const home = rankingMap.get(match.homeTeamId);
    const away = rankingMap.get(match.awayTeamId);
    if (!(home && away)) {
      continue;
    }
    home.gamesPlayed += 1;
    away.gamesPlayed += 1;
    home.totalScore += match.homeScore;
    away.totalScore += match.awayScore;

    home.totalAgainst += match.awayScore;
    away.totalAgainst += match.homeScore;

    const homeOutcome: StageRankingMatchSummary["outcome"] =
      match.homeScore > match.awayScore
        ? "WIN"
        : match.homeScore < match.awayScore
          ? "LOSS"
          : "TIE";
    const awayOutcome: StageRankingMatchSummary["outcome"] =
      homeOutcome === "WIN" ? "LOSS" : homeOutcome === "LOSS" ? "WIN" : "TIE";

    home.matchHistory.push({
      matchId: match.id,
      opponentId: match.awayTeamId,
      opponentName: resolveOpponentName(
        match.awayTeamId,
        match.awayPlaceholder
      ),
      scored: match.homeScore,
      conceded: match.awayScore,
      status: match.status,
      outcome: homeOutcome,
    });
    away.matchHistory.push({
      matchId: match.id,
      opponentId: match.homeTeamId,
      opponentName: resolveOpponentName(
        match.homeTeamId,
        match.homePlaceholder
      ),
      scored: match.awayScore,
      conceded: match.homeScore,
      status: match.status,
      outcome: awayOutcome,
    });

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (match.awayScore > match.homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }

    home.strengthPoints += match.awayScore;
    away.strengthPoints += match.homeScore;
  }

  const rankings = Array.from(rankingMap.values()).map((entry) => {
    const rankingPoints =
      entry.wins * RANKING_WIN_POINTS + entry.ties * RANKING_TIE_POINTS;
    const loseRate =
      entry.gamesPlayed === 0 ? 0 : entry.losses / entry.gamesPlayed;
    return {
      ...entry,
      rankingPoints,
      loseRate,
    };
  });

  rankings.sort((a, b) => {
    if (b.rankingPoints !== a.rankingPoints) {
      return b.rankingPoints - a.rankingPoints;
    }
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (a.loseRate !== b.loseRate) {
      return a.loseRate - b.loseRate;
    }
    if (
      typeof a.seed === "number" &&
      typeof b.seed === "number" &&
      a.seed !== b.seed
    ) {
      return a.seed - b.seed;
    }
    const nameA = a.teamName ?? "";
    const nameB = b.teamName ?? "";
    return nameA.localeCompare(nameB);
  });

  await db
    .delete(tournamentStageRankings)
    .where(eq(tournamentStageRankings.stageId, stageId));

  if (!rankings.length) {
    await syncStageLeaderboard(stageId, []);
    await publishStageEvent(stageId, "leaderboard.updated");
    return;
  }

  const rankingRecords = rankings.map((entry, index) => ({
    id: crypto.randomUUID(),
    stageId,
    organizationId: entry.organizationId,
    rank: index + 1,
    gamesPlayed: entry.gamesPlayed,
    wins: entry.wins,
    losses: entry.losses,
    ties: entry.ties,
    rankingPoints: entry.rankingPoints,
    autonomousPoints: entry.autonomousPoints,
    strengthPoints: entry.strengthPoints,
    totalScore: entry.totalScore,
    scoreData: JSON.stringify({
      totalFor: entry.totalScore,
      totalAgainst: entry.totalAgainst,
      matches: entry.matchHistory,
    }),
    loseRate: entry.loseRate,
  }));

  await db.insert(tournamentStageRankings).values(rankingRecords);
  await syncStageLeaderboard(
    stageId,
    rankingRecords.map((record) => ({
      organizationId: record.organizationId,
      rank: record.rank,
    }))
  );
  await publishStageEvent(stageId, "leaderboard.updated");
}

async function fetchStages(
  tournamentId: string,
  stageId?: string
): Promise<StageRecord[]> {
  const whereClause = stageId
    ? and(
        eq(tournamentStages.tournamentId, tournamentId),
        eq(tournamentStages.id, stageId)
      )
    : eq(tournamentStages.tournamentId, tournamentId);

  const rows = await db
    .select({
      id: tournamentStages.id,
      tournamentId: tournamentStages.tournamentId,
      name: tournamentStages.name,
      type: tournamentStages.type,
      status: tournamentStages.status,
      stageOrder: tournamentStages.stageOrder,
      configuration: tournamentStages.configuration,
      createdAt: tournamentStages.createdAt,
      updatedAt: tournamentStages.updatedAt,
      startedAt: tournamentStages.startedAt,
      completedAt: tournamentStages.completedAt,
      fieldCount: tournaments.fieldCount,
    })
    .from(tournamentStages)
    .innerJoin(tournaments, eq(tournamentStages.tournamentId, tournaments.id))
    .where(whereClause)
    .orderBy(asc(tournamentStages.stageOrder), asc(tournamentStages.createdAt));

  return rows;
}

async function createStageEntity(
  tournamentId: string,
  payload: z.infer<typeof stagePayloadSchema>,
  stageOrder: number
) {
  const stageId = crypto.randomUUID();
  const normalizedStatus = payload.status ?? "PENDING";
  const now = new Date();

  await db.insert(tournamentStages).values({
    id: stageId,
    tournamentId,
    name: payload.name.trim(),
    type: payload.type,
    stageOrder,
    status: normalizedStatus,
    startedAt: normalizedStatus === "ACTIVE" ? now : null,
    completedAt: normalizedStatus === "COMPLETED" ? now : null,
  });

  const stage = await getStageRecord(tournamentId, stageId);
  if (!stage) {
    throw new Error("Stage creation failed.");
  }
  return stage;
}

async function assignStageTeams(stageId: string, teamIds: string[]) {
  await db
    .delete(tournamentStageTeams)
    .where(eq(tournamentStageTeams.stageId, stageId));
  if (teamIds.length) {
    await db.insert(tournamentStageTeams).values(
      teamIds.map((teamId, index) => ({
        id: crypto.randomUUID(),
        stageId,
        organizationId: teamId,
        seed: index + 1,
      }))
    );
  }
  await recalculateStageRankings(stageId);
}

tournamentsRoute.get("/", async (c) => {
  try {
    const url = new URL(c.req.url, "http://localhost");
    const page = Math.max(
      1,
      Number.parseInt(url.searchParams.get("page") ?? "1", 10)
    );
    const search = url.searchParams.get("search")?.trim() ?? "";
    const statusParam = url.searchParams.get("status")?.toUpperCase() as
      | TournamentStatus
      | undefined;
    const sortDirection =
      url.searchParams.get("sortDirection") === "asc" ? "asc" : "desc";
    const selectedSortField = resolveSortField(
      url.searchParams.get("sortField")
    );

    const { whereClause, normalizedStatus } = buildFilterClause(
      statusParam,
      search
    );
    const offset = (page - 1) * DEFAULT_PAGE_SIZE;

    const listQuery = db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        slug: tournaments.slug,
        status: tournaments.status,
        description: tournaments.description,
        startDate: tournaments.startDate,
        registrationDeadline: tournaments.registrationDeadline,
        organizer: tournaments.organizer,
        location: tournaments.location,
        season: tournaments.season,
        announcement: tournaments.announcement,
        scoreProfileId: tournaments.scoreProfileId,
        fieldCount: tournaments.fieldCount,
        registeredTeams: sql<number>`count(${tournamentParticipations.id})`,
      })
      .from(tournaments)
      .leftJoin(
        tournamentParticipations,
        eq(tournamentParticipations.tournamentId, tournaments.id)
      )
      .groupBy(tournaments.id);

    const orderedListQuery = applyWhereClause(listQuery, whereClause)
      .orderBy(
        sortDirection === "asc"
          ? asc(sortColumnMap[selectedSortField])
          : desc(sortColumnMap[selectedSortField])
      )
      .limit(DEFAULT_PAGE_SIZE)
      .offset(offset);

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(tournaments);
    countQuery = applyWhereClause(countQuery, whereClause);

    const [items, total] = await Promise.all([orderedListQuery, countQuery]);

    const totalItems = total[0]?.count ?? 0;

    return c.json({
      items,
      pagination: {
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems,
        totalPages: Math.ceil(totalItems / DEFAULT_PAGE_SIZE) || 1,
        hasMore: page * DEFAULT_PAGE_SIZE < totalItems,
      },
      filters: {
        status: normalizedStatus ?? null,
        search,
      },
      sort: {
        field: selectedSortField,
        direction: sortDirection,
      },
      meta: {
        availableStatuses: tournamentStatuses,
      },
    });
  } catch (error) {
    console.error("Failed to list tournaments", error);
    return c.json({ error: "Unable to fetch tournaments" }, 500);
  }
});

tournamentsRoute.get("/admin/overview", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [statusCounts, registrationCounts, recentTournaments] =
      await Promise.all([
        db
          .select({
            total: sql<number>`count(*)`,
            upcoming: sql<number>`sum(case when ${tournaments.status} = 'UPCOMING' then 1 else 0 end)`,
            ongoing: sql<number>`sum(case when ${tournaments.status} = 'ONGOING' then 1 else 0 end)`,
            completed: sql<number>`sum(case when ${tournaments.status} = 'COMPLETED' then 1 else 0 end)`,
          })
          .from(tournaments),
        db
          .select({
            total: sql<number>`count(*)`,
          })
          .from(tournamentParticipations),
        db
          .select({
            id: tournaments.id,
            name: tournaments.name,
            status: tournaments.status,
            startDate: tournaments.startDate,
            fieldCount: tournaments.fieldCount,
            registeredTeams: sql<number>`count(${tournamentParticipations.id})`,
          })
          .from(tournaments)
          .leftJoin(
            tournamentParticipations,
            eq(tournamentParticipations.tournamentId, tournaments.id)
          )
          .groupBy(tournaments.id)
          .orderBy(desc(tournaments.createdAt))
          .limit(5),
      ]);

    const statsRow = statusCounts[0];
    const totalRegistrations = registrationCounts[0]?.total ?? 0;

    return c.json({
      stats: {
        totalTournaments: statsRow?.total ?? 0,
        upcoming: statsRow?.upcoming ?? 0,
        ongoing: statsRow?.ongoing ?? 0,
        completed: statsRow?.completed ?? 0,
        totalRegistrations,
      },
      recentTournaments: recentTournaments.map((tournament) => ({
        ...tournament,
        startDate: tournament.startDate?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to load admin overview", error);
    return c.json({ error: "Unable to load admin overview" }, 500);
  }
});

tournamentsRoute.get("/admin/staff", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const staff = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })
      .from(user)
      .where(
        and(eq(user.type, "ORG"), inArray(user.role, tournamentFieldRoles))
      )
      .orderBy(asc(user.name));

    return c.json({ staff });
  } catch (error) {
    console.error("Failed to load staff", error);
    return c.json({ error: "Unable to load staff" }, 500);
  }
});

tournamentsRoute.get("/:identifier", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const [resources, participants, stages, scoreProfile] = await Promise.all([
      db
        .select({
          id: tournamentResources.id,
          title: tournamentResources.title,
          url: tournamentResources.url,
          type: tournamentResources.type,
          description: tournamentResources.description,
        })
        .from(tournamentResources)
        .where(eq(tournamentResources.tournamentId, tournament.id))
        .orderBy(asc(tournamentResources.createdAt)),
      db
        .select({
          id: tournamentParticipations.id,
          notes: tournamentParticipations.notes,
          organizationId: tournamentParticipations.organizationId,
          placement: tournamentParticipations.placement,
          result: tournamentParticipations.result,
          teamName: organizations.name,
          teamSlug: organizations.slug,
          teamLocation: organizations.location,
        })
        .from(tournamentParticipations)
        .leftJoin(
          organizations,
          eq(tournamentParticipations.organizationId, organizations.id)
        )
        .where(eq(tournamentParticipations.tournamentId, tournament.id))
        .orderBy(asc(organizations.name)),
      getStagesResponse(tournament.id),
      tournament.scoreProfileId
        ? getScoreProfileSummary(tournament.scoreProfileId)
        : Promise.resolve<ScoreProfileSummary | null>(null),
    ]);

    const normalizedStages = (stages ?? []).map((stage) => ({
      ...stage,
      matchCount: stage.matches.length,
    }));

    return c.json({
      ...tournament,
      registeredTeams: participants.length,
      participants,
      resources,
      stages: normalizedStages,
      scoreProfile: scoreProfile
        ? {
            id: scoreProfile.id,
            name: scoreProfile.name,
            description: scoreProfile.description,
            definition: scoreProfile.definition,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to fetch tournament", error);
    return c.json({ error: "Unable to fetch tournament" }, 500);
  }
});

tournamentsRoute.get("/:identifier/field-roles", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const assignments = await fetchTournamentFieldAssignments(tournament.id);

    return c.json(buildFieldRolesResponse(tournament, assignments));
  } catch (error) {
    console.error("Failed to fetch field roles", error);
    return c.json({ error: "Unable to fetch field roles" }, 500);
  }
});

tournamentsRoute.put("/:identifier/field-roles", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const body = fieldRoleUpdateSchema.parse(await c.req.json());
    const normalizedFieldCount = normalizeFieldCount(tournament.fieldCount);

    const assignmentMap = new Map<
      number,
      Record<TournamentFieldRole, string | null>
    >();

    for (const assignment of body.assignments) {
      if (assignment.fieldNumber > normalizedFieldCount) {
        return c.json(
          {
            error: `Field ${assignment.fieldNumber} exceeds configured field count (${normalizedFieldCount}).`,
          },
          400
        );
      }
      const normalizedRoles = createEmptyFieldRoleIdState();
      for (const role of tournamentFieldRoles) {
        const rawValue = assignment.roles?.[role];
        if (typeof rawValue === "string" && rawValue.trim().length > 0) {
          normalizedRoles[role] = rawValue.trim();
        } else {
          normalizedRoles[role] = null;
        }
      }
      assignmentMap.set(assignment.fieldNumber, normalizedRoles);
    }

    const userIds = Array.from(
      new Set(
        [...assignmentMap.values()]
          .flatMap((roles) =>
            tournamentFieldRoles.map((role) => roles[role]).filter(Boolean)
          )
          .map((value) => value as string)
      )
    );

    if (userIds.length) {
      const staffRows = await db
        .select({
          id: user.id,
          type: user.type,
          role: user.role,
        })
        .from(user)
        .where(inArray(user.id, userIds));

      const staffMap = new Map(staffRows.map((staff) => [staff.id, staff]));
      for (const userId of userIds) {
        const staff = staffMap.get(userId);
        if (
          !staff ||
          staff.type !== "ORG" ||
          !tournamentFieldRoles.includes(staff.role as TournamentFieldRole)
        ) {
          return c.json(
            {
              error:
                "Assignments must reference tournament staff accounts with eligible roles.",
            },
            400
          );
        }
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(tournamentFieldAssignments)
        .where(eq(tournamentFieldAssignments.tournamentId, tournament.id));

      const insertValues: Array<{
        id: string;
        tournamentId: string;
        fieldNumber: number;
        role: TournamentFieldRole;
        userId: string;
      }> = [];

      for (const [fieldNumber, roles] of assignmentMap.entries()) {
        for (const role of tournamentFieldRoles) {
          const assignedUser = roles[role];
          if (assignedUser) {
            insertValues.push({
              id: crypto.randomUUID(),
              tournamentId: tournament.id,
              fieldNumber,
              role,
              userId: assignedUser,
            });
          }
        }
      }

      if (insertValues.length) {
        await tx.insert(tournamentFieldAssignments).values(insertValues);
      }
    });

    const assignments = await fetchTournamentFieldAssignments(tournament.id);

    return c.json(buildFieldRolesResponse(tournament, assignments));
  } catch (error) {
    console.error("Failed to update field roles", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to update field roles" }, 500);
  }
});

tournamentsRoute.post("/", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const rawBody = await c.req.json();
    const body = tournamentPayloadSchema.parse(rawBody);
    const resolvedScoreProfileId = await resolveScoreProfileId(
      body.scoreProfileId
    );

    const id = crypto.randomUUID();
    const slug = buildSlug(body.name);

    await db.insert(tournaments).values({
      id,
      name: body.name.trim(),
      slug,
      description: body.description?.trim(),
      organizer: body.organizer?.trim(),
      location: body.location?.trim(),
      season: body.season?.trim(),
      status: body.status,
      startDate: parseDate(body.startDate),
      endDate: parseDate(body.endDate),
      registrationDeadline: parseDate(body.registrationDeadline),
      announcement: body.announcement?.trim(),
      fieldCount: normalizeFieldCount(body.fieldCount),
      scoreProfileId: resolvedScoreProfileId,
    });

    if (body.resources.length) {
      await db.insert(tournamentResources).values(
        body.resources.map((resource) => ({
          id: crypto.randomUUID(),
          tournamentId: id,
          title: resource.title.trim(),
          url: resource.url,
          type: resource.type,
          description: resource.description?.trim(),
        }))
      );
    }

    return c.json({
      id,
      slug,
      name: body.name,
      status: body.status,
    });
  } catch (error) {
    console.error("Failed to create tournament", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to create tournament" }, 500);
  }
});

tournamentsRoute.patch("/:identifier", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.role !== "ADMIN") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const body = tournamentUpdateSchema.parse(await c.req.json());
    let resolvedScoreProfileId: string | null | undefined;
    if (body.scoreProfileId !== undefined) {
      resolvedScoreProfileId = await resolveScoreProfileId(body.scoreProfileId);
    }
    const updatePayload = buildUpdatePayload(body, {
      scoreProfileId: resolvedScoreProfileId,
    });

    if (Object.keys(updatePayload).length > 0) {
      await db
        .update(tournaments)
        .set(updatePayload)
        .where(eq(tournaments.id, tournament.id));
    }

    await replaceTournamentResources(tournament.id, body.resources);

    if (body.fieldCount !== undefined) {
      const normalizedFieldCount = normalizeFieldCount(body.fieldCount);
      await db
        .delete(tournamentFieldAssignments)
        .where(
          and(
            eq(tournamentFieldAssignments.tournamentId, tournament.id),
            gt(tournamentFieldAssignments.fieldNumber, normalizedFieldCount)
          )
        );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to update tournament", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to update tournament" }, 500);
  }
});

tournamentsRoute.post("/:identifier/register", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const rawBody = await c.req.json();
    const body = registrationSchema.parse(rawBody);

    const membership = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, body.organizationId),
          eq(organizationMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (!membership.length) {
      return c.json(
        { error: "You must belong to this team to register it." },
        403
      );
    }

    const existing = await db
      .select({ id: tournamentParticipations.id })
      .from(tournamentParticipations)
      .where(
        and(
          eq(tournamentParticipations.tournamentId, tournament.id),
          eq(tournamentParticipations.organizationId, body.organizationId)
        )
      )
      .limit(1);

    if (existing.length) {
      return c.json({ error: "Team already registered" }, 409);
    }

    const participationId = crypto.randomUUID();

    await db.insert(tournamentParticipations).values({
      id: participationId,
      tournamentId: tournament.id,
      organizationId: body.organizationId,
      notes: body.notes?.trim(),
    });

    return c.json({ success: true, id: participationId });
  } catch (error) {
    console.error("Failed to register team", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to register team" }, 500);
  }
});

tournamentsRoute.get("/:identifier/stages", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stages = (await getStagesResponse(tournament.id)) ?? [];
    return c.json({ stages });
  } catch (error) {
    console.error("Failed to list stages", error);
    return c.json({ error: "Unable to list stages" }, 500);
  }
});

tournamentsRoute.get("/:identifier/stages/:stageId", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const stageId = c.req.param("stageId");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await getStagesResponse(tournament.id, stageId);

    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    return c.json({ stage: stage[0] });
  } catch (error) {
    console.error("Failed to fetch stage", error);
    return c.json({ error: "Unable to fetch stage" }, 500);
  }
});

tournamentsRoute.get("/:identifier/stages/:stageId/leaderboard", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const stageId = c.req.param("stageId");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await getStageRecord(tournament.id, stageId);
    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    const url = new URL(c.req.url, "http://localhost");
    const limitParam = Number.parseInt(
      url.searchParams.get("limit") ?? "25",
      10
    );
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 25;

    const orderedIds = await readStageLeaderboardOrder(stage.id, limit);
    let leaderboardRows: StageRankingRow[] = [];

    if (orderedIds.length) {
      const fetchedRows = await fetchStageLeaderboardRows(stage.id, orderedIds);
      const rowMap = new Map(
        fetchedRows.map((row) => [row.organizationId, row])
      );
      leaderboardRows = orderedIds
        .map((organizationId) => rowMap.get(organizationId))
        .filter((row): row is StageRankingRow => Boolean(row));

      if (leaderboardRows.length < limit) {
        const fallback =
          (await fetchStageRankingsMap([stage.id])).get(stage.id) ?? [];
        const existingIds = new Set(
          leaderboardRows.map((row) => row.organizationId)
        );
        for (const entry of fallback) {
          if (existingIds.has(entry.organizationId)) {
            continue;
          }
          leaderboardRows.push(entry);
          if (leaderboardRows.length >= limit) {
            break;
          }
        }
      }
    } else {
      const fallback =
        (await fetchStageRankingsMap([stage.id])).get(stage.id) ?? [];
      leaderboardRows = fallback.slice(0, limit);
    }

    const leaderboard = leaderboardRows.map((ranking) => ({
      teamId: ranking.organizationId,
      name: ranking.teamName,
      slug: ranking.teamSlug,
      logo: ranking.teamLogo,
      location: ranking.teamLocation,
      seed: ranking.seed ?? null,
      rank: ranking.rank,
      gamesPlayed: ranking.gamesPlayed,
      wins: ranking.wins,
      losses: ranking.losses,
      ties: ranking.ties,
      rankingPoints: ranking.rankingPoints,
      autonomousPoints: ranking.autonomousPoints,
      strengthPoints: ranking.strengthPoints,
      totalScore: ranking.totalScore,
      loseRate: ranking.loseRate,
      scoreData: parseScoreData(ranking.scoreData),
    }));

    return c.json({ stageId: stage.id, leaderboard });
  } catch (error) {
    console.error("Failed to load leaderboard", error);
    return c.json({ error: "Unable to load leaderboard" }, 500);
  }
});

tournamentsRoute.get("/:identifier/stages/:stageId/matches", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const stageId = c.req.param("stageId");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await getStageRecord(tournament.id, stageId);
    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    const matchesMap = await fetchStageMatchesMap([stage.id]);
    const matches =
      matchesMap.get(stage.id)?.map(
        (match): StageResponseMatch => ({
          id: match.id,
          round: match.round,
          status: match.status,
          scheduledAt: match.scheduledAt?.toISOString() ?? null,
          home: formatMatchTeam(match, "home"),
          away: formatMatchTeam(match, "away"),
          score: {
            home: match.homeScore,
            away: match.awayScore,
          },
          metadata: parseMatchMetadata(match.metadata),
        })
      ) ?? [];

    return c.json({ stageId: stage.id, matches });
  } catch (error) {
    console.error("Failed to load matches", error);
    return c.json({ error: "Unable to load matches" }, 500);
  }
});

tournamentsRoute.get("/:identifier/stages/:stageId/events", async (c) => {
  try {
    const identifier = c.req.param("identifier");
    const stageId = c.req.param("stageId");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await getStageRecord(tournament.id, stageId);
    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    const subscriber = await createRedisSubscriber();
    const channel = getStageEventChannel(stage.id);
    const encoder = new TextEncoder();
    let cleanup: (() => Promise<void>) | null = null;

    const stream = new ReadableStream({
      start: async (controller) => {
        let closed = false;
        const send = (data: StageEventPayload | Record<string, unknown>) => {
          if (closed) {
            return;
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        const heartbeat = setInterval(() => {
          send({ type: "heartbeat", timestamp: Date.now(), stageId: stage.id });
        }, 25_000);

        const listener = (message: string) => {
          try {
            send(JSON.parse(message));
          } catch {
            send({ type: "message", stageId: stage.id, message });
          }
        };

        const abortHandler = () => {
          cleanup?.();
        };
        c.req.raw.signal.addEventListener("abort", abortHandler);

        cleanup = async () => {
          if (closed) {
            return;
          }
          closed = true;
          clearInterval(heartbeat);
          c.req.raw.signal.removeEventListener("abort", abortHandler);
          try {
            await subscriber.unsubscribe(channel);
          } catch {
            // ignore unsubscribe errors
          }
          subscriber.close();
        };

        c.req.raw.signal.addEventListener("abort", () => {
          cleanup?.();
        });

        try {
          await subscriber.subscribe(channel, listener);
        } catch (error) {
          console.error("Failed to subscribe to stage events", error);
          send({ type: "error", stageId: stage.id });
        }

        send({ type: "connected", timestamp: Date.now(), stageId: stage.id });
      },
      cancel: async () => {
        await cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Failed to open stage event stream", error);
    return c.json({ error: "Unable to subscribe to stage events" }, 500);
  }
});

tournamentsRoute.post("/:identifier/stages", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const payload = stagePayloadSchema.parse(await c.req.json());
    const teamIds = await validateStageTeams(tournament.id, payload.teamIds);
    const stageOrder = await resolveStageOrder(
      tournament.id,
      payload.stageOrder
    );
    const stage = await createStageEntity(tournament.id, payload, stageOrder);
    await assignStageTeams(stage.id, teamIds);
    const generation = await handleStageMatchPreparation(
      stage,
      teamIds,
      payload.generateMatches !== false
    );
    const responseStage = await finalizeStageResponse(
      tournament.id,
      stage.id,
      generation.warnings
    );

    return c.json({ stage: responseStage }, 201);
  } catch (error) {
    console.error("Failed to create stage", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to create stage" }, 500);
  }
});

tournamentsRoute.patch("/:identifier/stages/:stageId", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const stageId = c.req.param("stageId");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await getStageRecord(tournament.id, stageId);
    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    const payload = stageUpdateSchema.parse(await c.req.json());
    enforceTeamRegenerationPolicy(payload);

    if (payload.status === "COMPLETED" && payload.status !== stage.status) {
      await ensureStageIsCompletable(stage.id);
    }

    const updates = buildStageMetadataUpdates(stage, payload);

    if (Object.keys(updates).length) {
      await db
        .update(tournamentStages)
        .set(updates)
        .where(eq(tournamentStages.id, stage.id));
    }

    if (payload.teamIds) {
      const nextTeamIds = await validateStageTeams(
        tournament.id,
        payload.teamIds
      );
      await assignStageTeams(stage.id, nextTeamIds);
    }

    let warnings: string[] | undefined;
    if (shouldRegenerateMatchesOnUpdate(payload)) {
      const refreshedStage =
        (await getStageRecord(tournament.id, stage.id)) ?? stage;
      const teamOrder = await resolveRegenerationOrder(
        stage.id,
        payload.teamIds
      );
      const generation = await regenerateStageMatches(
        refreshedStage,
        teamOrder
      );
      warnings = generation.warnings;
    }

    const responseStage = await finalizeStageResponse(
      tournament.id,
      stage.id,
      warnings
    );

    return c.json({ stage: responseStage });
  } catch (error) {
    console.error("Failed to update stage", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: "Unable to update stage" }, 500);
  }
});

tournamentsRoute.delete("/:identifier/stages/:stageId", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const identifier = c.req.param("identifier");
    const stageId = c.req.param("stageId");
    const tournament = await getTournamentByIdentifier(identifier);

    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const stage = await getStageRecord(tournament.id, stageId);
    if (!stage) {
      return c.json({ error: "Stage not found" }, 404);
    }

    await db
      .delete(tournamentMatches)
      .where(eq(tournamentMatches.stageId, stage.id));
    await db.delete(tournamentStages).where(eq(tournamentStages.id, stage.id));

    await syncStageLeaderboard(stage.id, []);
    await publishStageEvent(stage.id, "stage.updated", { action: "deleted" });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete stage", error);
    return c.json({ error: "Unable to delete stage" }, 500);
  }
});

tournamentsRoute.post(
  "/:identifier/stages/:stageId/generate-matches",
  async (c) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const identifier = c.req.param("identifier");
      const stageId = c.req.param("stageId");
      const tournament = await getTournamentByIdentifier(identifier);

      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const stage = await getStageRecord(tournament.id, stageId);
      if (!stage) {
        return c.json({ error: "Stage not found" }, 404);
      }

      const rawBody = await c.req.json().catch(() => ({}));
      const payload = matchGenerationSchema.parse(rawBody);
      const teamOrder = await ensureValidTeamOrderForGeneration(
        stage.id,
        payload.teamIds
      );
      const refreshedStage =
        (await getStageRecord(tournament.id, stage.id)) ?? stage;
      const generation = await regenerateStageMatches(
        refreshedStage,
        teamOrder
      );
      const responseStage = await finalizeStageResponse(
        tournament.id,
        stage.id,
        generation.warnings
      );

      return c.json({ stage: responseStage });
    } catch (error) {
      console.error("Failed to generate matches", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "Unable to generate matches" }, 500);
    }
  }
);

tournamentsRoute.patch(
  "/:identifier/stages/:stageId/matches/:matchId",
  async (c) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const identifier = c.req.param("identifier");
      const stageId = c.req.param("stageId");
      const matchId = c.req.param("matchId");
      const tournament = await getTournamentByIdentifier(identifier);

      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const stage = await getStageRecord(tournament.id, stageId);
      if (!stage) {
        return c.json({ error: "Stage not found" }, 404);
      }

      const rawBody = await c.req.json().catch(() => ({}));
      const payload = matchUpdateSchema.parse(rawBody);

      const matchRows = await db
        .select({
          id: tournamentMatches.id,
          status: tournamentMatches.status,
          homeTeamId: tournamentMatches.homeTeamId,
          awayTeamId: tournamentMatches.awayTeamId,
          homePlaceholder: tournamentMatches.homePlaceholder,
          awayPlaceholder: tournamentMatches.awayPlaceholder,
          homeScore: tournamentMatches.homeScore,
          awayScore: tournamentMatches.awayScore,
        })
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.id, matchId),
            eq(tournamentMatches.stageId, stage.id)
          )
        )
        .limit(1);

      const match = matchRows[0];
      if (!match) {
        return c.json({ error: "Match not found" }, 404);
      }

      const normalized = normalizeMatchUpdatePayload(match, payload);
      if (!Object.keys(normalized.updates).length) {
        return c.json({ success: true });
      }

      ensureScoresForCompletion(
        normalized.nextStatus,
        normalized.nextHomeScore,
        normalized.nextAwayScore
      );

      await db
        .update(tournamentMatches)
        .set(normalized.updates)
        .where(eq(tournamentMatches.id, match.id));

      if (normalized.nextStatus === "COMPLETED") {
        const refreshedStage =
          (await getStageRecord(tournament.id, stage.id)) ?? stage;
        const outcome = determineMatchOutcome({
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: normalized.nextHomeScore,
          awayScore: normalized.nextAwayScore,
        });
        await propagateMatchOutcome(
          refreshedStage,
          match.id,
          outcome.winner,
          outcome.loser
        );
      }

      await recalculateStageRankings(stage.id);
      await publishStageEvent(stage.id, "matches.updated");

      const responseStage = await finalizeStageResponse(
        tournament.id,
        stage.id
      );

      return c.json({ stage: responseStage });
    } catch (error) {
      console.error("Failed to update match", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "Unable to update match" }, 500);
    }
  }
);

// Get match details by ID
tournamentsRoute.get("/matches/:matchId", async (c) => {
  try {
    const matchId = c.req.param("matchId");

    const matchRows = await db
      .select({
        id: tournamentMatches.id,
        round: tournamentMatches.round,
        status: tournamentMatches.status,
        scheduledAt: tournamentMatches.scheduledAt,
        homeScore: tournamentMatches.homeScore,
        awayScore: tournamentMatches.awayScore,
        metadata: tournamentMatches.metadata,
        homeTeamId: tournamentMatches.homeTeamId,
        homeTeamName: stageHomeTeamAlias.name,
        homeTeamSlug: stageHomeTeamAlias.slug,
        homePlaceholder: tournamentMatches.homePlaceholder,
        awayTeamId: tournamentMatches.awayTeamId,
        awayTeamName: stageAwayTeamAlias.name,
        awayTeamSlug: stageAwayTeamAlias.slug,
        awayPlaceholder: tournamentMatches.awayPlaceholder,
        tournamentId: tournaments.id,
        tournamentName: tournaments.name,
        tournamentSlug: tournaments.slug,
        tournamentLocation: tournaments.location,
        stageId: tournamentStages.id,
        stageName: tournamentStages.name,
        stageType: tournamentStages.type,
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
      .leftJoin(
        tournamentStages,
        eq(tournamentMatches.stageId, tournamentStages.id)
      )
      .leftJoin(tournaments, eq(tournamentMatches.tournamentId, tournaments.id))
      .where(eq(tournamentMatches.id, matchId))
      .limit(1);

    const match = matchRows[0];
    if (!match) {
      return c.json({ error: "Match not found" }, 404);
    }

    const parsedMetadata = match.metadata
      ? (JSON.parse(match.metadata) as MatchScheduleMetadata)
      : null;

    return c.json({
      id: match.id,
      round: match.round,
      status: match.status,
      scheduledAt: match.scheduledAt?.toISOString() ?? null,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      metadata: parsedMetadata,
      home: {
        id: match.homeTeamId,
        name: match.homeTeamName ?? "",
        slug: match.homeTeamSlug,
        placeholder: match.homePlaceholder,
      },
      away: {
        id: match.awayTeamId,
        name: match.awayTeamName ?? "",
        slug: match.awayTeamSlug,
        placeholder: match.awayPlaceholder,
      },
      tournament: {
        id: match.tournamentId ?? "",
        name: match.tournamentName ?? "",
        slug: match.tournamentSlug ?? "",
        location: match.tournamentLocation,
      },
      stage: {
        id: match.stageId ?? "",
        name: match.stageName ?? "",
        type: match.stageType ?? "",
      },
    });
  } catch (error) {
    console.error("Failed to fetch match", error);
    return c.json({ error: "Unable to fetch match" }, 500);
  }
});

// Get available users for field role assignment
tournamentsRoute.get("/:slug/field-roles/users", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.role !== "ADMIN") {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const users = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .orderBy(asc(user.name));

    return c.json({ users });
  } catch (error) {
    console.error("Failed to fetch users", error);
    return c.json({ error: "Unable to fetch users" }, 500);
  }
});

// Get field role assignments for a tournament
tournamentsRoute.get("/:slug/field-roles", async (c) => {
  try {
    const { slug } = c.req.param();

    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.slug, slug))
      .limit(1);

    if (tournament.length === 0) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const tournamentId = tournament[0].id;
    const fieldCount = tournament[0].fieldCount;

    const assignments = await db
      .select({
        id: tournamentFieldAssignments.id,
        fieldNumber: tournamentFieldAssignments.fieldNumber,
        role: tournamentFieldAssignments.role,
        userId: tournamentFieldAssignments.userId,
        userEmail: user.email,
        userName: user.name,
      })
      .from(tournamentFieldAssignments)
      .leftJoin(user, eq(tournamentFieldAssignments.userId, user.id))
      .where(eq(tournamentFieldAssignments.tournamentId, tournamentId));

    return c.json({
      fieldCount,
      assignments: assignments.map((a) => ({
        id: a.id,
        fieldNumber: a.fieldNumber,
        role: a.role,
        user: {
          id: a.userId,
          email: a.userEmail,
          name: a.userName,
        },
      })),
    });
  } catch (error) {
    console.error("Failed to fetch field roles", error);
    return c.json({ error: "Unable to fetch field roles" }, 500);
  }
});

// Assign a user to a field role
tournamentsRoute.post("/:slug/field-roles", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.role !== "ADMIN") {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const { slug } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      userId: z.string(),
      fieldNumber: z.number().int().positive(),
      role: z.enum(tournamentFieldRoles),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error }, 400);
    }

    const { userId, fieldNumber, role } = parsed.data;

    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.slug, slug))
      .limit(1);

    if (tournament.length === 0) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const tournamentId = tournament[0].id;

    if (fieldNumber > tournament[0].fieldCount) {
      return c.json({ error: "Invalid field number" }, 400);
    }

    // Check if user exists
    const userExists = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (userExists.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if assignment already exists
    const existing = await db
      .select()
      .from(tournamentFieldAssignments)
      .where(
        and(
          eq(tournamentFieldAssignments.tournamentId, tournamentId),
          eq(tournamentFieldAssignments.fieldNumber, fieldNumber),
          eq(tournamentFieldAssignments.role, role)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing assignment
      await db
        .update(tournamentFieldAssignments)
        .set({
          userId,
          updatedAt: new Date(),
        })
        .where(eq(tournamentFieldAssignments.id, existing[0].id));

      return c.json({ success: true, id: existing[0].id });
    }

    // Create new assignment
    const assignmentId = crypto.randomUUID();
    await db.insert(tournamentFieldAssignments).values({
      id: assignmentId,
      tournamentId,
      userId,
      fieldNumber,
      role,
    });

    return c.json({ success: true, id: assignmentId }, 201);
  } catch (error) {
    console.error("Failed to assign field role", error);
    return c.json({ error: "Unable to assign field role" }, 500);
  }
});

// Remove a field role assignment
tournamentsRoute.delete("/:slug/field-roles/:assignmentId", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.role !== "ADMIN") {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const { assignmentId } = c.req.param();

    await db
      .delete(tournamentFieldAssignments)
      .where(eq(tournamentFieldAssignments.id, assignmentId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete field role assignment", error);
    return c.json({ error: "Unable to delete assignment" }, 500);
  }
});

export { tournamentsRoute };
