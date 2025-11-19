import type * as OrganizationSchema from "@rms-modern/db/schema/organization";
import type {
  MatchFormat,
  MatchRobotStatus,
  MatchStatus,
  MatchType,
  TournamentFieldRole,
  TournamentStageStatus,
  TournamentStageType,
} from "@rms-modern/db/schema/organization";
// Removed MatchScheduleMetadata as it's unused

export type StageMatchDependency = {
  targetMatchId: string;
  targetSide: "home" | "away";
  source: {
    matchId: string;
    outcome: "WINNER" | "LOSER";
  };
  placeholder: string;
};

export type StageConfiguration = {
  format?: "ROUND_ROBIN" | "DOUBLE_ELIMINATION";
  doubleRoundRobin?: boolean;
  // Add other stage-specific configuration properties here
  [key: string]: unknown;
};

export type MatchMetadataSource = {
  matchId: string;
  outcome: "WINNER" | "LOSER";
  target: "home" | "away";
  label: string;
};

export type MatchMetadata = {
  format?: "ROUND_ROBIN" | "DOUBLE_ELIMINATION";
  label?: string;
  bracket?: "WINNERS" | "LOSERS" | "FINALS";
  roundIndex?: number;
  matchIndex?: number;
  fieldNumber?: number;
  sources?: MatchMetadataSource[];
  status?: MatchStatus; // Added status to metadata
};

export type StageRecord = {
  id: string;
  tournamentId: string;
  name: string;
  type: TournamentStageType;
  status: TournamentStageStatus;
  stageOrder: number;
  configuration: string | null; // Stored as stringified JSON
  scoreProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type StageRecordWithTeams = StageRecord & {
  teams: Array<{
    organizationId: string;
    seed: number | null;
    organization: {
      name: string;
      slug: string;
      logo: string | null;
      location: string | null;
    };
  }>;
};

type ScoreProfileRow = typeof OrganizationSchema.scoreProfiles.$inferSelect;

export type ScoreProfileSummary = Pick<
  ScoreProfileRow,
  "id" | "name" | "description" | "definition"
>;

export type StageMatchSeed = {
  id: string;
  round: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homePlaceholder: string | null;
  awayPlaceholder: string | null;
  metadata: MatchMetadata;
  status: MatchStatus;
  matchType: MatchType;
  format: MatchFormat | null;
};

export type StageGenerationResult = {
  matches: StageMatchSeed[];
  configuration: StageConfiguration;
  warnings?: string[];
};

export type FieldAssignmentRow = {
  id: string;
  fieldNumber: number;
  role: TournamentFieldRole;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
};

export type FieldRoleUser = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

export type FieldRoleField = {
  fieldNumber: number;
  roles: Record<TournamentFieldRole, FieldRoleUser | null>;
};

export type FieldRoleAssignmentResponse = {
  id: string;
  fieldNumber: number;
  role: TournamentFieldRole;
  user: FieldRoleUser | null;
};

export type StageTeamRow = {
  stageId: string;
  organizationId: string;
  seed: number | null;
  createdAt: Date;
  teamName: string | null;
  teamSlug: string | null;
  teamLogo: string | null;
  teamLocation: string | null;
};

export type StageMatchRow = {
  stageId: string | null;
  id: string;
  round: string | null;
  status: MatchStatus;
  matchType: MatchType;
  format: MatchFormat | null;
  scheduledAt: Date | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homePlaceholder: string | null;
  awayPlaceholder: string | null;
  homeScore: number | null;
  awayScore: number | null;
  metadata: string | null;
  robotStatus: MatchRobotStatus | null;
  homeTeamName: string | null;
  homeTeamSlug: string | null;
  homeTeamLogo: string | null;
  awayTeamName: string | null;
  awayTeamSlug: string | null;
  awayTeamLogo: string | null;
};

export type StageRankingRow = {
  stageId: string;
  organizationId: string;
  rank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  rankingPoints: number;
  autonomousPoints: number;
  strengthPoints: number;
  totalScore: number;
  loseRate: number;
  scoreData: string | null;
  teamName: string | null;
  teamSlug: string | null;
  teamLogo: string | null;
  teamLocation: string | null;
  seed: number | null;
};

export type StageResponseTeam = {
  id: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
  location: string | null;
  seed: number | null;
};

export type StageResponseMatch = {
  id: string;
  round: string | null;
  status: MatchStatus;
  matchType: MatchType;
  format: MatchFormat | null;
  robotStatus: MatchRobotStatus | null;
  scheduledAt: string | null;
  home: {
    id: string | null;
    name: string;
    slug: string | null;
    logo: string | null;
    placeholder: string | null;
  };
  away: {
    id: string | null;
    name: string;
    slug: string | null;
    logo: string | null;
    placeholder: string | null;
  };
  score: {
    home: number | null;
    away: number | null;
  };
  metadata?: MatchMetadata;
};

export type StageRankingMatchSummary = {
  matchId: string;
  opponentId: string | null;
  opponentName: string | null;
  scored: number;
  conceded: number;
  status: MatchStatus;
  outcome: "WIN" | "LOSS" | "TIE";
};

export type ScoreData = {
  totalFor: number;
  totalAgainst: number;
  matches: StageRankingMatchSummary[];
};

export type StageResponseRanking = {
  teamId: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
  location: string | null;
  seed: number | null;
  rank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  rankingPoints: number;
  autonomousPoints: number;
  strengthPoints: number;
  totalScore: number;
  loseRate: number;
  scoreData: ScoreData | null;
};

export type StageResponse = {
  id: string;
  name: string;
  type: TournamentStageType;
  status: TournamentStageStatus;
  order: number; // Changed from stageOrder
  scoreProfileId: string | null; // Added scoreProfileId
  configuration: StageConfiguration; // Changed to object type
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  teams: StageResponseTeam[];
  warnings?: string[];
  // Removed fieldCount, matches, rankings as they are aggregated
};
