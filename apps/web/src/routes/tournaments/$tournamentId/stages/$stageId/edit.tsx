import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  type StageUpdateFormValues,
  stageUpdateFormSchema,
} from "../form-utils";

type StageDetailResponse = {
  stage: {
    id: string;
    name: string;
    status: string;
    type: string;
    stageOrder: number;
    teams: Array<{
      id: string;
      name: string | null;
      slug: string | null;
      location: string | null;
      seed: number | null;
    }>;
  };
};

type TournamentParticipantsResponse = {
  participants: Array<{
    organizationId: string;
    teamName: string | null;
    teamSlug: string | null;
    teamLocation: string | null;
  }>;
};

export const Route = createFileRoute(
  "/tournaments/$tournamentId/stages/$stageId/edit"
)({
  component: EditStagePage,
  beforeLoad: async ({ params }) => {
    const session = await authClient.getSession();
    if (!session.data || session.data.user.role !== "ADMIN") {
      throw redirect({
        params,
        search: {},
        to: "/tournaments/$tournamentId/stages",
      });
    }
  },
});

function useStageDetail(tournamentId: string, stageId: string) {
  return useQuery<StageDetailResponse>({
    queryKey: ["tournament-stages", tournamentId, stageId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch stage.");
      }
      return response.json() as Promise<StageDetailResponse>;
    },
  });
}

function useParticipants(tournamentId: string) {
  return useQuery<TournamentParticipantsResponse>({
    queryKey: ["tournament-participants", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch participants.");
      }
      return response.json() as Promise<TournamentParticipantsResponse>;
    },
  });
}

function EditStagePage() {
  const { stageId, tournamentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stageQuery = useStageDetail(tournamentId, stageId);
  const participantsQuery = useParticipants(tournamentId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateStage = useMutation({
    mutationFn: async (payload: StageUpdateFormValues) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: payload.name.trim(),
            status: payload.status,
            type: payload.type,
            stageOrder: payload.stageOrder,
            teamIds: payload.teamOrder,
            regenerateMatches: payload.regenerateMatches,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to update stage.");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Stage updated.");
      await queryClient.invalidateQueries({
        queryKey: ["tournament-stages", tournamentId],
      });
      await navigate({
        params: { tournamentId },
        search: {},
        to: "/tournaments/$tournamentId/stages",
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to update stage."
      );
    },
  });

  const deleteStage = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/stages/${stageId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to delete stage.");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Stage deleted.");
      await queryClient.invalidateQueries({
        queryKey: ["tournament-stages", tournamentId],
      });
      await navigate({
        params: { tournamentId },
        search: {},
        to: "/tournaments/$tournamentId/stages",
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete stage."
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
      regenerateMatches: false,
    },
    validators: {
      onSubmit: stageUpdateFormSchema,
    },
    onSubmit: async ({ value }) => {
      await updateStage.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (stageQuery.data?.stage) {
      const stage = stageQuery.data.stage;
      const orderedTeams = stage.teams
        .slice()
        .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
        .map((team) => team.id);
      form.reset({
        name: stage.name,
        status: stage.status as StageUpdateFormValues["status"],
        type: stage.type as TournamentStageType,
        stageOrder: stage.stageOrder,
        teamOrder: orderedTeams,
        regenerateMatches: false,
      });
    }
  }, [form, stageQuery.data]);

  if (stageQuery.isPending || participantsQuery.isPending) {
    return <Loader />;
  }

  if (stageQuery.error || participantsQuery.error || !stageQuery.data?.stage) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load stage</CardTitle>
            <CardDescription>
              {(stageQuery.error ?? participantsQuery.error) instanceof Error
                ? (stageQuery.error ?? participantsQuery.error)?.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const teamOptions =
    participantsQuery.data?.participants.map((participant) => ({
      id: participant.organizationId,
      name: participant.teamName ?? "Unnamed team",
      slug: participant.teamSlug,
      location: participant.teamLocation,
    })) ?? [];

  const disableForm =
    updateStage.isPending || deleteStage.isPending || teamOptions.length === 0;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Edit stage</h1>
          <p className="text-muted-foreground">
            Update the phase details, team order, or regenerate matches.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link
            params={{ tournamentId }}
            search={{}}
            to="/tournaments/$tournamentId/stages"
          >
            Back to stages
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stage configuration</CardTitle>
          <CardDescription>
            Save changes to instantly update the bracket.
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
                        field.handleChange(event.target.value)
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
                    <FieldErrors errors={field.state.meta.errors} />
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
                    <FieldErrors errors={field.state.meta.errors} />
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
                    options={teamOptions}
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>
            <form.Field name="regenerateMatches">
              {(field) => (
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={field.state.value}
                    disabled={disableForm}
                    id="regenerateMatches"
                    onCheckedChange={(checked) =>
                      field.handleChange(Boolean(checked))
                    }
                  />
                  <div>
                    <label className="font-medium" htmlFor="regenerateMatches">
                      Regenerate matches after save
                    </label>
                    <p className="text-muted-foreground text-sm">
                      Rebuilds the bracket using the current team order and
                      stage type.
                    </p>
                  </div>
                </div>
              )}
            </form.Field>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  disabled={deleteStage.isPending}
                  onClick={() => {
                    if (confirmDelete) {
                      deleteStage.mutate();
                      setConfirmDelete(false);
                      return;
                    }
                    setConfirmDelete(true);
                  }}
                  type="button"
                  variant="destructive"
                >
                  {confirmDelete ? "Click again to confirm" : "Delete stage"}
                </Button>
                {confirmDelete && (
                  <Button
                    onClick={() => setConfirmDelete(false)}
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button disabled={disableForm} type="submit">
                  {updateStage.isPending ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
