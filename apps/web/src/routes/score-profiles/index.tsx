import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
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
import type {
  ScoreProfileModel,
  ScoreProfilesResponse,
} from "@/utils/score-profiles";

export const Route = createFileRoute("/score-profiles/")({
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
  component: ScoreProfilesPage,
});

function ScoreProfilesPage() {
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const user = session.data?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "ADMIN";

  const listQuery = useQuery<ScoreProfilesResponse>({
    queryKey: ["score-profiles"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load score profiles.");
      }
      return response.json() as Promise<ScoreProfilesResponse>;
    },
    enabled: isAdmin,
  });

  const deleteProfile = useMutation({
    mutationFn: async (profileId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles/${profileId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to delete profile.");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Score profile deleted.");
      await queryClient.invalidateQueries({
        queryKey: ["score-profiles"],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete profile."
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

  if (listQuery.isPending) {
    return <Loader />;
  }

  if (listQuery.error) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load score profiles</CardTitle>
            <CardDescription>
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const profiles = listQuery.data?.items ?? [];

  const handleDelete = (profile: ScoreProfileModel) => {
    if (profile.usageCount && profile.usageCount > 0) {
      toast.error("Profiles assigned to tournaments cannot be removed.");
      return;
    }
    // biome-ignore lint: User confirmation needed for deletion
    const confirmed = window.confirm(`Delete score profile "${profile.name}"?`);
    if (!confirmed) {
      return;
    }
    deleteProfile.mutate(profile.id);
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Score profiles</h1>
          <p className="text-muted-foreground">
            Define reusable scoring logic for every tournament and stage.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link
              search={{
                page: 1,
                search: "",
                status: "ALL",
                sortField: "createdAt",
                sortDirection: "desc",
              }}
              to="/tournaments"
            >
              Back to tournaments
            </Link>
          </Button>
          <Button asChild>
            <Link search={{}} to="/score-profiles/new">
              <Plus className="mr-2 h-4 w-4" /> New score profile
            </Link>
          </Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No score profiles yet</CardTitle>
            <CardDescription>
              Capture your autonomous, teleop, and penalty rules as reusable
              JSON definitions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link search={{}} to="/score-profiles/new">
                <Plus className="mr-2 h-4 w-4" /> Create profile
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="text-primary" />
                    <CardTitle>{profile.name}</CardTitle>
                  </div>
                  <CardDescription className="max-w-2xl">
                    {profile.description || "No description provided."}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="secondary">
                    <Link
                      params={{ scoreProfileId: profile.id }}
                      search={{}}
                      to="/score-profiles/$scoreProfileId"
                    >
                      Edit
                    </Link>
                  </Button>
                  <Button
                    disabled={
                      Boolean(profile.usageCount) || deleteProfile.isPending
                    }
                    onClick={() => handleDelete(profile)}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-4">
                <Badge variant="outline">
                  {profile.definition.parts.length} parts
                </Badge>
                <Badge variant="outline">
                  {profile.definition.penalties.length} penalties
                </Badge>
                <Badge variant="outline">
                  {profile.usageCount ?? 0} tournaments
                </Badge>
                <p className="text-muted-foreground text-sm">
                  Updated {formatDateTime(profile.updatedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
