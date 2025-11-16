import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, MapPin, Users } from "lucide-react";
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
import { formatDateTime } from "@/utils/date";
import { getMatchStatusLabel } from "@/utils/stages";

type MatchDetail = {
  id: string;
  round: string | null;
  status: string;
  scheduledAt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  metadata: {
    label?: string | null;
    fieldNumber?: number | null;
  } | null;
  home: {
    id: string | null;
    name: string;
    slug: string | null;
    placeholder: string | null;
  };
  away: {
    id: string | null;
    name: string;
    slug: string | null;
    placeholder: string | null;
  };
  tournament: {
    id: string;
    name: string;
    slug: string;
    location?: string | null;
  };
  stage: {
    id: string;
    name: string;
    type: string;
  };
};

export const Route = createFileRoute("/matches/$matchId")({
  component: MatchDetailPage,
});

function MatchDetailPage() {
  const { matchId } = Route.useParams();

  const { data: match, isPending } = useQuery<MatchDetail>({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/matches/${matchId}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch match");
      }
      return response.json();
    },
  });

  if (isPending) {
    return <Loader />;
  }

  if (!match) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Match Not Found</CardTitle>
            <CardDescription>
              The match you're looking for doesn't exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/tournaments">Back to Tournaments</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const homeTeamName = match.home.name || match.home.placeholder || "TBD";
  const awayTeamName = match.away.name || match.away.placeholder || "TBD";
  const matchLabel = match.metadata?.label || match.round || "Match";

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild size="icon" variant="outline">
          <Link
            params={{ tournamentId: match.tournament.id }}
            to="/tournaments/$tournamentId/stages"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl">{matchLabel}</h1>
          <p className="text-muted-foreground text-sm">
            {match.tournament.name} - {match.stage.name}
          </p>
        </div>
      </div>

      {/* Match Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Match Status</CardTitle>
            <Badge variant={getStatusVariant(match.status)}>
              {getMatchStatusLabel(match.status)}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Teams & Score */}
      <Card>
        <CardHeader>
          <CardTitle>Match Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {/* Home Team */}
            <div className="text-center">
              {match.home.id ? (
                <Link
                  className="hover:underline"
                  params={{ slug: match.home.slug || match.home.id }}
                  to="/teams/$slug"
                >
                  <h2 className="font-semibold text-xl">{homeTeamName}</h2>
                </Link>
              ) : (
                <h2 className="font-semibold text-muted-foreground text-xl">
                  {homeTeamName}
                </h2>
              )}
              <p className="text-muted-foreground text-sm">Home</p>
            </div>

            {/* Score */}
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-muted px-6 py-4 text-center">
                <div className="font-bold text-4xl">
                  {match.homeScore ?? "-"}
                </div>
              </div>
              <div className="font-bold text-2xl text-muted-foreground">VS</div>
              <div className="rounded-lg bg-muted px-6 py-4 text-center">
                <div className="font-bold text-4xl">
                  {match.awayScore ?? "-"}
                </div>
              </div>
            </div>

            {/* Away Team */}
            <div className="text-center">
              {match.away.id ? (
                <Link
                  className="hover:underline"
                  params={{ slug: match.away.slug || match.away.id }}
                  to="/teams/$slug"
                >
                  <h2 className="font-semibold text-xl">{awayTeamName}</h2>
                </Link>
              ) : (
                <h2 className="font-semibold text-muted-foreground text-xl">
                  {awayTeamName}
                </h2>
              )}
              <p className="text-muted-foreground text-sm">Away</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Info */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Schedule */}
        {match.scheduledAt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                Scheduled Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {formatDateTime(match.scheduledAt)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Field */}
        {match.metadata?.fieldNumber && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Field
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Field {match.metadata.fieldNumber}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Location */}
        {match.tournament.location && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {match.tournament.location}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stage Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {match.stage.name} ({match.stage.type.replace(/_/g, " ")})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tournament Link */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">View Full Tournament</p>
              <p className="text-muted-foreground text-sm">
                See all stages and matches
              </p>
            </div>
            <Button asChild>
              <Link
                params={{ tournamentId: match.tournament.id }}
                to="/tournaments/$tournamentId"
              >
                Go to Tournament
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getStatusVariant(
  status: string
): "default" | "secondary" | "success" | "warning" | "destructive" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
      return "warning";
    case "CANCELED":
      return "destructive";
    default:
      return "secondary";
  }
}
