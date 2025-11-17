import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Calendar, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Loader from "@/components/loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/date";
import {
  getMatchStatusLabel,
  getStageStatusMeta,
  getStageTypeMeta,
  type MatchStatus,
  type TournamentStageStatus,
} from "@/utils/stages";

type TournamentListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startDate?: string | null;
};

type TournamentListResponse = {
  items: TournamentListItem[];
};

type StageTeam = {
  id: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
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
  metadata?: {
    fieldNumber?: number | null;
    matchIndex?: number | null;
    label?: string | null;
  } | null;
  home: StageMatchTeam;
  away: StageMatchTeam;
  score: {
    home: number | null;
    away: number | null;
  };
};

type MatchRow = StageMatch & {
  stageName: string;
};

type StageRanking = {
  teamId: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
  rank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  rankingPoints: number;
  totalScore: number;
  loseRate: number;
};

type Stage = {
  id: string;
  name: string;
  status: TournamentStageStatus;
  type: string;
  stageOrder: number;
  matches: StageMatch[];
  rankings: StageRanking[];
  teams: StageTeam[];
  fieldCount: number;
};

type StageListResponse = {
  stages: Stage[];
};

function useTournamentList() {
  return useQuery<TournamentListResponse>({
    queryKey: ["live-results-tournaments"],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        sortBy: "startDate",
        sortDirection: "asc",
      });
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments?${params.toString()}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load tournaments.");
      }
      return response.json() as Promise<TournamentListResponse>;
    },
    staleTime: 60_000,
  });
}

function useTournamentStages(tournamentId?: string | null) {
  return useQuery<StageListResponse>({
    queryKey: ["live-results-stages", tournamentId],
    queryFn: async () => {
      if (!tournamentId) {
        throw new Error("Tournament not selected.");
      }
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load stage data.");
      }
      return response.json() as Promise<StageListResponse>;
    },
    enabled: Boolean(tournamentId),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export const Route = createFileRoute("/results/")({
  component: ResultsPage,
});

function getWinner(score: {
  home: number | null;
  away: number | null;
}): "home" | "away" | null {
  if (score.home === null || score.away === null) {
    return null;
  }
  if (score.home > score.away) {
    return "home";
  }
  if (score.home < score.away) {
    return "away";
  }
  return null;
}

function MatchRowItem({ match }: { match: MatchRow }) {
  const scheduled = match.scheduledAt
    ? formatDateTime(new Date(match.scheduledAt))
    : "TBD";
  const fieldLabel = match.metadata?.fieldNumber
    ? `Field ${match.metadata.fieldNumber}`
    : "—";
  const matchLabel =
    match.metadata?.label ??
    (match.metadata?.matchIndex
      ? `Match ${match.metadata.matchIndex}`
      : (match.round ?? "Unassigned"));
  const winner = getWinner(match.score);
  const statusLabel = getMatchStatusLabel(match.status);
  return (
    <tr className="border-b last:border-0" key={match.id}>
      <td className="px-2 py-3">
        <div className="flex flex-col">
          <span className="font-medium">{scheduled}</span>
          <span className="text-muted-foreground text-xs">{statusLabel}</span>
        </div>
      </td>
      <td className="px-2 py-3 text-muted-foreground text-xs">{fieldLabel}</td>
      <td className="px-2 py-3">
        <div className="flex flex-col">
          <span className="font-semibold">{matchLabel}</span>
          <span className="text-muted-foreground text-xs">
            {match.stageName}
          </span>
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {match.home.logo ? (
              <AvatarImage alt={match.home.name} src={match.home.logo} />
            ) : (
              <AvatarFallback>
                {match.home.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <p className="font-medium">{match.home.name}</p>
            <p className="text-muted-foreground text-xs">
              {match.home.slug ?? match.home.placeholder ?? "—"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center justify-center gap-2 font-semibold text-lg">
          <span
            className={cn(
              winner === "home" ? "text-emerald-600" : "text-muted-foreground"
            )}
          >
            {match.score.home ?? "—"}
          </span>
          <span className="text-muted-foreground text-xs">—</span>
          <span
            className={cn(
              winner === "away" ? "text-emerald-600" : "text-muted-foreground"
            )}
          >
            {match.score.away ?? "—"}
          </span>
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-medium">{match.away.name}</p>
            <p className="text-muted-foreground text-xs">
              {match.away.slug ?? match.away.placeholder ?? "—"}
            </p>
          </div>
          <Avatar className="h-8 w-8">
            {match.away.logo ? (
              <AvatarImage alt={match.away.name} src={match.away.logo} />
            ) : (
              <AvatarFallback>
                {match.away.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        </div>
      </td>
    </tr>
  );
}

function TournamentData({
  stagesQuery,
  matchRows,
  stages,
}: {
  stagesQuery: ReturnType<typeof useTournamentStages>;
  matchRows: MatchRow[];
  stages: Stage[];
}) {
  if (stagesQuery.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load stages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {stagesQuery.error instanceof Error
              ? stagesQuery.error.message
              : "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="matches">
      <TabsList className="w-full max-w-md">
        <TabsTrigger value="matches">Match results</TabsTrigger>
        <TabsTrigger value="rankings">Stage rankings</TabsTrigger>
      </TabsList>
      <TabsContent className="space-y-4" value="matches">
        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-emerald-500" />
              <div>
                <CardTitle>Match results</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Sorted by scheduled time, newest matches at the bottom.
                </p>
              </div>
            </div>
            <Badge variant="outline">
              {matchRows.length} matches across {stages.length} stages
            </Badge>
          </CardHeader>
          <CardContent>
            {matchRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Matches will appear once a stage has been generated.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs uppercase">
                      <th className="px-2 py-2 text-left font-medium">Time</th>
                      <th className="px-2 py-2 text-left font-medium">Field</th>
                      <th className="px-2 py-2 text-left font-medium">Match</th>
                      <th className="px-2 py-2 text-left font-medium">Home</th>
                      <th className="px-2 py-2 text-center font-medium">
                        Score
                      </th>
                      <th className="px-2 py-2 text-right font-medium">Away</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchRows.map((match) => (
                      <MatchRowItem key={match.id} match={match} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent className="space-y-4" value="rankings">
        {stages.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No stages available.</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Rankings will appear once stages have been created for this
                tournament.
              </p>
            </CardContent>
          </Card>
        ) : (
          stages
            .slice()
            .sort((a, b) => a.stageOrder - b.stageOrder)
            .map((stage) => {
              const statusMeta = getStageStatusMeta(stage.status);
              const typeMeta = getStageTypeMeta(stage.type);
              return (
                <Card key={stage.id}>
                  <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <CardTitle>{stage.name}</CardTitle>
                        <Badge variant={statusMeta.badgeVariant}>
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {typeMeta.label} · {typeMeta.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground text-sm">
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Order #{stage.stageOrder}
                      </span>
                      <span className="flex items-center gap-2">
                        <Trophy className="h-4 w-4" />
                        {stage.rankings.length} teams
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stage.rankings.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        Rankings will populate once scores are submitted.
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
                              <th className="px-3 py-2 text-right">
                                Total score
                              </th>
                              <th className="px-3 py-2 text-right">
                                Lose rate
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {stage.rankings.map((entry) => (
                              <tr
                                className="border-b last:border-0"
                                key={entry.teamId}
                              >
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
                                          {entry.name
                                            ?.slice(0, 2)
                                            .toUpperCase() ?? "??"}
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
              );
            })
        )}
      </TabsContent>
    </Tabs>
  );
}

function ResultsPage() {
  const tournamentsQuery = useTournamentList();
  const tournaments = tournamentsQuery.data?.items ?? [];
  const [selectedTournament, setSelectedTournament] = useState<string | null>(
    null
  );
  const defaultTournament = useMemo(() => {
    if (!tournaments.length) {
      return null;
    }
    const ongoing = tournaments.find((item) => item.status === "ONGOING");
    if (ongoing) {
      return ongoing.slug;
    }
    const upcoming = tournaments.find((item) => item.status === "UPCOMING");
    if (upcoming) {
      return upcoming.slug;
    }
    return tournaments[0]?.slug ?? null;
  }, [tournaments]);

  useEffect(() => {
    if (!selectedTournament && defaultTournament) {
      setSelectedTournament(defaultTournament);
    }
  }, [selectedTournament, defaultTournament]);

  const stagesQuery = useTournamentStages(selectedTournament);
  const stages = stagesQuery.data?.stages ?? [];

  const matchRows: MatchRow[] = useMemo(
    () =>
      stages
        .flatMap((stage) =>
          stage.matches.map((match) => ({
            ...match,
            stageName: stage.name,
          }))
        )
        .sort((a, b) => {
          if (a.scheduledAt && b.scheduledAt) {
            return (
              new Date(a.scheduledAt).getTime() -
              new Date(b.scheduledAt).getTime()
            );
          }
          if (a.scheduledAt) {
            return -1;
          }
          if (b.scheduledAt) {
            return 1;
          }
          return a.stageName.localeCompare(b.stageName);
        }),
    [stages]
  );

  const isLoading =
    tournamentsQuery.isPending ||
    (Boolean(selectedTournament) && stagesQuery.isPending);

  if (isLoading) {
    return <Loader />;
  }

  if (tournamentsQuery.error) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load tournaments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {tournamentsQuery.error instanceof Error
                ? tournamentsQuery.error.message
                : "Please try again later."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tournaments.length) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>No tournaments available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Create a tournament to start publishing live results.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            <Link className="underline" search={{}} to="/tournaments">
              Tournaments
            </Link>{" "}
            / Live scoreboard
          </p>
          <h1 className="font-bold text-3xl">Live Results</h1>
          <p className="text-muted-foreground">
            Real-time match results and stage rankings. Data refreshes every 10
            seconds.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label
            className="font-medium text-muted-foreground text-sm"
            htmlFor="tournament-select"
          >
            Select tournament
          </label>
          <Select
            className="w-72"
            id="tournament-select"
            onChange={(event) => {
              const nextValue = event.target.value;
              setSelectedTournament(nextValue || null);
            }}
            value={selectedTournament ?? ""}
          >
            <option value="">Choose a tournament</option>
            {tournaments.map((tournament) => {
              const startLabel = tournament.startDate
                ? ` · ${formatDateTime(new Date(tournament.startDate))}`
                : "";
              return (
                <option key={tournament.slug} value={tournament.slug}>
                  {tournament.name} ({tournament.status}
                  {startLabel})
                </option>
              );
            })}
          </Select>
        </div>
      </div>

      {selectedTournament ? (
        <TournamentData
          matchRows={matchRows}
          stages={stages}
          stagesQuery={stagesQuery}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Select a tournament to view live data.</CardTitle>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
