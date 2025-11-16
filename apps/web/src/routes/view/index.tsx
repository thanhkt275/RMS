import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Calendar, Eye } from "lucide-react";
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
import { getTournamentStatusMeta } from "@/utils/tournaments";

type TournamentListItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  startDate?: string | null;
  registrationDeadline?: string | null;
  registeredTeams: number;
  fieldCount?: number;
};

type TournamentsResponse = {
  items: TournamentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export const Route = createFileRoute("/view/")({
  component: ViewTournamentsPage,
});

function ViewTournamentsPage() {
  const { data, isLoading, error } = useQuery<TournamentsResponse>({
    queryKey: ["tournaments", "view"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");

      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch tournaments");
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
            <CardDescription>Failed to load tournaments</CardDescription>
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

  const tournaments = data?.items ?? [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Tournaments</h1>
          <p className="text-muted-foreground">
            View and monitor all tournaments
          </p>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Tournaments</CardTitle>
            <CardDescription>
              There are no tournaments available at the moment.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament) => {
            const statusMeta = getTournamentStatusMeta(tournament.status);

            return (
              <Card className="flex flex-col" key={tournament.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2">
                      {tournament.name}
                    </CardTitle>
                    <Badge variant={statusMeta.badgeVariant}>
                      {statusMeta.label}
                    </Badge>
                  </div>
                  {tournament.description && (
                    <CardDescription className="line-clamp-2">
                      {tournament.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="flex-1 space-y-2 text-sm">
                    {tournament.startDate && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Starts: {formatDateTime(tournament.startDate)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button asChild className="flex-1" size="sm">
                      <Link
                        params={{ tournamentId: tournament.id }}
                        to="/view/$tournamentId"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Stages
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
