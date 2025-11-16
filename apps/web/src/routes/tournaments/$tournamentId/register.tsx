import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { FieldErrors, FormField } from "@/components/form-field";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/utils/date";
import { queryClient } from "@/utils/query-client";
import { getTournamentStatusMeta } from "@/utils/tournaments";

const registerSchema = z.object({
  organizationId: z.string().min(1, "Select a team"),
  notes: z.string().max(1000).optional().default(""),
});

type TournamentSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  registrationDeadline?: string | null;
  startDate?: string | null;
  registeredTeams: number;
};

type UserTeam = {
  id: string;
  name: string;
  slug: string;
  role?: string | null;
};

export const Route = createFileRoute("/tournaments/$tournamentId/register")({
  component: RegisterTeamPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/sign-in" });
    }
    return { session };
  },
});

function RegisterTeamPage() {
  const { tournamentId } = Route.useParams();
  const navigate = useNavigate();

  const summaryQuery = useQuery<TournamentSummary>({
    queryKey: ["tournament", tournamentId, "summary"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`
      );
      if (!response.ok) {
        throw new Error("Tournament not found");
      }
      return response.json() as Promise<TournamentSummary>;
    },
  });

  const teamsQuery = useQuery<{ items: UserTeam[] }>({
    queryKey: ["my-teams"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/mine`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load your teams");
      }
      return response.json() as Promise<{ items: UserTeam[] }>;
    },
  });

  const registerTeam = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to register team");
      }
      return response.json() as Promise<{ success: boolean }>;
    },
    onSuccess: async () => {
      toast.success("Team registered successfully");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tournament", tournamentId],
        }),
        queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
      ]);
      await navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId },
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to register."
      );
    },
  });

  const form = useForm({
    defaultValues: {
      organizationId: "",
      notes: "",
    },
    validators: {
      onSubmit: registerSchema,
    },
    onSubmit: async ({ value }) => {
      await registerTeam.mutateAsync({
        organizationId: value.organizationId,
        notes: value.notes?.trim() || undefined,
      });
    },
  });

  if (summaryQuery.isPending || teamsQuery.isPending) {
    return <Loader />;
  }

  if (summaryQuery.error || !summaryQuery.data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load tournament</CardTitle>
            <CardDescription>
              {summaryQuery.error instanceof Error
                ? summaryQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const teams = teamsQuery.data?.items ?? [];
  const hasTeams = teams.length > 0;
  const tournament = summaryQuery.data;
  const statusMeta = getTournamentStatusMeta(tournament.status);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Register a team</h1>
          <p className="text-muted-foreground">
            Submit one of your teams to compete in {tournament.name}.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link
            params={{ tournamentId }}
            search={{}}
            to="/tournaments/$tournamentId"
          >
            Back
          </Link>
        </Button>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{tournament.name}</span>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
          </CardTitle>
          <CardDescription>
            Registration closes{" "}
            {formatDateTime(tournament.registrationDeadline)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Starts</p>
            <p className="font-medium">
              {formatDateTime(tournament.startDate)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Teams registered</p>
            <p className="font-medium">{tournament.registeredTeams}</p>
          </div>
        </CardContent>
      </Card>

      {!hasTeams && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle>No eligible teams</CardTitle>
            <CardDescription>
              You need to own or mentor a team before registering for a
              tournament.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link search={{}} to="/teams">
                Browse teams
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registration form</CardTitle>
          <CardDescription>
            Assign one of your teams and include optional notes for the
            organizers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field name="organizationId">
              {(field) => (
                <FormField
                  disabled={!hasTeams || registerTeam.isPending}
                  htmlFor={field.name}
                  label="Select team"
                  required
                >
                  <Select
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    value={field.state.value}
                  >
                    <option value="">Choose a team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                        {team.role ? ` (${team.role})` : ""}
                      </option>
                    ))}
                  </Select>
                  <FieldErrors errors={field.state.meta.errors} />
                  {teamsQuery.error && (
                    <p className="text-destructive text-sm">
                      Unable to load your teams right now.
                    </p>
                  )}
                </FormField>
              )}
            </form.Field>

            <form.Field name="notes">
              {(field) => (
                <FormField
                  description="Share context for the organizers (optional)."
                  disabled={registerTeam.isPending}
                  htmlFor={field.name}
                  label="Notes"
                >
                  <Textarea
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    rows={4}
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Need to update your team?{" "}
                <Link className="underline" search={{}} to="/teams">
                  Go to Teams
                </Link>
              </p>
              <Button
                disabled={!hasTeams || registerTeam.isPending}
                type="submit"
              >
                {registerTeam.isPending ? "Submitting..." : "Register team"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
