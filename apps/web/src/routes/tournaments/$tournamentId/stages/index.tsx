import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar,
  ChevronRight,
  RotateCcw,
  ShieldCheck,
  SignalHigh,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DoubleEliminationBracket } from "@/components/double-elimination-bracket";
import Loader from "@/components/loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/date";
import type {
  ScoreProfileModel,
  ScoreProfilesResponse,
} from "@/utils/score-profiles";
import {
  getMatchStatusLabel,
  getStageStatusMeta,
  getStageTypeMeta,
  MATCH_STATUSES,
  type MatchStatus,
  type TournamentStageStatus,
} from "@/utils/stages";

type TournamentSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startDate?: string | null;
  location?: string | null;
  fieldCount?: number;
  scoreProfile?: ScoreProfileModel | null;
};

type StageTeam = {
  id: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
  location: string | null;
  seed: number | null;
};

type StageMatchTeam = {
  id: string | null;
  name: string;
  slug: string | null;
  placeholder: string | null;
  logo: string | null;
};

type MatchMetadataSource = {
  matchId: string;
  outcome: "WINNER" | "LOSER";
  target: "home" | "away";
  label: string;
};

type MatchMetadata = {
  format?: "ROUND_ROBIN" | "DOUBLE_ELIMINATION";
  label?: string | null;
  bracket?: "WINNERS" | "LOSERS" | "FINALS";
  roundIndex?: number | null;
  matchIndex?: number | null;
  fieldNumber?: number | null;
  sources?: MatchMetadataSource[];
};

type StageMatch = {
  id: string;
  round: string | null;
  status: MatchStatus;
  scheduledAt: string | null;
  home: StageMatchTeam;
  away: StageMatchTeam;
  score: {
    home: number | null;
    away: number | null;
  };
  metadata?: MatchMetadata | null;
};

type StageRankingMatchSummary = {
  matchId: string;
  opponentId: string | null;
  opponentName: string | null;
  scored: number;
  conceded: number;
  status: MatchStatus;
  outcome: "WIN" | "LOSS" | "TIE";
};

type ScoreData = {
  totalFor: number;
  totalAgainst: number;
  matches: StageRankingMatchSummary[];
};

type StageRanking = {
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

type Stage = {
  id: string;
  name: string;
  type: string;
  status: TournamentStageStatus;
  stageOrder: number;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  teams: StageTeam[];
  matches: StageMatch[];
  rankings: StageRanking[];
  fieldCount: number;
  warnings?: string[];
};

type StageListResponse = {
  stages: Stage[];
};

const WIN_POINTS = 2;
const TIE_POINTS = 1;

type ScoreProfileAssignmentState = {
  draftValue: string;
  setDraftValue: (value: string) => void;
  options: ScoreProfileModel[];
  loadError: string | null;
  isLoadingOptions: boolean;
  isSaving: boolean;
  isDirty: boolean;
  handleSave: () => void;
};

function useScoreProfileAssignment(
  tournamentId: string,
  currentProfile: ScoreProfileModel | null | undefined,
  isAdmin: boolean
): ScoreProfileAssignmentState {
  const queryClient = useQueryClient();
  const [draftValue, setDraftValue] = useState("");
  const optionsQuery = useQuery<ScoreProfilesResponse>({
    queryKey: ["score-profiles"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load score profiles.");
      }
      return response.json() as Promise<ScoreProfilesResponse>;
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    const nextProfileId = currentProfile?.id ?? "";
    setDraftValue((previous) =>
      previous === nextProfileId ? previous : nextProfileId
    );
  }, [currentProfile?.id]);

  const updateScoreProfile = useMutation({
    mutationFn: async (scoreProfileId: string | null) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ scoreProfileId }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to update score profile.");
      }
      return response.json();
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables ? "Score profile assigned." : "Score profile cleared."
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tournament", tournamentId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["tournament-stages", tournamentId],
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update score profile."
      );
    },
  });

  const loadError =
    optionsQuery.error instanceof Error ? optionsQuery.error.message : null;
  const options = optionsQuery.data?.items ?? [];
  const isDirty = (currentProfile?.id ?? "") !== draftValue;

  const handleSave = () => {
    if (!(isAdmin && isDirty)) {
      return;
    }
    updateScoreProfile.mutate(draftValue ? draftValue : null);
  };

  return {
    draftValue,
    setDraftValue,
    options,
    loadError,
    isLoadingOptions: optionsQuery.isPending,
    isSaving: updateScoreProfile.isPending,
    isDirty,
    handleSave,
  };
}

const SCORE_PROFILE_WARNING_MESSAGE =
  "Assign a score profile in tournament settings before generating matches so scoring stays consistent.";

type TournamentSettingsCardProps = {
  currentProfile: ScoreProfileModel | null;
  draftValue: string;
  options: ScoreProfileModel[];
  isAdmin: boolean;
  isDirty: boolean;
  isLoadingOptions: boolean;
  isSaving: boolean;
  loadError: string | null;
  warningVisible: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
};

function TournamentSettingsCard({
  currentProfile,
  draftValue,
  options,
  isAdmin,
  isDirty,
  isLoadingOptions,
  isSaving,
  loadError,
  warningVisible,
  onDraftChange,
  onSave,
}: TournamentSettingsCardProps) {
  const canSave = isAdmin && isDirty && !isSaving;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Score profile</CardTitle>
          <CardDescription>
            Apply a scoring definition to every match in this tournament.
          </CardDescription>
        </div>
        <Badge variant={currentProfile ? "secondary" : "outline"}>
          {currentProfile ? "Assigned" : "Unassigned"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {warningVisible && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            {SCORE_PROFILE_WARNING_MESSAGE}
          </div>
        )}
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground text-xs">Current profile</p>
          <p className="font-semibold">
            {currentProfile ? currentProfile.name : "None"}
          </p>
          {currentProfile && (
            <p className="text-muted-foreground text-xs">
              Version {currentProfile.definition.version}
            </p>
          )}
          {currentProfile?.description && (
            <p className="text-muted-foreground text-xs">
              {currentProfile.description}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            disabled={!isAdmin || isLoadingOptions || isSaving}
            onChange={(event) => onDraftChange(event.target.value)}
            value={draftValue}
          >
            <option value="">No score profile</option>
            {options.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} (v{profile.definition.version})
              </option>
            ))}
          </Select>
          <Button disabled={!canSave} onClick={onSave} size="sm" type="button">
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
        {loadError && <p className="text-destructive text-xs">{loadError}</p>}
        {isLoadingOptions && (
          <p className="text-muted-foreground text-xs">Loading profiles…</p>
        )}
      </CardContent>
    </Card>
  );
}

type StageUpdatePayload = {
  stageId: string;
  status: TournamentStageStatus;
};

type MatchUpdatePayload = {
  stageId: string;
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
};

export const Route = createFileRoute("/tournaments/$tournamentId/stages/")({
  component: TournamentStagesPage,
});

function useTournament(tournamentId: string) {
  return useQuery<TournamentSummary>({
    queryKey: ["tournament", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tournament.");
      }
      const data = (await response.json()) as TournamentSummary;
      return data;
    },
  });
}

function useStages(tournamentId: string) {
  return useQuery<StageListResponse>({
    queryKey: ["tournament-stages", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to load stages.");
      }
      return response.json() as Promise<StageListResponse>;
    },
  });
}

function TournamentStagesPage() {
  const { tournamentId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  const tournamentQuery = useTournament(tournamentId);
  const stagesQuery = useStages(tournamentId);

  const generateMatches = useMutation({
    mutationFn: async (stageId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}/generate-matches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to generate matches.");
      }
      return response.json() as Promise<{ stage: Stage }>;
    },
    onSuccess: async () => {
      toast.success("Matches regenerated.");
      await queryClient.invalidateQueries({
        queryKey: ["tournament-stages", tournamentId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to generate matches."
      );
    },
  });
  const tournament = tournamentQuery.data;
  const stages = stagesQuery.data?.stages ?? [];

  const {
    draftValue: scoreProfileDraft,
    setDraftValue: setScoreProfileDraft,
    options: scoreProfileOptions,
    loadError: scoreProfilesError,
    isLoadingOptions: scoreProfileLoading,
    isSaving: scoreProfileSaving,
    isDirty: scoreProfileDirty,
    handleSave: handleSaveScoreProfile,
  } = useScoreProfileAssignment(
    tournamentId,
    tournament?.scoreProfile,
    isAdmin
  );

  const handleGenerateMatches = (stageId: string) => {
    if (!tournament?.scoreProfile) {
      toast.warning(SCORE_PROFILE_WARNING_MESSAGE);
    }
    generateMatches.mutate(stageId);
  };

  const updateStageStatus = useMutation({
    mutationFn: async ({ stageId, status }: StageUpdatePayload) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to update stage status.");
      }
      return response.json() as Promise<{ stage: Stage }>;
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables.status === "COMPLETED"
          ? "Stage marked as completed."
          : "Stage updated."
      );
      await queryClient.invalidateQueries({
        queryKey: ["tournament-stages", tournamentId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to update stage."
      );
    },
  });

  const updateMatch = useMutation({
    mutationFn: async (payload: MatchUpdatePayload) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${payload.stageId}/matches/${payload.matchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            homeScore: payload.homeScore,
            awayScore: payload.awayScore,
            status: payload.status,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to update match.");
      }
      return response.json() as Promise<{ stage: Stage }>;
    },
    onMutate: (variables) => {
      setPendingMatchId(variables.matchId);
    },
    onSuccess: async () => {
      toast.success("Match updated.");
      await queryClient.invalidateQueries({
        queryKey: ["tournament-stages", tournamentId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to update match."
      );
    },
    onSettled: () => {
      setPendingMatchId(null);
    },
  });

  if (tournamentQuery.isPending || stagesQuery.isPending) {
    return <Loader />;
  }

  if (tournamentQuery.error || stagesQuery.error) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load stage data</CardTitle>
            <CardDescription>
              {(tournamentQuery.error ?? stagesQuery.error) instanceof Error
                ? (tournamentQuery.error ?? stagesQuery.error)?.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const warningVisible = !tournament?.scoreProfile;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            <Link
              className="underline"
              search={{
                page: 1,
                search: "",
                status: "ALL",
                sortField: "createdAt",
                sortDirection: "desc",
              }}
              to="/tournaments"
            >
              Tournaments
            </Link>{" "}
            <ChevronRight className="inline h-3 w-3" /> {tournament?.name}
          </p>
          <h1 className="font-bold text-3xl">Tournament stages</h1>
          <p className="text-muted-foreground">
            Track every competition phase, participating teams, and generated
            matches.{" "}
            {tournament?.fieldCount
              ? `Configured for ${tournament.fieldCount} fields.`
              : null}
          </p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link
              params={{ tournamentId }}
              search={{
                page: 1,
                search: "",
                status: "ALL",
                sortField: "createdAt",
                sortDirection: "desc",
              }}
              to="/tournaments/$tournamentId/stages/new"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Create stage
            </Link>
          </Button>
        )}
      </div>

      <TournamentSettingsCard
        currentProfile={tournament?.scoreProfile ?? null}
        draftValue={scoreProfileDraft}
        isAdmin={isAdmin}
        isDirty={scoreProfileDirty}
        isLoadingOptions={scoreProfileLoading}
        isSaving={scoreProfileSaving}
        loadError={scoreProfilesError}
        onDraftChange={setScoreProfileDraft}
        onSave={handleSaveScoreProfile}
        options={scoreProfileOptions}
        warningVisible={warningVisible}
      />

      {stages.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No stages defined yet</CardTitle>
            <CardDescription>
              Build your first stage to start organizing rounds and matches.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        stages
          .slice()
          .sort((a, b) => a.stageOrder - b.stageOrder)
          .map((stage) => (
            <StageCard
              isAdmin={isAdmin}
              isMutating={
                generateMatches.isPending ||
                updateStageStatus.isPending ||
                updateMatch.isPending
              }
              key={stage.id}
              onGenerateMatches={() => handleGenerateMatches(stage.id)}
              onUpdateMatch={(payload) =>
                updateMatch.mutate({
                  stageId: stage.id,
                  matchId: payload.matchId,
                  homeScore: payload.homeScore,
                  awayScore: payload.awayScore,
                  status: payload.status,
                })
              }
              onUpdateStatus={(status) =>
                updateStageStatus.mutate({ stageId: stage.id, status })
              }
              pendingMatchId={pendingMatchId}
              stage={stage}
              tournamentId={tournamentId}
            />
          ))
      )}
    </div>
  );
}

type StageCardProps = {
  stage: Stage;
  isAdmin: boolean;
  isMutating: boolean;
  pendingMatchId: string | null;
  tournamentId: string;
  onGenerateMatches: () => void;
  onUpdateStatus: (status: TournamentStageStatus) => void;
  onUpdateMatch: (payload: {
    matchId: string;
    homeScore: number | null;
    awayScore: number | null;
    status: MatchStatus;
  }) => void;
};

function StageCard({
  stage,
  isAdmin,
  isMutating,
  pendingMatchId,
  tournamentId,
  onGenerateMatches,
  onUpdateMatch,
  onUpdateStatus,
}: StageCardProps) {
  const statusMeta = getStageStatusMeta(stage.status);
  const typeMeta = getStageTypeMeta(stage.type);
  const canComplete = stage.matches.length > 0;
  const stageRankings = stage.rankings ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CardTitle>{stage.name}</CardTitle>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
          </div>
          <CardDescription>
            {typeMeta.label} — {typeMeta.description}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              params={{ stageId: stage.id, tournamentId }}
              search={{}}
              to="/tournaments/$tournamentId/stages/$stageId/live"
            >
              <SignalHigh className="mr-2 h-4 w-4" />
              Live view
            </Link>
          </Button>
          {isAdmin && (
            <Button
              disabled={isMutating}
              onClick={onGenerateMatches}
              size="sm"
              variant="outline"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Regenerate matches
            </Button>
          )}
          {isAdmin && stage.status !== "COMPLETED" && canComplete && (
            <Button
              disabled={isMutating}
              onClick={() => onUpdateStatus("COMPLETED")}
              size="sm"
              variant="secondary"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Mark completed
            </Button>
          )}
          {isAdmin && (
            <Button asChild size="sm" variant="ghost">
              <Link
                params={{ stageId: stage.id, tournamentId }}
                search={{}}
                to="/tournaments/$tournamentId/stages/$stageId/edit"
              >
                Edit stage
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {stage.warnings?.length ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            {stage.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-sm">Stage order</p>
            <p className="font-semibold text-2xl">{stage.stageOrder}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-sm">Teams</p>
            <p className="font-semibold text-2xl">{stage.teams.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-sm">Match template</p>
            <p className="text-sm">{typeMeta.matchHint}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground text-sm">Fields</p>
            <p className="font-semibold text-2xl">{stage.fieldCount}</p>
          </div>
        </div>

        <Tabs className="space-y-4" defaultValue="teams">
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-md border p-1">
            <TabsTrigger className="rounded-md" value="teams">
              Teams
            </TabsTrigger>
            <TabsTrigger className="rounded-md" value="matches">
              Matches
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6" value="teams">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-lg">Rankings</h3>
                <p className="text-muted-foreground text-xs">
                  Win = {WIN_POINTS} pts, tie = {TIE_POINTS} pt. Sorted by
                  points, total score, then lose rate.
                </p>
              </div>
              {stageRankings.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Add teams to show rankings.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs uppercase">
                        <th className="px-3 py-2 text-left font-medium">
                          Rank
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Team
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Record
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Points
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Total score
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Lose rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageRankings.map((entry, index) => (
                        <tr
                          className="border-b last:border-0"
                          key={entry.teamId}
                        >
                          <td className="px-3 py-2 text-muted-foreground text-xs">
                            {entry.rank ?? index + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                {entry.logo ? (
                                  <AvatarImage
                                    alt={entry.name ?? "Team"}
                                    src={entry.logo}
                                  />
                                ) : (
                                  <AvatarFallback>
                                    {entry.name?.slice(0, 2).toUpperCase() ??
                                      "??"}
                                  </AvatarFallback>
                                )}
                              </Avatar>
                              <div>
                                <p className="font-medium">
                                  {entry.name ?? "Unknown"}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {entry.slug ?? "Unregistered"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {entry.wins}-{entry.losses}-{entry.ties}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {entry.gamesPlayed} played
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {entry.rankingPoints}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {entry.totalScore}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {entry.gamesPlayed === 0
                              ? "—"
                              : `${Math.round(entry.loseRate * 100)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="mb-2 font-semibold text-lg">Teams</h3>
                <p className="text-muted-foreground text-sm">
                  {stage.teams.length} rostered
                </p>
              </div>
              {stage.teams.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No teams assigned.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs uppercase">
                        <th className="px-3 py-2 text-left font-medium">
                          Seed
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Team
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Location
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stage.teams
                        .slice()
                        .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
                        .map((team) => (
                          <tr className="border-b last:border-0" key={team.id}>
                            <td className="px-3 py-2 text-muted-foreground">
                              {team.seed ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  {team.logo ? (
                                    <AvatarImage
                                      alt={team.name ?? "Team"}
                                      src={team.logo}
                                    />
                                  ) : (
                                    <AvatarFallback>
                                      {team.name?.slice(0, 2).toUpperCase() ??
                                        "??"}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <div>
                                  <p className="font-medium">
                                    {team.name ?? "Unknown"}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    {team.slug ?? "Unregistered"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {team.location ?? "TBD"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-lg">Schedule</h3>
              <div className="space-y-2 text-muted-foreground text-sm">
                <p>
                  <Calendar className="mr-2 inline h-4 w-4" />
                  Starts: {formatDateTime(stage.startedAt)}
                </p>
                <p>
                  <Calendar className="mr-2 inline h-4 w-4" />
                  Completed: {formatDateTime(stage.completedAt)}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="space-y-6" value="matches">
            {stage.type === "FINAL_DOUBLE_ELIMINATION" &&
            stage.matches.length > 0 ? (
              <DoubleEliminationBracket matches={stage.matches} />
            ) : null}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-lg">Matches</h3>
                {stage.matches.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    {stage.matches.length} scheduled
                  </p>
                )}
              </div>
              {stage.matches.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No matches generated yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs uppercase">
                        <th className="px-2 py-2 text-left font-medium">
                          Round
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Field
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Match #
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Team 1
                        </th>
                        <th className="px-2 py-2 text-right font-medium">
                          Team 1 Score
                        </th>
                        <th className="px-2 py-2 text-right font-medium">
                          Team 2 Score
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Team 2
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Start time
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Status
                        </th>
                        {isAdmin && (
                          <th className="px-2 py-2 text-left font-medium">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {stage.matches.map((match) => (
                        <MatchRow
                          isAdmin={isAdmin}
                          isPending={pendingMatchId === match.id && isMutating}
                          key={match.id}
                          match={match}
                          onSave={(payload) =>
                            onUpdateMatch({
                              matchId: match.id,
                              homeScore: payload.homeScore,
                              awayScore: payload.awayScore,
                              status: payload.status,
                            })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

type MatchRowProps = {
  match: StageMatch;
  isAdmin: boolean;
  isPending: boolean;
  onSave: (payload: {
    homeScore: number | null;
    awayScore: number | null;
    status: MatchStatus;
  }) => void;
};

function MatchRow({ match, isAdmin, isPending, onSave }: MatchRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [homeScore, setHomeScore] = useState(
    match.score.home?.toString() ?? ""
  );
  const [awayScore, setAwayScore] = useState(
    match.score.away?.toString() ?? ""
  );
  const [status, setStatus] = useState<MatchStatus>(match.status);

  const homeDisplay = useMemo(
    () => match.home.name ?? match.home.placeholder ?? "TBD",
    [match.home.name, match.home.placeholder]
  );
  const awayDisplay = useMemo(
    () => match.away.name ?? match.away.placeholder ?? "TBD",
    [match.away.name, match.away.placeholder]
  );

  const homeScoreValue = match.score.home;
  const awayScoreValue = match.score.away;
  const winner =
    homeScoreValue != null && awayScoreValue != null
      ? homeScoreValue > awayScoreValue
        ? "home"
        : homeScoreValue < awayScoreValue
          ? "away"
          : null
      : null;

  const homeScoreClasses = cn(
    "px-2 py-3 text-right font-semibold",
    winner === "home"
      ? "rounded-md bg-destructive/10 text-destructive-foreground"
      : "text-muted-foreground"
  );
  const awayScoreClasses = cn(
    "px-2 py-3 text-right font-semibold",
    winner === "away"
      ? "rounded-md bg-sky-100 text-sky-900"
      : "text-muted-foreground"
  );

  const saveDraft = () => {
    const nextHome = homeScore === "" ? null : Number(homeScore);
    const nextAway = awayScore === "" ? null : Number(awayScore);
    onSave({
      homeScore: Number.isNaN(nextHome) ? null : nextHome,
      awayScore: Number.isNaN(nextAway) ? null : nextAway,
      status,
    });
    setIsEditing(false);
  };

  const resetDraft = () => {
    setHomeScore(match.score.home?.toString() ?? "");
    setAwayScore(match.score.away?.toString() ?? "");
    setStatus(match.status);
    setIsEditing(false);
  };

  return (
    <tr className="border-b last:border-0">
      <td className="px-2 py-3 text-muted-foreground text-xs">
        {match.round ?? "Unassigned"}
      </td>
      <td className="px-2 py-3 text-muted-foreground text-xs">
        {match.metadata?.fieldNumber
          ? `Field ${match.metadata.fieldNumber}`
          : "—"}
      </td>
      <td className="px-2 py-3 text-muted-foreground text-xs">
        {match.metadata?.matchIndex ?? "—"}
      </td>
      <td className="px-2 py-3 font-medium">{homeDisplay}</td>
      <td className={homeScoreClasses}>
        {isEditing ? (
          <Input
            className="w-16 text-right"
            disabled={isPending}
            inputMode="numeric"
            min={0}
            onChange={(event) => setHomeScore(event.target.value)}
            type="number"
            value={homeScore}
          />
        ) : (
          (match.score.home ?? "—")
        )}
      </td>
      <td className={awayScoreClasses}>
        {isEditing ? (
          <Input
            className="w-16 text-right"
            disabled={isPending}
            inputMode="numeric"
            min={0}
            onChange={(event) => setAwayScore(event.target.value)}
            type="number"
            value={awayScore}
          />
        ) : (
          (match.score.away ?? "—")
        )}
      </td>
      <td className="px-2 py-3 font-medium">{awayDisplay}</td>
      <td className="px-2 py-3 text-muted-foreground text-xs">
        {formatDateTime(match.scheduledAt)}
      </td>
      <td className="px-2 py-3">
        {isEditing ? (
          <Select
            disabled={isPending}
            onChange={(event) => setStatus(event.target.value as MatchStatus)}
            value={status}
          >
            {MATCH_STATUSES.map((item) => (
              <option key={item} value={item}>
                {getMatchStatusLabel(item)}
              </option>
            ))}
          </Select>
        ) : (
          <Badge variant="outline">{getMatchStatusLabel(match.status)}</Badge>
        )}
      </td>
      {isAdmin && (
        <td className="px-2 py-3">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Button
                disabled={isPending}
                onClick={saveDraft}
                size="sm"
                variant="secondary"
              >
                Save
              </Button>
              <Button
                disabled={isPending}
                onClick={resetDraft}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              disabled={isPending}
              onClick={() => setIsEditing(true)}
              size="sm"
              variant="ghost"
            >
              Update
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}
