import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import Loader from "@/components/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StageTeam = {
  id: string;
  name: string | null;
  slug: string | null;
  logo: string | null;
  location: string | null;
  seed: number | null;
};

type StageMatch = {
  id: string;
  round: string | null;
  status: string;
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
  metadata?: {
    fieldNumber?: number | null;
    label?: string | null;
  } | null;
};

type TournamentStageDetail = {
  id: string;
  name: string;
  type: string;
  status: string;
  stageOrder: number;
  teamCount: number;
  fieldCount: number;
  teams: StageTeam[];
  matches: StageMatch[];
};

const STAGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

function getStageStatusVariant(status: string) {
  if (status === "ACTIVE") {
    return "success" as const;
  }
  if (status === "COMPLETED") {
    return "default" as const;
  }
  return "secondary" as const;
}

export const Route = createFileRoute("/view/$tournamentId/$stageId/")({
  component: StageControlPage,
});

function StageControlPage() {
  const { tournamentId, stageId } = useParams({
    from: "/view/$tournamentId/$stageId/",
  });

  const { data, isLoading, error } = useQuery<{ stage: TournamentStageDetail }>(
    {
      queryKey: ["tournament", tournamentId, "stage", stageId],
      queryFn: async () => {
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch stage details");
        }

        return response.json();
      },
    }
  );

  // Handle ESC key to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.history.back();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center py-8">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>Failed to load stage details</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.stage) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
            <CardDescription>Stage not found</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stage = data.stage;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Sticky Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <Button asChild size="sm" variant="ghost">
              <Link params={{ tournamentId }} to="/view/$tournamentId">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div>
                <h1 className="font-bold text-xl">{stage.name}</h1>
                <p className="text-muted-foreground text-sm">
                  Stage {stage.stageOrder} • {stage.teamCount} teams •{" "}
                  {stage.matches.length} matches • {stage.fieldCount} fields
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs">
              Press{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                ESC
              </kbd>{" "}
              to go back
            </span>
            <Badge variant={getStageStatusVariant(stage.status)}>
              {STAGE_STATUS_LABELS[stage.status] ?? stage.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto space-y-6 py-6">
          {/* Teams Section */}
          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
              <CardDescription>
                {stage.teamCount} teams participating in this stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stage.teams.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No teams assigned yet
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {stage.teams.map((team) => (
                    <div
                      className="flex items-center gap-3 rounded-lg border p-3"
                      key={team.id}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-semibold text-sm">
                        {team.seed}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium text-sm">
                          {team.name}
                        </p>
                        {team.location && (
                          <p className="truncate text-muted-foreground text-xs">
                            {team.location}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matches Section */}
          <Card>
            <CardHeader>
              <CardTitle>Matches</CardTitle>
              <CardDescription>
                View-only mode - Matches are displayed for viewing purposes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stage.matches.length === 0 ? (
                <div className="rounded-lg border border-muted-foreground/25 border-dashed p-8 text-center">
                  <p className="text-muted-foreground">
                    No matches scheduled yet
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {stage.matches.map((match) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-4"
                      key={match.id}
                    >
                      <div className="flex-1">
                        <p className="mb-2 font-medium text-sm">
                          {match.round ?? "Unassigned"}
                          {match.metadata?.fieldNumber ? (
                            <span className="text-muted-foreground">
                              {" "}
                              • Field {match.metadata.fieldNumber}
                            </span>
                          ) : null}
                        </p>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 text-right">
                            <p className="font-medium">{match.home.name}</p>
                          </div>
                          <div className="flex items-center gap-2 font-bold text-lg">
                            <span>{match.score.home ?? "-"}</span>
                            <span className="text-muted-foreground">:</span>
                            <span>{match.score.away ?? "-"}</span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{match.away.name}</p>
                          </div>
                        </div>
                      </div>
                      <Badge className="ml-4" variant="secondary">
                        {match.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
