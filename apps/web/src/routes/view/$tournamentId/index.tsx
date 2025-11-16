import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";
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

type TournamentStage = {
  id: string;
  name: string;
  type: string;
  stageOrder: number;
  status: string;
  teamCount: number;
  matchCount: number;
  fieldCount: number;
};

type TournamentDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  fieldCount: number;
  stages: TournamentStage[];
};

const STAGE_TYPE_LABELS: Record<string, string> = {
  FIRST_ROUND: "First Round",
  SEMI_FINAL_ROUND_ROBIN: "Semi-Final Round Robin",
  FINAL_DOUBLE_ELIMINATION: "Final Double Elimination",
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

export const Route = createFileRoute("/view/$tournamentId/")({
  component: ViewTournamentStagesPage,
});

function ViewTournamentStagesPage() {
  const { tournamentId } = useParams({ from: "/view/$tournamentId/" });

  const { data, isLoading, error } = useQuery<TournamentDetail>({
    queryKey: ["tournament", tournamentId, "stages"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch tournament");
      }

      return response.json();
    },
  });

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
            <CardDescription>Failed to load tournament</CardDescription>
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

  if (!data) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
            <CardDescription>Tournament not found</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Button asChild size="sm" variant="ghost">
          <Link to="/view">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tournaments
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="font-bold text-3xl tracking-tight">{data.name}</h1>
        {data.description && (
          <p className="mt-2 text-muted-foreground">{data.description}</p>
        )}
        {data.fieldCount ? (
          <p className="text-muted-foreground text-sm">
            Configured for {data.fieldCount} fields.
          </p>
        ) : null}
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-4 font-semibold text-2xl">Tournament Stages</h2>
          {!data.stages || data.stages.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Stages</CardTitle>
                <CardDescription>
                  This tournament has no stages configured yet.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.stages
                .sort((a, b) => a.stageOrder - b.stageOrder)
                .map((stage) => (
                  <Card key={stage.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{stage.name}</CardTitle>
                        <Badge variant={getStageStatusVariant(stage.status)}>
                          {STAGE_STATUS_LABELS[stage.status] ?? stage.status}
                        </Badge>
                      </div>
                      <CardDescription>
                        {STAGE_TYPE_LABELS[stage.type] ?? stage.type}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-muted-foreground text-sm">
                        <p>Teams: {stage.teamCount}</p>
                        <p>Matches: {stage.matchCount}</p>
                        <p>Fields: {stage.fieldCount}</p>
                      </div>
                      <Button
                        asChild
                        className="w-full"
                        size="sm"
                        variant="outline"
                      >
                        <Link
                          params={{ tournamentId, stageId: stage.id }}
                          to="/view/$tournamentId/$stageId"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Control Panel
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
