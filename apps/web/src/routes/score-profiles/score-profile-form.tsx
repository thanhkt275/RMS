import { useForm } from "@tanstack/react-form";
import { PlusCircle, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { FieldErrors, FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  BooleanScoreProfilePart,
  NumberScoreProfilePart,
  ScoreProfilePenaltyRule,
} from "@/utils/score-profiles";
import {
  SCORE_PROFILE_COOP_APPLIES_TO,
  SCORE_PROFILE_PART_TYPES,
  SCORE_PROFILE_PENALTY_DIRECTIONS,
  SCORE_PROFILE_PENALTY_TARGETS,
} from "@/utils/score-profiles";
import {
  createBooleanPart,
  createEmptyScoreProfileValues,
  createNumberPart,
  createPenaltyRule,
  type ScoreProfileFormValues,
  scoreProfileFormSchema,
} from "./form-utils";

type ScoreProfileFormProps = {
  initialValues?: ScoreProfileFormValues;
  onSubmit: (values: ScoreProfileFormValues) => Promise<void>;
  submitLabel: string;
  isSubmitting?: boolean;
};

const FORMULA_IDENTIFIER_REGEX = /[A-Za-z0-9_-]+/g;

type FormulaHelper = {
  token: string;
  label: string;
  description: string;
};

const PENALTY_HELPERS: FormulaHelper[] = [
  {
    token: "TOTAL_PENALTIES_SELF",
    label: "Penalties against this team",
    description: "Points deducted from the infringing team.",
  },
  {
    token: "TOTAL_PENALTIES_OPPONENT",
    label: "Penalties against the opponent",
    description: "Points applied to the opposing team.",
  },
  {
    token: "NET_PENALTIES",
    label: "Net penalty swing",
    description: "Opponent penalties minus penalties applied to you.",
  },
];

const FORMULA_EXAMPLES = [
  "auto + teleop + endgame - TOTAL_PENALTIES_SELF",
  "(auto + teleop) * 2 - TOTAL_PENALTIES_OPPONENT",
  "TOTAL_PENALTIES_SELF - TOTAL_PENALTIES_OPPONENT",
];

type FormulaReferences = {
  referencedParts: string[];
  referencedHelpers: string[];
  unknownTokens: string[];
};

type NormalizedPart = {
  id: string;
  label: string;
};

function deriveFormulaReferences(
  formula: string,
  partIds: string[]
): FormulaReferences {
  const tokens = Array.from(
    new Set(
      (formula.match(FORMULA_IDENTIFIER_REGEX) ?? [])
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    )
  );

  const partSet = new Set(partIds);
  const helperSet = new Set(PENALTY_HELPERS.map((helper) => helper.token));

  const referencedParts: string[] = [];
  const referencedHelpers: string[] = [];
  const unknownTokens: string[] = [];

  for (const token of tokens) {
    if (partSet.has(token)) {
      referencedParts.push(token);
    } else if (helperSet.has(token)) {
      referencedHelpers.push(token);
    } else {
      unknownTokens.push(token);
    }
  }

  return {
    referencedParts,
    referencedHelpers,
    unknownTokens,
  };
}

const defaultValues = createEmptyScoreProfileValues();

export function ScoreProfileForm({
  initialValues = defaultValues,
  onSubmit,
  submitLabel,
  isSubmitting,
}: ScoreProfileFormProps) {
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: async ({ value }) => {
        try {
          await scoreProfileFormSchema.parseAsync(value);
        } catch (error) {
          return error;
        }
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  const { parts, penalties } = form.state.values;
  const disableFields = Boolean(isSubmitting);

  const setParts = (next: ScoreProfileFormValues["parts"]) => {
    form.setFieldValue("parts", next);
  };

  const setPenalties = (next: ScoreProfileFormValues["penalties"]) => {
    form.setFieldValue("penalties", next);
  };

  const setNumberPart = (index: number, value: NumberScoreProfilePart) => {
    const next = parts.map((part, idx) =>
      idx === index ? value : part
    ) as ScoreProfileFormValues["parts"];
    setParts(next);
  };

  const setBooleanPart = (index: number, value: BooleanScoreProfilePart) => {
    const next = parts.map((part, idx) =>
      idx === index ? value : part
    ) as ScoreProfileFormValues["parts"];
    setParts(next);
  };

  const switchPartType = (index: number, nextType: "NUMBER" | "BOOLEAN") => {
    const current = parts[index];
    if (!current || current.type === nextType) {
      return;
    }
    if (nextType === "NUMBER") {
      setNumberPart(
        index,
        createNumberPart({
          id: current.id,
          label: current.label,
          description: current.description,
          cooperativeBonus: current.cooperativeBonus,
        })
      );
      return;
    }
    setBooleanPart(
      index,
      createBooleanPart({
        id: current.id,
        label: current.label,
        description: current.description,
        cooperativeBonus: current.cooperativeBonus,
      })
    );
  };

  const toggleCooperativeBonus = (index: number) => {
    const part = parts[index];
    if (!part) {
      return;
    }
    if (part.cooperativeBonus) {
      if (part.type === "NUMBER") {
        setNumberPart(index, { ...part, cooperativeBonus: undefined });
      } else {
        setBooleanPart(index, { ...part, cooperativeBonus: undefined });
      }
      return;
    }
    const defaultBonus = {
      requiredTeamCount: 2 as const,
      bonusPoints: 10,
      appliesTo: "PER_TEAM" as const,
      description: "",
    };
    if (part.type === "NUMBER") {
      setNumberPart(index, { ...part, cooperativeBonus: defaultBonus });
    } else {
      setBooleanPart(index, { ...part, cooperativeBonus: defaultBonus });
    }
  };

  const removePart = (index: number) => {
    if (parts.length <= 1) {
      return;
    }
    setParts(parts.filter((_, idx) => idx !== index));
  };

  const removePenalty = (index: number) => {
    setPenalties(penalties.filter((_, idx) => idx !== index));
  };

  const updatePenalty = (
    index: number,
    updates: Partial<ScoreProfilePenaltyRule>
  ) => {
    setPenalties(
      penalties.map((penalty, idx) =>
        idx === index ? { ...penalty, ...updates } : penalty
      )
    );
  };

  const renderPartBadge = (type: "NUMBER" | "BOOLEAN") => {
    if (type === "NUMBER") {
      return <Badge variant="outline">Numeric</Badge>;
    }
    return <Badge variant="outline">Boolean</Badge>;
  };

  const totalFormulaRef = useRef<HTMLTextAreaElement | null>(null);

  const normalizedParts = useMemo<NormalizedPart[]>(
    () =>
      parts.map((part) => ({
        id: part.id.trim(),
        label: part.label.trim(),
      })),
    [parts]
  );

  const normalizedPartsWithId = useMemo(
    () => normalizedParts.filter((part) => part.id.length > 0),
    [normalizedParts]
  );

  const normalizedPartIds = useMemo(
    () => normalizedPartsWithId.map((part) => part.id),
    [normalizedPartsWithId]
  );

  const formulaReferences = useMemo(
    () =>
      deriveFormulaReferences(
        form.state.values.totalFormula,
        normalizedPartIds
      ),
    [form.state.values.totalFormula, normalizedPartIds]
  );

  const insertFormulaToken = (token: string) => {
    if (disableFields || !token) {
      return;
    }
    const textarea = totalFormulaRef.current;
    const currentValue = form.state.values.totalFormula;
    const start = textarea?.selectionStart ?? currentValue.length;
    const end = textarea?.selectionEnd ?? start;
    const nextValue =
      currentValue.slice(0, start) + token + currentValue.slice(end);
    form.setFieldValue("totalFormula", nextValue);
    const focusTextarea = () => {
      const input = totalFormulaRef.current;
      if (!input) {
        return;
      }
      input.focus();
      const position = start + token.length;
      input.setSelectionRange(position, position);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(focusTextarea);
    } else {
      focusTextarea();
    }
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>
            Describe the scoring model so other admins understand when to use
            it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <form.Field name="name">
            {(field) => (
              <FormField
                disabled={disableFields}
                htmlFor={field.name}
                label="Profile name"
                required
              >
                <Input
                  disabled={disableFields}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="FTC Freight Frenzy"
                  value={field.state.value}
                />
                <FieldErrors errors={field.state.meta.errors} />
              </FormField>
            )}
          </form.Field>
          <form.Field name="version">
            {(field) => (
              <FormField
                disabled={disableFields}
                htmlFor={field.name}
                label="Version"
                required
              >
                <Input
                  disabled={disableFields}
                  id={field.name}
                  min={1}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(Number(event.target.value) || 1)
                  }
                  type="number"
                  value={field.state.value}
                />
                <FieldErrors errors={field.state.meta.errors} />
              </FormField>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <FormField
                className="md:col-span-2"
                disabled={disableFields}
                htmlFor={field.name}
                label="Description"
              >
                <Textarea
                  disabled={disableFields}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Used for the 2026 RMS modern robotics season."
                  value={field.state.value}
                />
                <FieldErrors errors={field.state.meta.errors} />
              </FormField>
            )}
          </form.Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Step 1 · Build parts
            </p>
            <CardTitle>Scoring parts</CardTitle>
            <CardDescription>
              Define every challenge section and assign an ID for the formula
              toolkit.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={disableFields}
              onClick={() => setParts([...parts, createNumberPart()])}
              type="button"
              variant="secondary"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add numeric part
            </Button>
            <Button
              disabled={disableFields}
              onClick={() => setParts([...parts, createBooleanPart()])}
              type="button"
              variant="secondary"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add boolean part
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Part IDs appear in the formula helper so you can insert them without
            memorizing names.
          </p>
          {parts.map((part, index) => (
            <div className="rounded-lg border p-4 shadow-sm" key={part.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Part {index + 1}</Badge>
                  {renderPartBadge(part.type)}
                </div>
                <div className="flex gap-2">
                  <Select
                    disabled={disableFields}
                    onChange={(event) =>
                      switchPartType(
                        index,
                        event.target.value as "NUMBER" | "BOOLEAN"
                      )
                    }
                    value={part.type}
                  >
                    {SCORE_PROFILE_PART_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "NUMBER" ? "Numeric" : "Boolean"}
                      </option>
                    ))}
                  </Select>
                  <Button
                    disabled={disableFields || parts.length <= 1}
                    onClick={() => removePart(index)}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FormField disabled={disableFields} label="Part ID" required>
                  <Input
                    disabled={disableFields}
                    onChange={(event) => {
                      const id = event.target.value;
                      if (part.type === "NUMBER") {
                        setNumberPart(index, { ...part, id });
                      } else {
                        setBooleanPart(index, { ...part, id });
                      }
                    }}
                    placeholder="auto-task"
                    value={part.id}
                  />
                </FormField>
                <FormField disabled={disableFields} label="Label" required>
                  <Input
                    disabled={disableFields}
                    onChange={(event) => {
                      const label = event.target.value;
                      if (part.type === "NUMBER") {
                        setNumberPart(index, { ...part, label });
                      } else {
                        setBooleanPart(index, { ...part, label });
                      }
                    }}
                    placeholder="Autonomous shipping hub"
                    value={part.label}
                  />
                </FormField>
                <FormField
                  className="md:col-span-2"
                  disabled={disableFields}
                  label="Description"
                >
                  <Textarea
                    disabled={disableFields}
                    onChange={(event) => {
                      const description = event.target.value;
                      if (part.type === "NUMBER") {
                        setNumberPart(index, { ...part, description });
                      } else {
                        setBooleanPart(index, { ...part, description });
                      }
                    }}
                    placeholder="Describe how this section is scored."
                    value={part.description ?? ""}
                  />
                </FormField>
                {part.type === "NUMBER" ? (
                  <>
                    <FormField
                      disabled={disableFields}
                      label="Points per unit"
                      required
                    >
                      <Input
                        disabled={disableFields}
                        min={0}
                        onChange={(event) =>
                          setNumberPart(index, {
                            ...part,
                            pointsPerUnit: Number(event.target.value) || 0,
                          })
                        }
                        type="number"
                        value={part.pointsPerUnit}
                      />
                    </FormField>
                    <FormField disabled={disableFields} label="Max value">
                      <Input
                        disabled={disableFields}
                        min={0}
                        onChange={(event) =>
                          setNumberPart(index, {
                            ...part,
                            maxValue:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                        placeholder="Leave blank for no limit"
                        type="number"
                        value={
                          part.maxValue === null || part.maxValue === undefined
                            ? ""
                            : part.maxValue
                        }
                      />
                    </FormField>
                  </>
                ) : (
                  <FormField
                    disabled={disableFields}
                    label="Points when true"
                    required
                  >
                    <Input
                      disabled={disableFields}
                      min={0}
                      onChange={(event) =>
                        setBooleanPart(index, {
                          ...part,
                          truePoints: Number(event.target.value) || 0,
                        })
                      }
                      type="number"
                      value={part.truePoints}
                    />
                  </FormField>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <FormField disabled={disableFields} label="Cooperative bonus">
                  <div className="flex flex-wrap items-center gap-2">
                    <Switch
                      checked={Boolean(part.cooperativeBonus)}
                      disabled={disableFields}
                      onCheckedChange={() => toggleCooperativeBonus(index)}
                    />
                    <p className="text-muted-foreground text-sm">
                      Award bonus points when every team completes this task.
                    </p>
                  </div>
                </FormField>
                {part.cooperativeBonus ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField disabled={disableFields} label="Required teams">
                      <Select
                        disabled={disableFields}
                        onChange={(event) => {
                          const requiredTeamCount = Number(
                            event.target.value
                          ) as 2 | 4;
                          const bonus = part.cooperativeBonus;
                          if (part.type === "NUMBER" && bonus) {
                            const numberPart = part as NumberScoreProfilePart;
                            setNumberPart(index, {
                              ...numberPart,
                              cooperativeBonus: {
                                requiredTeamCount,
                                bonusPoints: bonus.bonusPoints,
                                appliesTo: bonus.appliesTo,
                                description: bonus.description,
                              },
                            });
                          } else if (bonus) {
                            const booleanPart = part as BooleanScoreProfilePart;
                            setBooleanPart(index, {
                              ...booleanPart,
                              cooperativeBonus: {
                                requiredTeamCount,
                                bonusPoints: bonus.bonusPoints,
                                appliesTo: bonus.appliesTo,
                                description: bonus.description,
                              },
                            });
                          }
                        }}
                        value={String(part.cooperativeBonus.requiredTeamCount)}
                      >
                        {[2, 4].map((value) => (
                          <option key={value} value={value}>
                            {value} teams
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField disabled={disableFields} label="Bonus points">
                      <Input
                        disabled={disableFields}
                        min={0}
                        onChange={(event) => {
                          const bonusPoints = Number(event.target.value) || 0;
                          const bonus = part.cooperativeBonus;
                          if (part.type === "NUMBER" && bonus) {
                            const numberPart = part as NumberScoreProfilePart;
                            setNumberPart(index, {
                              ...numberPart,
                              cooperativeBonus: {
                                requiredTeamCount: bonus.requiredTeamCount,
                                bonusPoints,
                                appliesTo: bonus.appliesTo,
                                description: bonus.description,
                              },
                            });
                          } else if (bonus) {
                            const booleanPart = part as BooleanScoreProfilePart;
                            setBooleanPart(index, {
                              ...booleanPart,
                              cooperativeBonus: {
                                requiredTeamCount: bonus.requiredTeamCount,
                                bonusPoints,
                                appliesTo: bonus.appliesTo,
                                description: bonus.description,
                              },
                            });
                          }
                        }}
                        type="number"
                        value={part.cooperativeBonus.bonusPoints}
                      />
                    </FormField>
                    <FormField
                      disabled={disableFields}
                      label="Bonus applies to"
                    >
                      <Select
                        disabled={disableFields}
                        onChange={(event) => {
                          const appliesTo = event.target
                            .value as (typeof SCORE_PROFILE_COOP_APPLIES_TO)[number];
                          const bonus = part.cooperativeBonus;
                          if (part.type === "NUMBER" && bonus) {
                            const numberPart = part as NumberScoreProfilePart;
                            setNumberPart(index, {
                              ...numberPart,
                              cooperativeBonus: {
                                requiredTeamCount: bonus.requiredTeamCount,
                                bonusPoints: bonus.bonusPoints,
                                appliesTo,
                                description: bonus.description,
                              },
                            });
                          } else if (bonus) {
                            const booleanPart = part as BooleanScoreProfilePart;
                            setBooleanPart(index, {
                              ...booleanPart,
                              cooperativeBonus: {
                                requiredTeamCount: bonus.requiredTeamCount,
                                bonusPoints: bonus.bonusPoints,
                                appliesTo,
                                description: bonus.description,
                              },
                            });
                          }
                        }}
                        value={part.cooperativeBonus.appliesTo}
                      >
                        {SCORE_PROFILE_COOP_APPLIES_TO.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode === "ALL_TEAMS" ? "All teams" : "Each team"}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField
                      className="md:col-span-2"
                      disabled={disableFields}
                      label="Bonus description"
                    >
                      <Input
                        disabled={disableFields}
                        onChange={(event) => {
                          const bonus = part.cooperativeBonus;
                          if (part.type === "NUMBER" && bonus) {
                            const numberPart = part as NumberScoreProfilePart;
                            const updatedBonus = {
                              requiredTeamCount: bonus.requiredTeamCount,
                              bonusPoints: bonus.bonusPoints,
                              appliesTo: bonus.appliesTo,
                              description: event.target.value,
                            } as const;
                            setNumberPart(index, {
                              ...numberPart,
                              cooperativeBonus: updatedBonus,
                            });
                          } else if (bonus) {
                            const booleanPart = part as BooleanScoreProfilePart;
                            const updatedBonus = {
                              requiredTeamCount: bonus.requiredTeamCount,
                              bonusPoints: bonus.bonusPoints,
                              appliesTo: bonus.appliesTo,
                              description: event.target.value,
                            } as const;
                            setBooleanPart(index, {
                              ...booleanPart,
                              cooperativeBonus: updatedBonus,
                            });
                          }
                        }}
                        placeholder="Awarded when every team completes the task."
                        value={part.cooperativeBonus.description ?? ""}
                      />
                    </FormField>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {parts.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Add at least one scoring section.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Step 2 · Penalties
            </p>
            <CardTitle>Penalties</CardTitle>
            <CardDescription>
              Track deductions or opponent bonuses applied by referees before
              referencing them in the formula.
            </CardDescription>
          </div>
          <Button
            disabled={disableFields}
            onClick={() => setPenalties([...penalties, createPenaltyRule()])}
            type="button"
            variant="secondary"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Add penalty
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {penalties.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No penalties configured. Opponent bonuses and deductions can be
              defined later.
            </p>
          )}
          {penalties.map((penalty, index) => (
            <div className="rounded-lg border p-4 shadow-sm" key={penalty.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary">Penalty {index + 1}</Badge>
                <Button
                  disabled={disableFields}
                  onClick={() => removePenalty(index)}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FormField disabled={disableFields} label="Penalty ID" required>
                  <Input
                    disabled={disableFields}
                    onChange={(event) =>
                      updatePenalty(index, { id: event.target.value })
                    }
                    placeholder="minor-penalty"
                    value={penalty.id}
                  />
                </FormField>
                <FormField disabled={disableFields} label="Label" required>
                  <Input
                    disabled={disableFields}
                    onChange={(event) =>
                      updatePenalty(index, { label: event.target.value })
                    }
                    placeholder="Minor penalty"
                    value={penalty.label}
                  />
                </FormField>
                <FormField
                  className="md:col-span-2"
                  disabled={disableFields}
                  label="Description"
                >
                  <Textarea
                    disabled={disableFields}
                    onChange={(event) =>
                      updatePenalty(index, { description: event.target.value })
                    }
                    placeholder="Robot entered the opponent launch zone."
                    value={penalty.description ?? ""}
                  />
                </FormField>
                <FormField disabled={disableFields} label="Points" required>
                  <Input
                    disabled={disableFields}
                    min={0}
                    onChange={(event) =>
                      updatePenalty(index, {
                        points: Number(event.target.value) || 0,
                      })
                    }
                    type="number"
                    value={penalty.points}
                  />
                </FormField>
                <FormField disabled={disableFields} label="Target" required>
                  <Select
                    disabled={disableFields}
                    onChange={(event) =>
                      updatePenalty(index, {
                        target: event.target
                          .value as (typeof SCORE_PROFILE_PENALTY_TARGETS)[number],
                      })
                    }
                    value={penalty.target}
                  >
                    {SCORE_PROFILE_PENALTY_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {target === "SELF"
                          ? "Apply to infringing team"
                          : "Apply to opponent"}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField disabled={disableFields} label="Direction" required>
                  <Select
                    disabled={disableFields}
                    onChange={(event) =>
                      updatePenalty(index, {
                        direction: event.target
                          .value as (typeof SCORE_PROFILE_PENALTY_DIRECTIONS)[number],
                      })
                    }
                    value={penalty.direction}
                  >
                    {SCORE_PROFILE_PENALTY_DIRECTIONS.map((direction) => (
                      <option key={direction} value={direction}>
                        {direction === "SUBTRACT"
                          ? "Subtract from team"
                          : "Add to opponent"}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Step 3 · Total formula
            </p>
            <CardTitle>Total formula</CardTitle>
            <CardDescription>
              Document how the final score is calculated and use the helper
              tokens to insert scoring parts or penalty totals.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,320px)]">
          <div className="space-y-4">
            <form.Field name="totalFormula">
              {(field) => (
                <FormField
                  description="Reference part IDs or summarize the calculation logic."
                  disabled={disableFields}
                  htmlFor={field.name}
                  label="Formula"
                  required
                >
                  <Textarea
                    disabled={disableFields}
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="SUM(auto) + driver + endgame - penalties"
                    ref={totalFormulaRef}
                    value={field.state.value}
                  />
                  <div className="mt-3 flex flex-wrap gap-3 text-muted-foreground text-xs">
                    <span>
                      Parts referenced:&nbsp;
                      {formulaReferences.referencedParts.length
                        ? formulaReferences.referencedParts.join(", ")
                        : "None"}
                    </span>
                    <span>
                      Helpers:&nbsp;
                      {formulaReferences.referencedHelpers.length
                        ? formulaReferences.referencedHelpers.join(", ")
                        : "None"}
                    </span>
                  </div>
                  {formulaReferences.unknownTokens.length > 0 && (
                    <p className="mt-1 font-semibold text-destructive text-xs">
                      Unknown tokens:{" "}
                      {formulaReferences.unknownTokens.join(", ")}
                    </p>
                  )}
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>
            <form.Field name="notes">
              {(field) => (
                <FormField
                  description="Optional context about referee expectations or tiebreakers."
                  disabled={disableFields}
                  htmlFor={field.name}
                  label="Notes"
                >
                  <Textarea
                    disabled={disableFields}
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Autonomous points double when all teams finish within 30 seconds."
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>
          </div>
          <div className="space-y-5 rounded-2xl border border-muted-foreground/40 border-dashed bg-muted/60 p-4 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Formula tokens
              </p>
              <p className="font-semibold text-foreground text-sm">
                Parts (click to insert)
              </p>
              <p className="text-muted-foreground text-xs">
                Click a part ID to insert it where the cursor is focused.
              </p>
              <div className="flex flex-wrap gap-2">
                {normalizedParts.map((part, index) => {
                  const hasId = Boolean(part.id);
                  return (
                    <button
                      aria-label={
                        hasId
                          ? `Insert ${part.id} token`
                          : "Set an ID to enable insertion"
                      }
                      className="flex min-w-[140px] flex-col items-start gap-0.5 rounded-md border border-input/70 bg-background px-3 py-2 text-left font-medium text-[11px] text-foreground transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={disableFields || !hasId}
                      key={`formula-part-${part.id || index}`}
                      onClick={() => hasId && insertFormulaToken(part.id)}
                      type="button"
                    >
                      <span className="font-semibold text-foreground text-xs">
                        {hasId ? part.id : "Set an ID"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {part.label || "Unnamed part"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-foreground text-sm">
                Penalty helpers
              </p>
              <p className="text-muted-foreground text-xs">
                Use these tokens for penalty totals without manual math.
              </p>
              <div className="flex flex-wrap gap-2">
                {PENALTY_HELPERS.map((helper) => (
                  <button
                    aria-label={`Insert ${helper.token}`}
                    className="flex min-w-[160px] flex-col items-start gap-0.5 rounded-md border border-input/70 bg-background px-3 py-2 text-left font-medium text-[11px] text-foreground transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={disableFields}
                    key={helper.token}
                    onClick={() => insertFormulaToken(helper.token)}
                    type="button"
                  >
                    <span className="font-semibold text-foreground text-xs uppercase tracking-wide">
                      {helper.token}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {helper.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {helper.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-sm">Quick examples</p>
              <ul className="space-y-1 text-muted-foreground text-xs">
                {FORMULA_EXAMPLES.map((example) => (
                  <li className="flex items-start gap-2" key={example}>
                    <span className="text-muted-foreground">•</span>
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          disabled={disableFields}
          onClick={() => form.reset()}
          type="button"
          variant="outline"
        >
          Reset
        </Button>
        <Button disabled={disableFields} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
