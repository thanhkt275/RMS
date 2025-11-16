import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CalendarDays,
  Clock4,
  FolderOpen,
  MapPin,
  Sparkles,
  Users,
  Waypoints,
} from "lucide-react";
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
import { authClient } from "@/lib/auth-client";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  getCountdownLabel,
} from "@/utils/date";
import type { ScoreProfileDefinition } from "@/utils/score-profiles";
import {
  getResourceLabel,
  getTournamentStatusMeta,
  type TournamentResourceType,
  type TournamentStatus,
} from "@/utils/tournaments";

type TournamentResource = {
  id: string;
  title: string;
  url: string;
  type: TournamentResourceType;
  description?: string | null;
};

type TournamentParticipant = {
  id: string;
  organizationId: string;
  teamName?: string | null;
  teamSlug?: string | null;
  teamLocation?: string | null;
  placement?: string | null;
  result?: string | null;
  notes?: string | null;
};

type TournamentDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: TournamentStatus;
  season?: string | null;
  organizer?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  registrationDeadline?: string | null;
  announcement?: string | null;
  registeredTeams: number;
  fieldCount: number;
  resources: TournamentResource[];
  participants: TournamentParticipant[];
  scoreProfile?: {
    id: string;
    name: string;
    description?: string | null;
    definition: ScoreProfileDefinition;
  } | null;
};

export const Route = createFileRoute("/tournaments/$tournamentId/")({
  component: TournamentDetailPage,
});

function TournamentDetailPage() {
  const { tournamentId } = Route.useParams();
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const detailQuery = useQuery<TournamentDetail>({
    queryKey: ["tournament", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`
      );
      if (!response.ok) {
        throw new Error("Tournament not found");
      }
      return response.json() as Promise<TournamentDetail>;
    },
  });

  if (detailQuery.isPending) {
    return <Loader />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load tournament</CardTitle>
            <CardDescription>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const tournament = detailQuery.data;
  const statusMeta = getTournamentStatusMeta(tournament.status);
  const countdown = getCountdownLabel(tournament.startDate);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-3xl">{tournament.name}</h1>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
          </div>
          {tournament.location && (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <MapPin className="h-4 w-4" /> {tournament.location}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link
              params={{ tournamentId: tournament.slug }}
              search={{}}
              to="/tournaments/$tournamentId/register"
            >
              Register team
            </Link>
          </Button>
          {isAdmin && (
            <>
              <Button asChild variant="secondary">
                <Link
                  params={{ tournamentId: tournament.slug }}
                  search={{}}
                  to="/tournaments/$tournamentId/field-roles"
                >
                  Manage field roles
                </Link>
              </Button>
              <Button asChild>
                <Link
                  params={{ tournamentId: tournament.slug }}
                  search={{}}
                  to="/tournaments/$tournamentId/edit"
                >
                  Edit details
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {tournament.description && (
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Season {tournament.season || "N/A"} — Organized by{" "}
              {tournament.organizer || "Unknown"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              {tournament.description}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Countdown</CardTitle>
              <CardDescription>Until the opening ceremony</CardDescription>
            </div>
            <Clock4 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-3xl">{countdown}</p>
            <p className="text-muted-foreground text-sm">
              {formatDateTime(tournament.startDate)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Registered teams</CardTitle>
              <CardDescription>Including pending approvals</CardDescription>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-3xl">
              {tournament.registeredTeams}
            </p>
            <p className="text-muted-foreground text-sm">
              Registration closes {formatDate(tournament.registrationDeadline)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Event window</CardTitle>
              <CardDescription>Start and end dates</CardDescription>
            </div>
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-sm">
              {formatDateRange(tournament.startDate, tournament.endDate)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Fields configured</CardTitle>
              <CardDescription>Used for match rotations</CardDescription>
            </div>
            <Waypoints className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-3xl">{tournament.fieldCount}</p>
            <p className="text-muted-foreground text-sm">
              Matches stay pinned to their field slots.
            </p>
          </CardContent>
        </Card>
      </div>

      {tournament.scoreProfile && (
        <ScoreProfileSummary
          isAdmin={isAdmin}
          profile={tournament.scoreProfile}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>Notices from the event staff</CardDescription>
            </div>
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tournament.announcement ? (
              <p className="text-muted-foreground leading-relaxed">
                {tournament.announcement}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                No announcements yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Documents & guides</CardTitle>
              <CardDescription>
                Rules, law documents, and manuals
              </CardDescription>
            </div>
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {tournament.resources.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Organizers have not uploaded any resources yet.
              </p>
            )}
            {tournament.resources.map((resource) => (
              <a
                className="flex items-start justify-between rounded-md border px-3 py-2 transition hover:bg-muted"
                href={resource.url}
                key={resource.id}
                rel="noopener noreferrer"
                target="_blank"
              >
                <div>
                  <p className="font-medium text-sm">{resource.title}</p>
                  {resource.description && (
                    <p className="text-muted-foreground text-xs">
                      {resource.description}
                    </p>
                  )}
                </div>
                <Badge variant="outline">
                  {getResourceLabel(resource.type)}
                </Badge>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Registered teams</CardTitle>
            <CardDescription>
              A chronological list of every organization currently registered.
            </CardDescription>
          </div>
          <Waypoints className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {tournament.participants.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-muted-foreground"
                      colSpan={4}
                    >
                      No teams have registered yet.
                    </td>
                  </tr>
                )}
                {tournament.participants.map((participant) => (
                  <tr className="border-b last:border-0" key={participant.id}>
                    <td className="px-4 py-4">
                      {participant.teamSlug ? (
                        <Link
                          className="text-foreground hover:underline"
                          params={{ slug: participant.teamSlug }}
                          search={{}}
                          to="/teams/$slug"
                        >
                          {participant.teamName}
                        </Link>
                      ) : (
                        <span>{participant.teamName || "Unknown team"}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground text-sm">
                      {participant.teamLocation || "—"}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {participant.result || participant.placement || "Pending"}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground text-sm">
                      {participant.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type ScoreProfileDetail = NonNullable<TournamentDetail["scoreProfile"]>;

function ScoreProfileSummary({
  profile,
  isAdmin,
}: {
  profile: ScoreProfileDetail;
  isAdmin: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Score profile
          </CardTitle>
          <CardDescription>
            {profile.name} • Version {profile.definition.version}
          </CardDescription>
        </div>
        {isAdmin && (
          <Button asChild variant="secondary">
            <Link
              params={{ scoreProfileId: profile.id }}
              search={{}}
              to="/score-profiles/$scoreProfileId"
            >
              Manage profile
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {profile.description && (
          <p className="text-muted-foreground">{profile.description}</p>
        )}

        <div className="space-y-3">
          <p className="font-semibold">Scoring parts</p>
          <div className="grid gap-3 md:grid-cols-2">
            {profile.definition.parts.map((part) => (
              <div className="rounded-md border p-3 text-sm" key={part.id}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{part.label}</span>
                  <Badge variant="outline">
                    {part.type === "NUMBER" ? "Numeric" : "Boolean"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {part.type === "NUMBER"
                    ? `${part.pointsPerUnit} pts each${
                        part.maxValue ? ` • max ${part.maxValue}` : ""
                      }`
                    : `${part.truePoints} pts when achieved`}
                </p>
                {part.cooperativeBonus && (
                  <p className="text-amber-600 text-xs">
                    Bonus +{part.cooperativeBonus.bonusPoints} when{" "}
                    {part.cooperativeBonus.requiredTeamCount} teams finish (
                    {part.cooperativeBonus.appliesTo === "ALL_TEAMS"
                      ? "all teams"
                      : "each team"}
                    )
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {!!profile.definition.penalties.length && (
          <div className="space-y-2">
            <p className="font-semibold">Penalties</p>
            <div className="space-y-2 text-sm">
              {profile.definition.penalties.map((penalty) => (
                <div
                  className="rounded-md bg-muted/60 px-3 py-2"
                  key={penalty.id}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{penalty.label}</span>
                    <Badge variant="outline">
                      {penalty.direction === "SUBTRACT" ? "-" : "+"}
                      {penalty.points} pts{" "}
                      {penalty.target === "SELF" ? "team" : "opponent"}
                    </Badge>
                  </div>
                  {penalty.description && (
                    <p className="text-muted-foreground text-xs">
                      {penalty.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1 text-sm">
          <p className="font-semibold">Formula</p>
          <p className="text-muted-foreground">
            {profile.definition.totalFormula}
          </p>
          {profile.definition.notes && (
            <p className="text-muted-foreground text-xs">
              {profile.definition.notes}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
