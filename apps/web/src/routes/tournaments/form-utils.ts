import z from "zod";
import { toISOFromLocalInput } from "@/utils/date";
import {
  TOURNAMENT_RESOURCE_TYPES,
  TOURNAMENT_STATUSES,
  type TournamentResourceType,
  type TournamentStatus,
} from "@/utils/tournaments";

export type ResourceField = {
  id: string;
  title: string;
  url: string;
  type: TournamentResourceType;
  description?: string;
};

export type TournamentFormValues = {
  name: string;
  description: string;
  location: string;
  organizer: string;
  season: string;
  status: TournamentStatus;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  announcement: string;
  fieldCount: number;
  resources: ResourceField[];
  scoreProfileId: string;
};

export const statusSchema = z.enum([...TOURNAMENT_STATUSES] as [
  TournamentStatus,
  ...TournamentStatus[],
]);

export const resourceTypeSchema = z.enum([...TOURNAMENT_RESOURCE_TYPES] as [
  TournamentResourceType,
  ...TournamentResourceType[],
]);

export const datetimeSchema = z
  .string()
  .min(1, "Date is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Invalid date",
  });

export const resourceFieldSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "Title is required").max(255),
  url: z.string().url("Provide a valid URL"),
  type: resourceTypeSchema,
  description: z.string().max(500).optional(),
});

export const tournamentFormSchema = z
  .object({
    name: z.string().min(3).max(180),
    description: z.string().max(5000).optional().default(""),
    organizer: z.string().max(255).optional().default(""),
    location: z.string().max(255).optional().default(""),
    season: z.string().max(120).optional().default(""),
    status: statusSchema.default("UPCOMING"),
    startDate: datetimeSchema,
    endDate: datetimeSchema,
    registrationDeadline: datetimeSchema,
    announcement: z.string().max(5000).optional().default(""),
    fieldCount: z
      .number()
      .int()
      .min(1, "At least one field is required")
      .max(50, "Keep it under 50 fields")
      .default(1),
    resources: z.array(resourceFieldSchema).default([]),
    scoreProfileId: z.string().max(128).optional().default(""),
  })
  .refine(
    (value) =>
      new Date(value.endDate).getTime() >= new Date(value.startDate).getTime(),
    {
      message: "End date must be after the start date",
      path: ["endDate"],
    }
  )
  .refine(
    (value) =>
      new Date(value.registrationDeadline).getTime() <=
      new Date(value.startDate).getTime(),
    {
      message: "Deadline must be before the start",
      path: ["registrationDeadline"],
    }
  ) satisfies z.ZodType<TournamentFormValues>;

export function createResourceField(
  overrides?: Partial<ResourceField>
): ResourceField {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  return {
    id,
    title: "",
    url: "",
    type: "DOCUMENT",
    description: "",
    ...overrides,
  };
}

export function mapFormValuesToPayload(value: TournamentFormValues) {
  return {
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    organizer: value.organizer?.trim() || undefined,
    season: value.season?.trim() || undefined,
    status: value.status,
    startDate: toISOFromLocalInput(value.startDate),
    endDate: toISOFromLocalInput(value.endDate),
    registrationDeadline: toISOFromLocalInput(value.registrationDeadline),
    announcement: value.announcement?.trim() || undefined,
    fieldCount: Math.max(1, Math.min(50, Math.floor(value.fieldCount))),
    resources: value.resources
      .filter((resource) => resource.title && resource.url)
      .map((resource) => ({
        title: resource.title.trim(),
        url: resource.url.trim(),
        type: resource.type,
        description: resource.description?.trim() || undefined,
      })),
    scoreProfileId: value.scoreProfileId?.trim()
      ? value.scoreProfileId.trim()
      : undefined,
  };
}
