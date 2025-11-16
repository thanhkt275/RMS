import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
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
import { authClient } from "@/lib/auth-client";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type FieldRoleValue = (typeof FIELD_ROLES)[number]["value"];

type FieldRoleUser = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

type FieldRoleAssignment = {
  id: string;
  fieldNumber: number;
  role: FieldRoleValue;
  user: FieldRoleUser | null;
};

type FieldRolesData = {
  tournament: {
    id: string;
    name: string;
    status: string;
    fieldCount: number;
  };
  fields: Array<{
    fieldNumber: number;
    roles: Record<FieldRoleValue, FieldRoleUser | null>;
  }>;
  assignments: FieldRoleAssignment[];
};

const FIELD_ROLES = [
  { value: "TSO", label: "Tournament Systems Operator (TSO)" },
  { value: "HEAD_REFEREE", label: "Head Referee" },
  { value: "SCORE_KEEPER", label: "Score Keeper" },
  { value: "QUEUER", label: "Queuer" },
] as const;

export const Route = createFileRoute("/tournaments/$tournamentId/field-roles")({
  component: FieldRolesPage,
});

function FieldRolesPage() {
  const { tournamentId } = Route.useParams();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();

  const [modalField, setModalField] = useState<number | null>(null);
  const [assignFormData, setAssignFormData] = useState<{
    [key: number]: { role: string; userId: string };
  }>({});

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const rolesQuery = useQuery<FieldRolesData>({
    queryKey: ["tournament-field-roles", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/field-roles`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch field roles");
      }
      return response.json() as Promise<FieldRolesData>;
    },
    enabled: isAdmin,
  });

  const usersQuery = useQuery<{ users: User[] }>({
    queryKey: ["tournament-field-role-users", tournamentId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/field-roles/users`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      return response.json() as Promise<{ users: User[] }>;
    },
    enabled: isAdmin,
  });

  const assignMutation = useMutation({
    mutationFn: async (data: {
      userId: string;
      fieldNumber: number;
      role: string;
    }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/field-roles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to assign role");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tournament-field-roles", tournamentId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}/field-roles/${assignmentId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to delete assignment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tournament-field-roles", tournamentId],
      });
    },
  });

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need admin privileges to manage field roles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (rolesQuery.isPending || usersQuery.isPending) {
    return <Loader />;
  }

  if (rolesQuery.error || !rolesQuery.data) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load field roles</CardTitle>
            <CardDescription>
              {rolesQuery.error instanceof Error
                ? rolesQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { fields, assignments } = rolesQuery.data;
  const users = usersQuery.data?.users || [];

  const findUserIdForRole = (role: FieldRoleValue | string) =>
    users.find((user) => user.role === role)?.id ?? "";

  const assignmentsByField = assignments.reduce<
    Record<number, FieldRoleAssignment[]>
  >((acc, assignment) => {
    if (!acc[assignment.fieldNumber]) {
      acc[assignment.fieldNumber] = [];
    }
    acc[assignment.fieldNumber].push(assignment);
    return acc;
  }, {});

  const getFieldAssignments = (fieldNumber: number) =>
    assignmentsByField[fieldNumber] ?? [];

  const handleAssign = (fieldNumber: number) => {
    const formData = assignFormData[fieldNumber];

    if (!(formData?.userId && formData?.role)) {
      return;
    }

    assignMutation.mutate(
      {
        userId: formData.userId,
        fieldNumber,
        role: formData.role,
      },
      {
        onSuccess: () => {
          setAssignFormData((prev) => ({
            ...prev,
            [fieldNumber]: { role: "", userId: "" },
          }));
          setModalField(null);
        },
      }
    );
  };

  const openAssignModal = (fieldNumber: number) => {
    setAssignFormData((prev) => ({
      ...prev,
      [fieldNumber]: prev[fieldNumber] ?? { role: "", userId: "" },
    }));
    setModalField(fieldNumber);
  };

  const closeModal = () => {
    assignMutation.reset();
    setModalField(null);
  };

  const updateFormData = (
    fieldNumber: number,
    field: "role" | "userId",
    value: string
  ) => {
    setAssignFormData((prev) => ({
      ...prev,
      [fieldNumber]: {
        role: prev[fieldNumber]?.role || "",
        userId: prev[fieldNumber]?.userId || "",
        [field]: value,
      },
    }));
  };

  const handleRoleChange = (fieldNumber: number, value: FieldRoleValue) => {
    setAssignFormData((prev) => {
      const current = prev[fieldNumber] ?? { role: "", userId: "" };
      const hasSameRole =
        current.userId &&
        users.some((user) => user.id === current.userId && user.role === value);
      return {
        ...prev,
        [fieldNumber]: {
          ...current,
          role: value,
          userId: hasSameRole ? current.userId : findUserIdForRole(value),
        },
      };
    });
  };

  const modalFormData =
    modalField !== null
      ? (assignFormData[modalField] ?? { role: "", userId: "" })
      : undefined;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-4">
        <Button asChild size="sm" variant="ghost">
          <Link
            params={{ tournamentId }}
            search={{}}
            to="/tournaments/$tournamentId"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to tournament
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-bold text-3xl">Manage field roles</h1>
          <p className="text-muted-foreground">
            Assign TSO, Head Referee, Score Keeper, and Queuer roles to users
            for each field.
          </p>
          <p className="text-muted-foreground text-sm">
            Showing {fields.length} field card
            {fields.length === 1 ? "" : "s"} across this tournament.
          </p>
        </div>
        <Badge className="uppercase tracking-widest" variant="secondary">
          {fields.length} field{fields.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fields.map((field, index) => {
          const fieldAssignments = getFieldAssignments(field.fieldNumber);

          return (
            <Card key={field.fieldNumber}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Field {field.fieldNumber}</CardTitle>
                    <CardDescription>
                      Card {index + 1} of {fields.length} total fields
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {fieldAssignments.length} / {FIELD_ROLES.length} roles
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fieldAssignments.length === 0 ? (
                  <div className="rounded-md border border-border border-dashed p-3 text-muted-foreground text-sm">
                    No roles assigned yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldAssignments.map((assignment) => {
                      const userDisplayName =
                        assignment.user?.name ||
                        assignment.user?.email ||
                        "Unknown user";

                      return (
                        <div
                          className="flex items-center justify-between rounded-md border p-2"
                          key={assignment.id}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-sm">
                              {FIELD_ROLES.find(
                                (r) => r.value === assignment.role
                              )?.label || assignment.role}
                            </p>
                            <p className="truncate text-muted-foreground text-xs">
                              {userDisplayName}
                            </p>
                          </div>
                          <Button
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(assignment.id)}
                            size="sm"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => openAssignModal(field.fieldNumber)}
                  size="sm"
                  variant="outline"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign role
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {modalField !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            aria-hidden
            className="absolute inset-0 bg-slate-950/60"
            onClick={closeModal}
          />
          <div
            aria-labelledby="assign-modal-title"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs uppercase tracking-widest">
                Field {modalField} of {fields.length}
              </p>
              <h2 className="font-semibold text-lg" id="assign-modal-title">
                Assign a role
              </h2>
              <p className="text-muted-foreground text-sm">
                Choose a role and a user to staff this field.
              </p>
            </div>
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <label
                  className="font-medium text-sm"
                  htmlFor={`modal-role-${modalField}`}
                >
                  Role
                </label>
                <Select
                  id={`modal-role-${modalField}`}
                  onChange={(e) =>
                    handleRoleChange(
                      modalField,
                      e.target.value as FieldRoleValue
                    )
                  }
                  value={modalFormData?.role || ""}
                >
                  <option value="">Select role</option>
                  {FIELD_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label
                  className="font-medium text-sm"
                  htmlFor={`modal-user-${modalField}`}
                >
                  User
                </label>
                <Select
                  id={`modal-user-${modalField}`}
                  onChange={(e) =>
                    updateFormData(modalField, "userId", e.target.value)
                  }
                  value={modalFormData?.userId || ""}
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button onClick={closeModal} size="sm" variant="ghost">
                Cancel
              </Button>
              <Button
                disabled={
                  assignMutation.isPending ||
                  Boolean(!modalFormData?.userId) ||
                  Boolean(!modalFormData?.role)
                }
                onClick={() => handleAssign(modalField)}
                size="sm"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Assign role
              </Button>
            </div>
            {assignMutation.isError && (
              <p className="mt-4 text-destructive text-xs">
                {assignMutation.error instanceof Error
                  ? assignMutation.error.message
                  : "Failed to assign role"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
