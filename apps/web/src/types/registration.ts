export type RegistrationStepType = "INFO" | "FILE_UPLOAD" | "CONSENT";

export type RegistrationStatus =
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

export type RegistrationStepStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export type InfoStepMetadata = {
  inputLabel?: string;
  helperText?: string;
  maxLength?: number;
};

export type FileUploadStepMetadata = {
  helperText?: string;
  acceptedTypes?: string[];
  maxFiles?: number;
};

export type ConsentStepMetadata = {
  statement?: string;
  helperText?: string;
};

export type RegistrationSubmissionPayload =
  | {
      kind: "INFO";
      responseText: string;
    }
  | {
      kind: "FILE_UPLOAD";
      fileId: string;
      fileName: string;
      fileUrl: string;
    }
  | {
      kind: "CONSENT";
      accepted: boolean;
      acceptedAt: string;
    };

export type RegistrationSubmission = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  payload: RegistrationSubmissionPayload | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
};

type BaseStep = {
  id: string;
  title: string;
  description?: string | null;
  isRequired: boolean;
  stepOrder: number;
  status?: RegistrationStepStatus;
  submission?: RegistrationSubmission | null;
};

export type RegistrationInfoStep = BaseStep & {
  stepType: "INFO";
  metadata: InfoStepMetadata | null;
};

export type RegistrationFileUploadStep = BaseStep & {
  stepType: "FILE_UPLOAD";
  metadata: FileUploadStepMetadata | null;
};

export type RegistrationConsentStep = BaseStep & {
  stepType: "CONSENT";
  metadata: ConsentStepMetadata | null;
};

export type RegistrationStep =
  | RegistrationInfoStep
  | RegistrationFileUploadStep
  | RegistrationConsentStep;

export type RegistrationDetail = {
  registration: {
    id: string;
    status: RegistrationStatus;
    notes?: string | null;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    consentAcceptedAt?: string | null;
  };
  steps: RegistrationStep[];
};

export type RegistrationListItem = {
  id: string;
  status: RegistrationStatus;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  notes?: string | null;
  consentAcceptedAt?: string | null;
  lastActivityAt?: string | null;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
  };
};
