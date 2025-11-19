import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import {
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";
import type {
  RegistrationListItem,
  RegistrationStep,
  RegistrationStepType,
} from "@/types/registration";
import { formatDateTime } from "@/utils/date";
import { queryClient } from "@/utils/query-client";
import {
  getRegistrationStatusMeta,
  getStepTypeLabel,
} from "@/utils/registrations";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

type RegistrationStepsResponse = {
  steps: RegistrationStep[];
};

type RegistrationListResponse = {
  registrations: RegistrationListItem[];
  totalSteps: number;
  requiredSteps: number;
};

export const Route = createFileRoute(
  "/tournaments/$tournamentId/registrations"
)({
  component: ManageRegistrationsPage,
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
});

function ManageRegistrationsPage() {
  const { tournamentId } = Route.useParams();
  const [stepType, setStepType] = useState<RegistrationStepType>("INFO");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [stepOrder, setStepOrder] = useState(1);
  const [inputLabel, setInputLabel] = useState("");
  const [helperText, setHelperText] = useState("");
  const [maxLength, setMaxLength] = useState("500");
  const [acceptedTypes, setAcceptedTypes] = useState("");
  const [statement, setStatement] = useState("");

  const stepsQuery = useQuery<RegistrationStepsResponse>({
    queryKey: ["tournament", tournamentId, "registration-steps"],
    queryFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registration/steps`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load steps");
      }
      return response.json() as Promise<RegistrationStepsResponse>;
    },
  });

  const registrationsQuery = useQuery<RegistrationListResponse>({
    queryKey: ["tournament", tournamentId, "registrations"],
    queryFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registrations`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to load registrations");
      }
      return response.json() as Promise<RegistrationListResponse>;
    },
  });

  useEffect(() => {
    if (stepsQuery.data?.steps.length) {
      setStepOrder(stepsQuery.data.steps.length + 1);
    }
  }, [stepsQuery.data]);

  const createStep = useMutation({
    mutationFn: async () => {
      const metadata = buildStepMetadata({
        stepType,
        inputLabel,
        helperText,
        maxLength,
        acceptedTypes,
        statement,
      });

      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registration/steps`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            title,
            description: description || undefined,
            stepType,
            isRequired,
            stepOrder,
            metadata,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to create step");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Step created");
      setTitle("");
      setDescription("");
      setHelperText("");
      setInputLabel("");
      setMaxLength("500");
      setAcceptedTypes("");
      setStatement("");
      await queryClient.invalidateQueries({
        queryKey: ["tournament", tournamentId, "registration-steps"],
      });
    },
  });

  const deleteStep = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registration/steps/${stepId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Unable to delete step");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Step removed");
      await queryClient.invalidateQueries({
        queryKey: ["tournament", tournamentId, "registration-steps"],
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (stepType === "CONSENT" && !statement.trim()) {
      toast.error("Consent statement is required");
      return;
    }
    createStep.mutate();
  };

  if (stepsQuery.isPending || registrationsQuery.isPending) {
    return <Loader />;
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Registration workflow</h1>
          <p className="text-muted-foreground">
            Configure the checklist and review incoming registrations.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link params={{ tournamentId }} to="/tournaments/$tournamentId">
            View tournament
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="registrations">
        <TabsList>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="steps">Steps</TabsTrigger>
        </TabsList>
        <TabsContent value="registrations">
          {registrationsQuery.data?.registrations.length ? (
            <div className="grid gap-4">
              {registrationsQuery.data.registrations.map((registration) => {
                const statusMeta = getRegistrationStatusMeta(
                  registration.status
                );
                return (
                  <Card key={registration.id}>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          {registration.organization.name}
                          <Badge variant={statusMeta.badgeVariant}>
                            {statusMeta.label}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Last updated{" "}
                          {formatDateTime(registration.lastActivityAt)}
                        </CardDescription>
                      </div>
                      <Button asChild variant="secondary">
                        <Link
                          params={{
                            tournamentId,
                            registrationId: registration.id,
                          }}
                          to="/tournaments/$tournamentId/registration/$registrationId"
                        >
                          Review
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-muted-foreground text-sm">
                          Pending steps
                        </p>
                        <p className="font-semibold">
                          {registration.counts.pending}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-sm">
                          Approved steps
                        </p>
                        <p className="font-semibold">
                          {registration.counts.approved}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-sm">
                          Changes requested
                        </p>
                        <p className="font-semibold">
                          {registration.counts.rejected}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No registrations yet</CardTitle>
                <CardDescription>
                  Teams will appear here once they start the process.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="steps">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Current steps</CardTitle>
                <CardDescription>
                  Steps are executed in the order shown below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stepsQuery.data?.steps.length ? (
                  stepsQuery.data.steps.map((step) => (
                    <div
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                      key={step.id}
                    >
                      <div>
                        <p className="font-medium">
                          {step.stepOrder}. {step.title}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {getStepTypeLabel(step.stepType)} •{" "}
                          {step.isRequired ? "Required" : "Optional"}
                        </p>
                      </div>
                      <Button
                        className="text-destructive"
                        onClick={() => deleteStep.mutate(step.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No steps defined yet.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Add step</CardTitle>
                <CardDescription>
                  Define the next requirement for teams.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <FormField htmlFor="title" label="Title" required>
                    <Input
                      id="title"
                      onChange={(event) => setTitle(event.target.value)}
                      value={title}
                    />
                  </FormField>
                  <FormField htmlFor="description" label="Description">
                    <Textarea
                      id="description"
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      value={description}
                    />
                  </FormField>
                  <FormField htmlFor="stepOrder" label="Step order" required>
                    <Input
                      id="stepOrder"
                      min={1}
                      onChange={(event) =>
                        setStepOrder(Number(event.target.value))
                      }
                      type="number"
                      value={stepOrder}
                    />
                  </FormField>
                  <FormField htmlFor="stepType" label="Step type" required>
                    <Select
                      id="stepType"
                      onChange={(event) =>
                        setStepType(event.target.value as RegistrationStepType)
                      }
                      value={stepType}
                    >
                      <option value="INFO">Information</option>
                      <option value="FILE_UPLOAD">File upload</option>
                      <option value="CONSENT">Consent</option>
                    </Select>
                  </FormField>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isRequired}
                      id="isRequired"
                      onCheckedChange={(checked) =>
                        setIsRequired(Boolean(checked))
                      }
                    />
                    <label className="text-sm" htmlFor="isRequired">
                      Required step
                    </label>
                  </div>

                  {stepType === "INFO" && (
                    <>
                      <FormField htmlFor="inputLabel" label="Response label">
                        <Input
                          id="inputLabel"
                          onChange={(event) =>
                            setInputLabel(event.target.value)
                          }
                          value={inputLabel}
                        />
                      </FormField>
                      <FormField htmlFor="maxLength" label="Max characters">
                        <Input
                          id="maxLength"
                          min={100}
                          onChange={(event) => setMaxLength(event.target.value)}
                          type="number"
                          value={maxLength}
                        />
                      </FormField>
                    </>
                  )}

                  {stepType === "FILE_UPLOAD" && (
                    <FormField
                      htmlFor="acceptedTypes"
                      label="Accepted MIME types"
                    >
                      <Input
                        id="acceptedTypes"
                        onChange={(event) =>
                          setAcceptedTypes(event.target.value)
                        }
                        placeholder="application/pdf,image/png"
                        value={acceptedTypes}
                      />
                    </FormField>
                  )}

                  {stepType === "CONSENT" && (
                    <FormField
                      htmlFor="statement"
                      label="Consent statement"
                      required
                    >
                      <Textarea
                        id="statement"
                        onChange={(event) => setStatement(event.target.value)}
                        rows={3}
                        value={statement}
                      />
                    </FormField>
                  )}

                  <FormField htmlFor="helperText" label="Helper text">
                    <Textarea
                      id="helperText"
                      onChange={(event) => setHelperText(event.target.value)}
                      rows={2}
                      value={helperText}
                    />
                  </FormField>

                  <Button
                    className="w-full"
                    disabled={createStep.isPending}
                    type="submit"
                  >
                    {createStep.isPending ? "Saving..." : "Add step"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ManageRegistrationsPage;

function buildStepMetadata(params: {
  stepType: RegistrationStepType;
  inputLabel: string;
  helperText: string;
  maxLength: string;
  acceptedTypes: string;
  statement: string;
}) {
  if (params.stepType === "INFO") {
    return {
      inputLabel: params.inputLabel || undefined,
      helperText: params.helperText || undefined,
      maxLength: params.maxLength ? Number(params.maxLength) : undefined,
    };
  }
  if (params.stepType === "FILE_UPLOAD") {
    return {
      helperText: params.helperText || undefined,
      acceptedTypes: params.acceptedTypes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }
  return {
    statement: params.statement || undefined,
    helperText: params.helperText || undefined,
  };
}
