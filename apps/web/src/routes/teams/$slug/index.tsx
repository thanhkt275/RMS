import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Calendar,
  Camera,
  Edit,
  MapPin,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useState } from "react";
import { AddMemberForm } from "@/components/add-member-form";
import Loader from "@/components/loader";
import { TeamAvatarUpload } from "@/components/team-avatar-upload";
import TeamMembersList from "@/components/team-members-list";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import type { RegistrationStatus } from "@/types/registration";
import {
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";
import { getRegistrationStatusMeta } from "@/utils/registrations";
import { formatRole, formatStatus } from "@/utils/teams";

type TeamTournament = {
  id: string;
  name: string;
  slug: string;
  status: string;
  location?: string | null;
  season?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  placement?: string | null;
  result?: string | null;
  registrationId?: string;
  registrationStatus?: RegistrationStatus;
};

type TeamMatch = {
  id: string;
  tournamentId?: string | null;
  tournamentName?: string | null;
  scheduledAt?: string | null;
  round?: string | null;
  status: string;
  opponent?: {
    id?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
  scoreFor?: number | null;
  scoreAgainst?: number | null;
  outcome: "WIN" | "LOSS" | "DRAW" | "PENDING";
};

type TeamAchievement = {
  id: string;
  title: string;
  description?: string | null;
  position?: number | null;
  awardedAt?: string | null;
  tournamentId?: string | null;
  tournamentName?: string | null;
};

const getRegistrationActionLabel = (status?: RegistrationStatus) => {
  if (!status) {
    return "Track registration";
  }
  switch (status) {
    case "IN_PROGRESS":
    case "REJECTED":
      return "Continue registration";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "Track registration";
    case "APPROVED":
      return "View registration";
    default:
      return "Track registration";
  }
};

type MatchBadgeVariant = "success" | "destructive" | "warning" | "secondary";

type MatchCard = {
  id: string;
  title: string;
  opponentLabel: string;
  meta: string;
  badgeVariant: MatchBadgeVariant;
  badgeLabel: string;
};

const formatMatchDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Date TBD";

const getMatchBadgeVariant = (
  outcome: TeamMatch["outcome"]
): MatchBadgeVariant => {
  switch (outcome) {
    case "WIN":
      return "success";
    case "LOSS":
      return "destructive";
    case "DRAW":
      return "warning";
    default:
      return "secondary";
  }
};

const buildMatchCard = (match: TeamMatch): MatchCard => {
  const opponentName = match.opponent?.name ?? "Opponent to be announced";
  const roundLabel = match.round ? `${match.round} • ` : "";
  const scoreReady =
    typeof match.scoreFor === "number" &&
    typeof match.scoreAgainst === "number";
  const scoreLabel = scoreReady
    ? `${match.scoreFor}-${match.scoreAgainst}`
    : undefined;
  const badgeVariant = getMatchBadgeVariant(match.outcome);
  const badgeLabel =
    match.outcome === "PENDING"
      ? "Scheduled"
      : `${match.outcome}${scoreLabel ? ` (${scoreLabel})` : ""}`;

  return {
    id: match.id,
    title: match.tournamentName ?? "Friendly Match",
    opponentLabel: `${roundLabel}vs ${opponentName}`,
    meta: `${formatMatchDate(match.scheduledAt)} • ${match.status}`,
    badgeVariant,
    badgeLabel,
  };
};

type TeamDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  logo?: string;
  coverImage?: string | null;
  teamNumber?: string;
  location?: string;
  description?: string;
  createdAt: string;
  memberRole?: string | null;
  isMember: boolean;
  memberJoinedAt?: string;
  members: Array<{
    id: string;
    userId: string;
    role: string;
    joinedAt: string;
    name: string;
    email: string;
  }>;
  invitations: unknown[];
  tournaments: TeamTournament[];
  matches: TeamMatch[];
  achievements: TeamAchievement[];
};

export const Route = createFileRoute("/teams/$slug/")({
  component: TeamDetailPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const rawUser = session.data?.user;
    const user = rawUser as AccessControlUser | undefined;
    if (!rawUser) {
      throw redirect({
        to: "/sign-in",
      });
    }
    if (!meetsAccessRule(user, ACCESS_RULES.registeredOnly)) {
      throw redirect({
        to: "/sign-in",
      });
    }
    if (!rawUser.id) {
      throw redirect({
        to: "/sign-in",
      });
    }
    return { userId: rawUser.id as string };
  },
});

function TeamDetailPage() {
  const { slug } = Route.useParams();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showAvatarForm, setShowAvatarForm] = useState(false);
  const { userId } = Route.useRouteContext() as { userId: string };

  const teamQuery = useQuery<TeamDetail>({
    queryKey: ["team", slug],
    queryFn: async (): Promise<TeamDetail> => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/${slug}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch team details");
      }
      return response.json();
    },
  });

  if (teamQuery.isPending) {
    return <Loader />;
  }

  if (teamQuery.error) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div>
          <h1 className="font-bold text-3xl">Team Not Found</h1>
          <p className="text-destructive">
            {teamQuery.error instanceof Error
              ? teamQuery.error.message
              : "Failed to load team details. Please try again later."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            search={{
              page: 1,
              search: "",
              sortField: "createdAt",
              sortDirection: "desc",
            }}
            to="/teams"
          >
            Back to Teams
          </Link>
        </Button>
      </div>
    );
  }

  const team = teamQuery.data;
  const roleMeta = formatRole(team.memberRole);
  const createdAt = new Date(team.createdAt);
  const isMentor = team.memberRole === "TEAM_MENTOR";
  const canInvite =
    team.memberRole === "TEAM_MENTOR" || team.memberRole === "TEAM_LEADER";

  return (
    <TeamProfileLayout
      canInvite={canInvite}
      createdAt={createdAt}
      currentUserId={userId}
      isMentor={isMentor}
      roleMeta={roleMeta}
      setShowAvatarForm={setShowAvatarForm}
      setShowInviteForm={setShowInviteForm}
      showAvatarForm={showAvatarForm}
      showInviteForm={showInviteForm}
      slug={slug}
      team={team}
    />
  );
}

type TeamProfileLayoutProps = {
  team: TeamDetail;
  roleMeta: ReturnType<typeof formatRole>;
  createdAt: Date;
  isMentor: boolean;
  canInvite: boolean;
  showInviteForm: boolean;
  setShowInviteForm: (show: boolean) => void;
  showAvatarForm: boolean;
  setShowAvatarForm: (show: boolean) => void;
  slug: string;
  currentUserId: string;
};

function TeamProfileLayout({
  team,
  roleMeta,
  createdAt,
  isMentor,
  canInvite,
  showInviteForm,
  setShowInviteForm,
  showAvatarForm,
  setShowAvatarForm,
  slug,
  currentUserId,
}: TeamProfileLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TeamHeader
        isMentor={isMentor}
        setShowAvatarForm={setShowAvatarForm}
        team={team}
      />
      <TeamContent
        canInvite={canInvite}
        createdAt={createdAt}
        currentUserId={currentUserId}
        isMentor={isMentor}
        roleMeta={roleMeta}
        setShowAvatarForm={setShowAvatarForm}
        setShowInviteForm={setShowInviteForm}
        showAvatarForm={showAvatarForm}
        showInviteForm={showInviteForm}
        slug={slug}
        team={team}
      />

      {/* Avatar Upload Form */}
      {showAvatarForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md">
            <TeamAvatarUpload
              currentAvatar={team.logo}
              onCancel={() => setShowAvatarForm(false)}
              onSuccess={() => {
                // Refresh team data after successful upload
                window.location.reload();
              }}
              teamName={team.name}
              teamSlug={slug}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type TeamHeaderProps = {
  team: TeamDetail;
  isMentor: boolean;
  setShowAvatarForm: (show: boolean) => void;
};

function TeamHeader({ team, isMentor, setShowAvatarForm }: TeamHeaderProps) {
  return (
    <div className="relative">
      {/* Cover Photo */}
      <div className="relative h-80 overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700">
        {team.coverImage ? (
          <>
            <img
              alt={`${team.name} cover`}
              className="h-full w-full object-cover"
              height={320}
              src={team.coverImage}
              width={1920}
            />
            <div className="absolute inset-0 bg-black/30" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-purple-600/30" />
            <div className="absolute inset-0 bg-black/10" />
          </>
        )}
      </div>

      {/* Avatar overlapping cover photo */}
      <div className="-bottom-20 absolute left-6">
        <Avatar className="h-60 w-60 border-4 border-background shadow-lg">
          <AvatarImage alt={team.name} src={team.logo} />
          <AvatarFallback className="font-bold text-3xl">
            {team.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Admin Controls */}
      {isMentor && (
        <div className="absolute top-4 right-4 flex gap-2">
          <Button
            onClick={() => setShowAvatarForm(true)}
            size="sm"
            variant="secondary"
          >
            <Camera className="mr-2 h-4 w-4" />
            Change Avatar
          </Button>
          <Button size="sm" variant="secondary">
            <Camera className="mr-2 h-4 w-4" />
            Change Cover
          </Button>
          <Button asChild size="sm">
            <Link params={{ slug: team.slug }} to="/teams/$slug/edit">
              <Edit className="mr-2 h-4 w-4" />
              Edit Profile
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

type TeamContentProps = {
  team: TeamDetail;
  roleMeta: ReturnType<typeof formatRole>;
  createdAt: Date;
  isMentor: boolean;
  canInvite: boolean;
  showInviteForm: boolean;
  setShowInviteForm: (show: boolean) => void;
  showAvatarForm: boolean;
  setShowAvatarForm: (show: boolean) => void;
  slug: string;
  currentUserId: string;
};

function TeamContent({
  team,
  roleMeta,
  createdAt,
  isMentor,
  canInvite,
  showInviteForm,
  setShowInviteForm,
  showAvatarForm,
  setShowAvatarForm,
  slug,
  currentUserId,
}: TeamContentProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <TeamSidebar isMentor={isMentor} roleMeta={roleMeta} team={team} />
        <TeamMainContent
          canInvite={canInvite}
          createdAt={createdAt}
          currentUserId={currentUserId}
          isMentor={isMentor}
          setShowAvatarForm={setShowAvatarForm}
          setShowInviteForm={setShowInviteForm}
          showAvatarForm={showAvatarForm}
          showInviteForm={showInviteForm}
          slug={slug}
          team={team}
        />
      </div>
    </div>
  );
}

type TeamSidebarProps = {
  team: TeamDetail;
  roleMeta: ReturnType<typeof formatRole>;
  isMentor: boolean;
};

function TeamSidebar({ team, roleMeta, isMentor }: TeamSidebarProps) {
  return (
    <div className="space-y-6 lg:col-span-1">
      {/* Team Identity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-2xl">{team.name}</h1>
              <Badge variant={formatStatus(team.status).badgeVariant}>
                {formatStatus(team.status).label}
              </Badge>
            </div>
            {team.teamNumber && (
              <p className="text-muted-foreground">#{team.teamNumber}</p>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {team.description || "No description provided yet."}
            </p>
          </div>

          {/* Key Info */}
          <div className="space-y-3">
            {team.location && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span>{team.location}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span>
                {team.members.length} member
                {team.members.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span>
                Founded{" "}
                {new Date(team.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Role Card */}
      {team.isMember && roleMeta && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={roleMeta.badgeVariant}>{roleMeta.label}</Badge>
              <p className="text-muted-foreground text-xs">
                {roleMeta.description}
              </p>
            </div>
            {team.memberJoinedAt && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>
                  Joined{" "}
                  {new Date(team.memberJoinedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team Management */}
      {!isMentor && team.isMember && (
        <Card className="border-muted">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Team Management</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Only team mentors can edit team settings. Contact your team mentor
              if you need to make changes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type TeamMainContentProps = {
  team: TeamDetail;
  createdAt: Date;
  isMentor: boolean;
  canInvite: boolean;
  showInviteForm: boolean;
  setShowInviteForm: (show: boolean) => void;
  showAvatarForm: boolean;
  setShowAvatarForm: (show: boolean) => void;
  slug: string;
  currentUserId: string;
};

function TeamMainContent({
  team,
  createdAt,
  isMentor,
  canInvite,
  showInviteForm,
  setShowInviteForm,
  showAvatarForm,
  setShowAvatarForm,
  slug,
  currentUserId,
}: TeamMainContentProps) {
  return (
    <div className="space-y-6 lg:col-span-3">
      {/* Team Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link
            search={{
              page: 1,
              search: "",
              sortField: "createdAt",
              sortDirection: "desc",
            }}
            to="/teams"
          >
            Back to Teams
          </Link>
        </Button>

        {canInvite && !showInviteForm && (
          <Button onClick={() => setShowInviteForm(true)}>
            <Users className="mr-2 h-4 w-4" />
            Add Team Member
          </Button>
        )}
      </div>

      {/* Invite Form */}
      {canInvite && showInviteForm && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Team Member</CardTitle>
            <CardDescription>Add new members to join your team</CardDescription>
          </CardHeader>
          <CardContent>
            <AddMemberForm
              onCancel={() => setShowInviteForm(false)}
              onSuccess={() => setShowInviteForm(false)}
              teamSlug={slug}
            />
          </CardContent>
        </Card>
      )}

      {/* Avatar Form */}
      {isMentor && showAvatarForm && (
        <TeamAvatarUpload
          currentAvatar={team.logo}
          onCancel={() => setShowAvatarForm(false)}
          onSuccess={() => setShowAvatarForm(false)}
          teamName={team.name}
          teamSlug={slug}
        />
      )}

      {/* Content Tabs */}
      <Tabs className="w-full" defaultValue="members">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
        </TabsList>

        <MembersTab currentUserId={currentUserId} slug={slug} team={team} />
        <MatchesTab isMentor={isMentor} team={team} />
        <AchievementsTab isMentor={isMentor} team={team} />
        <TournamentsTab isMentor={isMentor} team={team} />
      </Tabs>

      {/* Team Details */}
      <Card>
        <CardHeader>
          <CardTitle>Team Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-medium text-sm">Created</h3>
              <p className="text-muted-foreground">
                {createdAt.toLocaleDateString()} at{" "}
                {createdAt.toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-sm">Team Slug</h3>
            <p className="font-mono text-muted-foreground text-xs">
              {team.slug}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type TabProps = {
  team: TeamDetail;
  isMentor: boolean;
};

function MembersTab({
  team,
  currentUserId,
  slug,
}: {
  team: TeamDetail;
  currentUserId: string;
  slug: string;
}) {
  return (
    <TabsContent className="space-y-4" value="members">
      <TeamMembersList
        currentUserId={currentUserId}
        currentUserRole={team.memberRole || undefined}
        members={team.members}
        teamSlug={slug}
      />
    </TabsContent>
  );
}

function MatchesTab({ team, isMentor }: TabProps) {
  const matches = team.matches ?? [];
  const matchCards = matches.map(buildMatchCard);

  return (
    <TabsContent className="space-y-4" value="matches">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Match History
          </CardTitle>
          <CardDescription>All matches played by {team.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {matchCards.length === 0 && (
              <p className="text-center text-muted-foreground text-sm">
                No matches recorded yet.
              </p>
            )}
            {matchCards.map((match) => (
              <div
                className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                key={match.id}
              >
                <div className="space-y-1">
                  <p className="font-medium">{match.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {match.opponentLabel}
                  </p>
                  <p className="text-muted-foreground text-xs">{match.meta}</p>
                </div>
                <Badge variant={match.badgeVariant}>{match.badgeLabel}</Badge>
              </div>
            ))}
          </div>
          {isMentor && (
            <div className="mt-4 flex justify-center">
              <Button size="sm" variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Manage Matches
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function AchievementsTab({ team, isMentor }: TabProps) {
  const achievements = team.achievements ?? [];
  const formatYear = (value?: string | null) =>
    value ? new Date(value).getFullYear() : "N/A";

  return (
    <TabsContent className="space-y-4" value="achievements">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Achievements & Awards
          </CardTitle>
          <CardDescription>
            Awards and recognitions earned by {team.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {achievements.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">
              No achievements have been added yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {achievements.map((achievement) => (
                <Card className="text-center" key={achievement.id}>
                  <CardContent className="pt-6">
                    <Trophy className="mx-auto h-12 w-12 text-yellow-500" />
                    <h3 className="mt-2 font-semibold">{achievement.title}</h3>
                    <p className="text-muted-foreground text-sm">
                      {achievement.tournamentName || "Tournament TBD"}
                    </p>
                    <Badge className="mt-2" variant="outline">
                      {formatYear(achievement.awardedAt)}
                    </Badge>
                    {achievement.description && (
                      <p className="mt-2 text-muted-foreground text-xs">
                        {achievement.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {isMentor && (
            <div className="mt-6 flex justify-center">
              <Button size="sm" variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Manage Achievements
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function TournamentsTab({ team, isMentor }: TabProps) {
  const tournaments = team.tournaments ?? [];
  const formatRange = (start?: string | null, end?: string | null) => {
    if (!(start || end)) {
      return "Dates TBD";
    }
    if (start && end) {
      const startDate = new Date(start).toLocaleDateString();
      const endDate = new Date(end).toLocaleDateString();
      return `${startDate} – ${endDate}`;
    }
    const single = new Date(start || end || "").toLocaleDateString();
    return single;
  };

  return (
    <TabsContent className="space-y-4" value="tournaments">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Tournament History
          </CardTitle>
          <CardDescription>Tournaments attended by {team.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tournaments.length === 0 && (
              <p className="text-center text-muted-foreground text-sm">
                No tournaments recorded yet.
              </p>
            )}
            {tournaments.map((tournament) => {
              const showRegistrationBadge = Boolean(
                tournament.registrationStatus &&
                  tournament.registrationStatus !== "APPROVED"
              );
              const registrationStatusMeta = showRegistrationBadge
                ? getRegistrationStatusMeta(tournament.registrationStatus)
                : undefined;
              const registrationId = tournament.registrationId;
              const showRegistrationAction =
                Boolean(
                  tournament.registrationStatus &&
                    tournament.registrationStatus !== "APPROVED"
                ) && Boolean(registrationId);
              const actionLabel = getRegistrationActionLabel(
                tournament.registrationStatus
              );

              return (
                <div
                  className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={tournament.id}
                >
                  <div className="space-y-1">
                    <p className="font-medium">{tournament.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatRange(tournament.startDate, tournament.endDate)}
                      {tournament.season ? ` • ${tournament.season}` : ""}
                    </p>
                    {tournament.location && (
                      <p className="text-muted-foreground text-xs">
                        {tournament.location}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="flex flex-wrap items-center gap-2">
                      {(tournament.placement || tournament.result) && (
                        <Badge>
                          {tournament.placement || tournament.result}
                        </Badge>
                      )}
                      {showRegistrationBadge && registrationStatusMeta && (
                        <Badge variant={registrationStatusMeta.badgeVariant}>
                          {registrationStatusMeta.label}
                        </Badge>
                      )}
                    </div>
                    {showRegistrationAction && registrationId && (
                      <Button asChild size="sm" variant="secondary">
                        <Link
                          params={{
                            tournamentId: tournament.slug,
                            registrationId,
                          }}
                          to="/tournaments/$tournamentId/registration/$registrationId"
                        >
                          {actionLabel}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {isMentor && (
            <div className="mt-4 flex justify-center">
              <Button size="sm" variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Manage Tournaments
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
