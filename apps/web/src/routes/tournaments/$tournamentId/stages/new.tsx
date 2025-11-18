import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { FieldErrors, FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import { StageTeamSelector } from "@/components/stage-team-selector";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import {
  TOURNAMENT_STAGE_STATUSES,
  TOURNAMENT_STAGE_TYPES,
  type TournamentStageType,
} from "@/utils/stages";
import {
  type StageCreateFormValues,
  stageCreateFormSchema,
} from "./form-utils";

type TournamentDetail = {
  name: string;
  participants: Array<{
    organizationId: string;
    teamName: string | null;
    teamSlug: string | null;
    teamLocation: string | null;
  }>;
};

type StageListResponse = {
  stages: Array<{ id: string }>;
};

export const Route = createFileRoute("/tournaments/$tournamentId/stages/new")({
  component: CreateStagePage,
  beforeLoad: async ({ params }) => {
    const session = await authClient.getSession();
    if (
      !session.data ||
      (session.data.user as { role?: string }).role !== "ADMIN"
    ) {
      throw redirect({
        params,
        to: "/tournaments/$tournamentId/stages",
      });
    }
  },
});

function useTournament(tournamentId: string) {
  return useQuery<TournamentDetail>({
    queryKey: ["tournament", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tournament.");
      }
      return response.json() as Promise<TournamentDetail>;
    },
  });
}

function useStageCount(tournamentId: string) {
  return useQuery<StageListResponse>({
    queryKey: ["tournament-stages", tournamentId, "meta"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to load stage metadata.");
      }
      return response.json() as Promise<StageListResponse>;
    },
  });
}

function CreateStagePage() {
  const { tournamentId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const tournamentQuery = useTournament(tournamentId);
  const stageCountQuery = useStageCount(tournamentId);

  const createStage = useMutation({
    mutationFn: async (payload: StageCreateFormValues) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: payload.name.trim(),
            type: payload.type,
            status: payload.status,
            stageOrder: payload.stageOrder,
            teamIds: payload.teamOrder,
            generateMatches: payload.generateMatches,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to create stage.");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Stage created.");
      await queryClient.invalidateQueries({
        queryKey: ["tournament-stages", tournamentId],
      });
      await navigate({
        params: { tournamentId },
        to: "/tournaments/$tournamentId/stages",
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to create stage."
      );
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      status: "PENDING",
      type: "FIRST_ROUND" as TournamentStageType,
      stageOrder: 1,
      teamOrder: [] as string[],
      generateMatches: true,
    },
    onSubmit: async ({ value }) => {
      const result = stageCreateFormSchema.safeParse(value);
      if (!result.success) {
        toast.error(
          `Validation failed: ${result.error.issues[0]?.message ?? "Unknown error"}`
        );
        return;
      }
      await createStage.mutateAsync(result.data);
    },
  });

  useEffect(() => {
    if (stageCountQuery.data?.stages) {
      form.setFieldValue("stageOrder", stageCountQuery.data.stages.length + 1);
    }
  }, [form, stageCountQuery.data]);

  if (tournamentQuery.isPending || stageCountQuery.isPending) {
    return <Loader />;
  }

  if (tournamentQuery.error || stageCountQuery.error) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load stage form</CardTitle>
            <CardDescription>
              {(tournamentQuery.error ?? stageCountQuery.error) instanceof Error
                ? (tournamentQuery.error ?? stageCountQuery.error)?.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const teams =
    tournamentQuery.data?.participants?.map((participant) => ({
      id: participant.organizationId,
      name: participant.teamName ?? "Unnamed team",
      slug: participant.teamSlug,
      location: participant.teamLocation,
    })) ?? [];

  const disableForm = createStage.isPending || teams.length === 0;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Create stage</h1>
          <p className="text-muted-foreground">
            Add a new competition phase for this tournament.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link
            params={{ tournamentId }}
            to="/tournaments/$tournamentId/stages"
          >
            Cancel
          </Link>
        </Button>
      </div>
      {teams.length === 0 && (
        <Card className="border-warning/40 bg-warning/10">
          <CardHeader>
            <CardTitle>No registered teams</CardTitle>
            <CardDescription>
              At least two registered teams are required before creating a
              stage.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Stage settings</CardTitle>
          <CardDescription>
            Configure the structure, order, and participating teams.
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
            <div className="grid gap-4 md:grid-cols-2">
              <form.Field name="name">
                {(field) => (
                  <FormField
                    disabled={disableForm}
                    htmlFor={field.name}
                    label="Stage name"
                    required
                  >
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      value={field.state.value}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="stageOrder">
                {(field) => (
                  <FormField
                    disabled={disableForm}
                    htmlFor={field.name}
                    label="Stage order"
                    required
                  >
                    <Input
                      id={field.name}
                      min={1}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          Number.parseInt(event.target.value, 10) || 1
                        )
                      }
                      type="number"
                      value={field.state.value}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <form.Field name="type">
                {(field) => (
                  <FormField
                    disabled={disableForm}
                    htmlFor={field.name}
                    label="Stage type"
                    required
                  >
                    <Select
                      id={field.name}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value as TournamentStageType
                        )
                      }
                      value={field.state.value}
                    >
                      {TOURNAMENT_STAGE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </form.Field>
              <form.Field name="status">
                {(field) => (
                  <FormField
                    disabled={disableForm}
                    htmlFor={field.name}
                    label="Status"
                    required
                  >
                    <Select
                      id={field.name}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      value={field.state.value}
                    >
                      {TOURNAMENT_STAGE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll("_", " ")}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </form.Field>
            </div>
            <form.Field name="teamOrder">
              {(field) => (
                <FormField
                  disabled={disableForm}
                  htmlFor={field.name}
                  label="Teams & seeds"
                  required
                >
                  <StageTeamSelector
                    disabled={disableForm}
                    onChange={field.handleChange}
                    options={teams}
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>
            <form.Field name="generateMatches">
              {(field) => (
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={field.state.value}
                    disabled={disableForm}
                    id="generateMatches"
                    onCheckedChange={(checked) =>
                      field.handleChange(Boolean(checked))
                    }
                  />
                  <div>
                    <label className="font-medium" htmlFor="generateMatches">
                      Generate matches automatically
                    </label>
                    <p className="text-muted-foreground text-sm">
                      Create bracket pairings immediately based on the stage
                      type.
                    </p>
                  </div>
                </div>
              )}
            </form.Field>
            <div className="flex justify-end gap-2">
              <Button disabled={disableForm} type="submit">
                {createStage.isPending ? "Creating..." : "Create stage"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
