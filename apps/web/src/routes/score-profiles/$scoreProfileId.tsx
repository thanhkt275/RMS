import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
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
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";
import { formatDateTime } from "@/utils/date";
import type { ScoreProfileModel } from "@/utils/score-profiles";
import {
  mapFormValuesToPayload,
  type ScoreProfileFormValues,
  toFormValuesFromModel,
} from "./form-utils";
import { ScoreProfileForm } from "./score-profile-form";

export const Route = createFileRoute("/score-profiles/$scoreProfileId")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const user = session.data?.user as AccessControlUser | undefined;
    if (!meetsAccessRule(user, ACCESS_RULES.registeredOnly)) {
      throw redirect({
        to: "/sign-in",
      });
    }
    if (!meetsAccessRule(user, ACCESS_RULES.adminOnly)) {
      throw redirect({
        to: "/tournaments",
        search: {
          page: 1,
          search: "",
          status: "ALL",
          sortField: "createdAt",
          sortDirection: "desc",
        },
      });
    }
    return { session };
  },
  component: EditScoreProfilePage,
});

function EditScoreProfilePage() {
  const { scoreProfileId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const user = session.data?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();

  const detailQuery = useQuery<ScoreProfileModel>({
    queryKey: ["score-profiles", scoreProfileId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles/${scoreProfileId}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load score profile.");
      }
      return response.json() as Promise<ScoreProfileModel>;
    },
    enabled: isAdmin,
  });

  const updateProfile = useMutation({
    mutationFn: async (payload: ReturnType<typeof mapFormValuesToPayload>) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles/${scoreProfileId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to update score profile.");
      }
      return response.json() as Promise<ScoreProfileModel>;
    },
    onSuccess: async () => {
      toast.success("Score profile updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["score-profiles"] }),
        queryClient.invalidateQueries({
          queryKey: ["score-profiles", scoreProfileId],
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to update profile."
      );
    },
  });

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              You need the ADMIN role to configure score profiles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (detailQuery.isPending) {
    return <Loader />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load score profile</CardTitle>
            <CardDescription>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link to="/score-profiles">Back to profiles</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = detailQuery.data;

  const handleSubmit = async (values: ScoreProfileFormValues) => {
    await updateProfile.mutateAsync(mapFormValuesToPayload(values));
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">{profile.name}</h1>
          <p className="text-muted-foreground">
            Manage how matches calculate scores, bonuses, and penalties.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/score-profiles">Back to list</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile summary</CardTitle>
          <CardDescription>
            Version {profile.definition.version} &mdash; last updated{" "}
            {formatDateTime(profile.updatedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge variant="outline">
            {profile.definition.parts.length} scoring parts
          </Badge>
          <Badge variant="outline">
            {profile.definition.penalties.length} penalties
          </Badge>
          <Badge variant="outline">{profile.usageCount ?? 0} tournaments</Badge>
        </CardContent>
      </Card>

      <ScoreProfileForm
        initialValues={toFormValuesFromModel(profile)}
        isSubmitting={updateProfile.isPending}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
      />
    </div>
  );
}
