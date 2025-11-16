import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, ListOrdered, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/date";
import {
  getMatchStatusLabel,
  getStageStatusMeta,
  getStageTypeMeta,
  type MatchStatus,
  type TournamentStageStatus,
  type TournamentStageType,
} from "@/utils/stages";

type StageSummary = {
  id: string;
  name: string;
  status: TournamentStageStatus;
  type: TournamentStageType;
  stageOrder: number;
  fieldCount: number;
  teamCount: number;
};

type StageSummaryResponse = {
  stage: StageSummary;
};

type LeaderboardEntry = {
  teamId: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
  location: string | null;
  seed: number | null;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  rankingPoints: number;
  totalScore: number;
  loseRate: number;
};

type LeaderboardResponse = {
  stageId: string;
  leaderboard: LeaderboardEntry[];
};

type StageMatchTeam = {
  id: string | null;
  name: string;
  slug: string | null;
  placeholder: string | null;
  logo: string | null;
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
  metadata?: {
    fieldNumber?: number | null;
    matchIndex?: number | null;
    label?: string | null;
  } | null;
};

type MatchesResponse = {
  stageId: string;
  matches: StageMatch[];
};

type StageEventMessage = {
  type?:
    | "leaderboard.updated"
    | "matches.updated"
    | "stage.updated"
    | "connected"
    | "heartbeat"
    | "error";
};

type LiveStreamStatus = "connecting" | "connected" | "error";

function useStageDetails(tournamentId: string, stageId: string) {
  return useQuery<StageSummary>({
    queryKey: ["stage-detail", tournamentId, stageId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load stage details.");
      }
      const payload = (await response.json()) as StageSummaryResponse;
      return payload.stage;
    },
  });
}

function useStageLeaderboard(tournamentId: string, stageId: string) {
  return useQuery<LeaderboardResponse>({
    queryKey: ["stage-leaderboard", tournamentId, stageId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}/leaderboard?limit=100`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load leaderboard.");
      }
      return response.json() as Promise<LeaderboardResponse>;
    },
  });
}

function useStageMatches(tournamentId: string, stageId: string) {
  return useQuery<MatchesResponse>({
    queryKey: ["stage-matches", tournamentId, stageId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}/matches`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load matches.");
      }
      return response.json() as Promise<MatchesResponse>;
    },
  });
}

function useStageEventStream(
  tournamentId: string,
  stageId: string,
  setStatus: (next: LiveStreamStatus) => void
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setStatus("connecting");
    const eventUrl = `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}/events`;
    const source = new EventSource(eventUrl, { withCredentials: true });

    source.onmessage = (event) => {
      if (!event.data) {
        return;
      }
      try {
        const payload = JSON.parse(event.data) as StageEventMessage;
        if (payload.type === "connected") {
          setStatus("connected");
          return;
        }
        if (payload.type === "heartbeat") {
          return;
        }
        if (payload.type === "leaderboard.updated") {
          queryClient.invalidateQueries({
            queryKey: ["stage-leaderboard", tournamentId, stageId],
          });
        }
        if (payload.type === "matches.updated") {
          queryClient.invalidateQueries({
            queryKey: ["stage-matches", tournamentId, stageId],
          });
        }
        if (payload.type === "stage.updated") {
          queryClient.invalidateQueries({
            queryKey: ["stage-detail", tournamentId, stageId],
          });
          queryClient.invalidateQueries({
            queryKey: ["stage-matches", tournamentId, stageId],
          });
        }
        if (payload.type === "error") {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    };

    source.onerror = () => {
      setStatus("error");
    };

    return () => {
      source.close();
    };
  }, [queryClient, setStatus, stageId, tournamentId]);
}

export const Route = createFileRoute(
  "/tournaments/$tournamentId/stages/$stageId/live"
)({
  component: StageLiveView,
});

const streamStatusMeta: Record<
  LiveStreamStatus,
  { label: string; className: string }
> = {
  connecting: { label: "Connecting…", className: "bg-muted-foreground/60" },
  connected: { label: "Live", className: "bg-emerald-500" },
  error: { label: "Reconnecting…", className: "bg-destructive" },
};

function StageLiveView() {
  const { tournamentId, stageId } = Route.useParams();
  const stageQuery = useStageDetails(tournamentId, stageId);
  const leaderboardQuery = useStageLeaderboard(tournamentId, stageId);
  const matchesQuery = useStageMatches(tournamentId, stageId);
  const [streamStatus, setStreamStatus] =
    useState<LiveStreamStatus>("connecting");

  useStageEventStream(tournamentId, stageId, setStreamStatus);

  if (
    stageQuery.isPending ||
    leaderboardQuery.isPending ||
    matchesQuery.isPending
  ) {
    return <Loader />;
  }

  if (stageQuery.error || leaderboardQuery.error || matchesQuery.error) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load live view</CardTitle>
            <CardDescription>
              {stageQuery.error instanceof Error
                ? stageQuery.error.message
                : leaderboardQuery.error instanceof Error
                  ? leaderboardQuery.error.message
                  : matchesQuery.error instanceof Error
                    ? matchesQuery.error.message
                    : "Try refreshing the page."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stage = stageQuery.data;
  const leaderboard = leaderboardQuery.data?.leaderboard ?? [];
  const matches = matchesQuery.data?.matches ?? [];
  const statusMeta = getStageStatusMeta(stage?.status);
  const typeMeta = getStageTypeMeta(stage?.type);
  const streamMeta = streamStatusMeta[streamStatus];

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            <Link
              className="inline-flex items-center gap-1 underline"
              params={{ tournamentId }}
              search={{}}
              to="/tournaments/$tournamentId/stages/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to stages
            </Link>
          </p>
          <h1 className="mt-2 font-bold text-3xl">
            {stage?.name ?? "Live stage view"}
          </h1>
          <p className="text-muted-foreground">
            {typeMeta.description} · Field count: {stage?.fieldCount ?? "—"}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 text-sm md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span
              className={cn("h-2.5 w-2.5 rounded-full", streamMeta.className)}
            />
            <span>{streamMeta.label}</span>
          </div>
          <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
          <p className="text-muted-foreground text-xs">
            Stage order: {stage?.stageOrder ?? "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Trophy className="h-5 w-5 text-amber-500" />
                Live leaderboard
              </CardTitle>
              <CardDescription>
                Sorted by ranking points, total score, and lose rate.
              </CardDescription>
            </div>
            <Badge variant="outline">{leaderboard.length} teams</Badge>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Rankings will appear once at least one match is scored.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs uppercase">
                      <th className="px-3 py-2 text-left">Rank</th>
                      <th className="px-3 py-2 text-left">Team</th>
                      <th className="px-3 py-2 text-left">Record</th>
                      <th className="px-3 py-2 text-right">Points</th>
                      <th className="px-3 py-2 text-right">Total score</th>
                      <th className="px-3 py-2 text-right">Lose rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => (
                      <tr className="border-b last:border-0" key={entry.teamId}>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {entry.rank}
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
                                {entry.name ?? "Unknown team"}
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
                        <td className="px-3 py-2 text-right">
                          {entry.totalScore}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(entry.loseRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ListOrdered className="h-5 w-5 text-sky-500" />
                Matches
              </CardTitle>
              <CardDescription>
                Automatically refreshes whenever a match is updated.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link
                params={{ stageId, tournamentId }}
                search={{}}
                to="/tournaments/$tournamentId/stages/$stageId"
              >
                <Activity className="mr-2 h-4 w-4" />
                Manage stage
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {matches.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Matches will appear here once they are generated.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs uppercase">
                      <th className="px-2 py-2 text-left">Round</th>
                      <th className="px-2 py-2 text-left">Field</th>
                      <th className="px-2 py-2 text-left">Match</th>
                      <th className="px-2 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-left">Schedule</th>
                      <th className="px-2 py-2 text-left">Home</th>
                      <th className="px-2 py-2 text-left">Away</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match) => {
                      const homeScore = match.score.home;
                      const awayScore = match.score.away;
                      const winner =
                        homeScore != null && awayScore != null
                          ? homeScore > awayScore
                            ? "home"
                            : homeScore < awayScore
                              ? "away"
                              : null
                          : null;
                      const statusLabel = getMatchStatusLabel(match.status);
                      const scheduledDisplay = match.scheduledAt
                        ? formatDateTime(new Date(match.scheduledAt))
                        : "TBD";

                      return (
                        <tr className="border-b last:border-0" key={match.id}>
                          <td className="px-2 py-3 text-muted-foreground text-xs">
                            {match.round ?? "—"}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground text-xs">
                            {match.metadata?.fieldNumber
                              ? `Field ${match.metadata.fieldNumber}`
                              : "—"}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground text-xs">
                            {match.metadata?.label ??
                              match.metadata?.matchIndex ??
                              "—"}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground text-xs">
                            {statusLabel}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground text-xs">
                            {scheduledDisplay}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p
                                  className={cn(
                                    "font-medium",
                                    winner === "home"
                                      ? "text-destructive"
                                      : "text-foreground"
                                  )}
                                >
                                  {match.home.name}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {match.home.slug ??
                                    match.home.placeholder ??
                                    "—"}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "text-right font-semibold text-sm",
                                  winner === "home"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                )}
                              >
                                {homeScore ?? "—"}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p
                                  className={cn(
                                    "font-medium",
                                    winner === "away"
                                      ? "text-sky-600"
                                      : "text-foreground"
                                  )}
                                >
                                  {match.away.name}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {match.away.slug ??
                                    match.away.placeholder ??
                                    "—"}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "text-right font-semibold text-sm",
                                  winner === "away"
                                    ? "text-sky-600"
                                    : "text-muted-foreground"
                                )}
                              >
                                {awayScore ?? "—"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
