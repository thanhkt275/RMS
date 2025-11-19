import type {
  RegistrationStatus,
  RegistrationStepStatus,
  RegistrationStepType,
} from "@/types/registration";

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "muted";

export const REGISTRATION_STATUSES: RegistrationStatus[] = [
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
];

export const REGISTRATION_STATUS_META: Record<
  RegistrationStatus,
  {
    label: string;
    description: string;
    badgeVariant: BadgeVariant;
  }
> = {
  IN_PROGRESS: {
    label: "In progress",
    description: "The team is still completing the required steps.",
    badgeVariant: "secondary",
  },
  SUBMITTED: {
    label: "Submitted",
    description: "Waiting for the organizers to review the registration.",
    badgeVariant: "warning",
  },
  UNDER_REVIEW: {
    label: "Under review",
    description: "An admin is currently reviewing the submission.",
    badgeVariant: "warning",
  },
  APPROVED: {
    label: "Approved",
    description: "The registration is complete and approved.",
    badgeVariant: "success",
  },
  REJECTED: {
    label: "Changes requested",
    description: "Updates are required before approval.",
    badgeVariant: "destructive",
  },
};

export function getRegistrationStatusMeta(status?: string | null) {
  if (!status) {
    return {
      label: "Unknown",
      description: "Status not available",
      badgeVariant: "outline" as const,
    };
  }
  const normalized = status.toUpperCase() as RegistrationStatus;
  return (
    REGISTRATION_STATUS_META[normalized] ?? {
      label: normalized,
      description: "Status not recognized",
      badgeVariant: "outline" as const,
    }
  );
}

export const REGISTRATION_STEP_STATUS_META: Record<
  RegistrationStepStatus,
  {
    label: string;
    badgeVariant: BadgeVariant;
  }
> = {
  NOT_STARTED: {
    label: "Not started",
    badgeVariant: "outline",
  },
  PENDING: {
    label: "Pending review",
    badgeVariant: "warning",
  },
  APPROVED: {
    label: "Approved",
    badgeVariant: "success",
  },
  REJECTED: {
    label: "Needs updates",
    badgeVariant: "destructive",
  },
};

export function getStepStatusMeta(status?: RegistrationStepStatus) {
  if (!status) {
    return REGISTRATION_STEP_STATUS_META.NOT_STARTED;
  }
  return (
    REGISTRATION_STEP_STATUS_META[status] ?? {
      label: status,
      badgeVariant: "outline",
    }
  );
}

export function getStepTypeLabel(stepType: RegistrationStepType) {
  switch (stepType) {
    case "INFO":
      return "Information";
    case "FILE_UPLOAD":
      return "File upload";
    case "CONSENT":
      return "Consent";
    default:
      return stepType;
  }
}
