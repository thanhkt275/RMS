import { useForm } from "@tanstack/react-form";
import {
  type UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import {
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";
import type { RegistrationStep } from "@/types/registration";
import { formatDateTime } from "@/utils/date";
import { queryClient } from "@/utils/query-client";
import { getStepTypeLabel } from "@/utils/registrations";
import { getTournamentStatusMeta } from "@/utils/tournaments";

const registerSchema = z.object({
  organizationId: z.string().min(1, "Select a team"),
  notes: z.string().max(1000).optional().default(""),
  consentAccepted: z.boolean().refine((value) => value === true, {
    message: "You must accept the consent form to continue.",
  }),
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

type RegistrationStartResponse = {
  registration: {
    id: string;
    status: string;
    organizationId: string;
  };
};

type RegistrationStepsResponse = {
  steps: RegistrationStep[];
};

export const Route = createFileRoute("/tournaments/$tournamentId/register")({
  component: RegisterTeamPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const user = session.data?.user as AccessControlUser | undefined;
    if (!meetsAccessRule(user, ACCESS_RULES.registeredOnly)) {
      throw redirect({ to: "/sign-in" });
    }
    return { session };
  },
});

function RegisterTeamPage() {
  const { tournamentId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });

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

  const stepsQuery = useQuery<{ steps: RegistrationStep[] }>({
    queryKey: ["tournament", tournamentId, "registration-steps"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/registration/steps`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load registration steps");
      }
      return response.json() as Promise<{ steps: RegistrationStep[] }>;
    },
  });

  const registerTeam = useMutation<
    RegistrationStartResponse,
    Error,
    Record<string, unknown>
  >({
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
      return response.json() as Promise<RegistrationStartResponse>;
    },
    onSuccess: async (data) => {
      toast.success("Team registered successfully");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tournament", tournamentId],
        }),
        queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
      ]);
      await navigate({
        to: "/tournaments/$tournamentId/registration/$registrationId",
        params: {
          tournamentId,
          registrationId: data.registration.id,
        },
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
      consentAccepted: false,
    },
    onSubmit: async ({ value }) => {
      const result = registerSchema.safeParse(value);
      if (!result.success) {
        toast.error(
          `Validation failed: ${result.error.issues[0]?.message ?? "Unknown error"}`
        );
        return;
      }
      await registerTeam.mutateAsync({
        organizationId: result.data.organizationId,
        notes: result.data.notes?.trim() || undefined,
        consentAccepted: result.data.consentAccepted,
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
          <Link params={{ tournamentId }} to="/tournaments/$tournamentId">
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
              <Link
                search={{
                  page: 1,
                  search: "",
                  sortField: "name",
                  sortDirection: "asc",
                }}
                to="/teams"
              >
                Browse teams
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <RegistrationChecklistCard query={stepsQuery} />

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

            <form.Field name="consentAccepted">
              {(field) => (
                <FormField
                  description="You must confirm that you agree to the tournament policies."
                  htmlFor={field.name}
                  label="Consent"
                  required
                >
                  <label
                    className="flex items-start gap-3 text-sm"
                    htmlFor={field.name}
                  >
                    <Checkbox
                      checked={field.state.value}
                      disabled={registerTeam.isPending}
                      id={field.name}
                      onBlur={field.handleBlur}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                    <span className="leading-relaxed">
                      I confirm that our organization has reviewed the
                      registration policies and agrees to follow the event
                      rules.
                    </span>
                  </label>
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Need to update your team?{" "}
                <Link
                  className="underline"
                  search={{
                    page: 1,
                    search: "",
                    sortField: "name",
                    sortDirection: "asc",
                  }}
                  to="/teams"
                >
                  Go to Teams
                </Link>
              </p>
              <Button
                disabled={
                  !hasTeams ||
                  registerTeam.isPending ||
                  !form.state.values.consentAccepted
                }
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

type RegistrationChecklistCardProps = {
  query: UseQueryResult<RegistrationStepsResponse>;
};

function RegistrationChecklistCard({ query }: RegistrationChecklistCardProps) {
  let checklistContent: ReactNode;
  if (query.isPending) {
    checklistContent = (
      <p className="text-muted-foreground text-sm">Loading checklist...</p>
    );
  } else if (query.error) {
    checklistContent = (
      <p className="text-destructive text-sm">
        Unable to load the checklist right now.
      </p>
    );
  } else if (query.data?.steps.length) {
    checklistContent = (
      <ul className="space-y-3">
        {query.data.steps.map((step) => (
          <li
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            key={step.id}
          >
            <div>
              <p className="font-medium">{step.title}</p>
              <p className="text-muted-foreground text-sm">
                {getStepTypeLabel(step.stepType)}
                {step.isRequired ? " • Required" : " • Optional"}
              </p>
            </div>
            <Badge variant={step.isRequired ? "secondary" : "outline"}>
              {step.stepOrder}. {step.stepType.replace("_", " ")}
            </Badge>
          </li>
        ))}
      </ul>
    );
  } else {
    checklistContent = (
      <p className="text-muted-foreground text-sm">
        This tournament has not published additional registration steps.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration checklist</CardTitle>
        <CardDescription>
          Review the required tasks before starting your submission.
        </CardDescription>
      </CardHeader>
      <CardContent>{checklistContent}</CardContent>
    </Card>
  );
}
