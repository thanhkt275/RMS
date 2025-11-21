import { useForm } from "@tanstack/react-form";
import { PlusCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FieldErrors, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  BooleanScoreProfilePart,
  NumberScoreProfilePart,
  ScoreProfilePenaltyRule,
} from "@/utils/score-profiles";
import { FormulaHelperSidebar } from "./components/formula-helper-sidebar";
import { PenaltyItem } from "./components/penalty-item";
import { ScoreProfilePartItem } from "./components/score-profile-part-item";
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

const generateClientKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

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
  const totalFormulaRef = useRef<HTMLTextAreaElement | null>(null);
  const [partKeys, setPartKeys] = useState<string[]>(() =>
    parts.map(() => generateClientKey())
  );
  const [penaltyKeys, setPenaltyKeys] = useState<string[]>(() =>
    penalties.map(() => generateClientKey())
  );

  useEffect(() => {
    if (partKeys.length < parts.length) {
      setPartKeys((prev) => [
        ...prev,
        ...Array.from(
          { length: parts.length - prev.length },
          generateClientKey
        ),
      ]);
    } else if (partKeys.length > parts.length) {
      setPartKeys((prev) => prev.slice(0, parts.length));
    }
  }, [partKeys.length, parts.length]);

  useEffect(() => {
    if (penaltyKeys.length < penalties.length) {
      setPenaltyKeys((prev) => [
        ...prev,
        ...Array.from(
          { length: penalties.length - prev.length },
          generateClientKey
        ),
      ]);
    } else if (penaltyKeys.length > penalties.length) {
      setPenaltyKeys((prev) => prev.slice(0, penalties.length));
    }
  }, [penalties.length, penaltyKeys.length]);

  const setParts = (nextParts: ScoreProfileFormValues["parts"]) => {
    form.setFieldValue("parts", nextParts);
  };

  const setPenalties = (nextPenalties: ScoreProfileFormValues["penalties"]) => {
    form.setFieldValue("penalties", nextPenalties);
  };

  const handlePartUpdate = (
    index: number,
    part: NumberScoreProfilePart | BooleanScoreProfilePart
  ) => {
    setParts(
      parts.map((current, idx) =>
        idx === index ? part : current
      ) as ScoreProfileFormValues["parts"]
    );
  };

  const handlePartTypeSwitch = (
    index: number,
    nextType: "NUMBER" | "BOOLEAN"
  ) => {
    const current = parts[index];
    if (!current || current.type === nextType) {
      return;
    }

    const sharedFields = {
      id: current.id,
      label: current.label,
      description: current.description,
      cooperativeBonus: current.cooperativeBonus,
    };

    if (nextType === "NUMBER") {
      handlePartUpdate(index, createNumberPart(sharedFields));
      return;
    }

    handlePartUpdate(index, createBooleanPart(sharedFields));
  };

  const handleAddPart = (type: "NUMBER" | "BOOLEAN") => {
    setParts([
      ...parts,
      type === "NUMBER" ? createNumberPart() : createBooleanPart(),
    ]);
    setPartKeys((prev) => [...prev, generateClientKey()]);
  };

  const handleRemovePart = (index: number) => {
    if (parts.length <= 1) {
      return;
    }
    setParts(parts.filter((_, idx) => idx !== index));
    setPartKeys((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handlePenaltyUpdate = (
    index: number,
    updates: Partial<ScoreProfilePenaltyRule>
  ) => {
    setPenalties(
      penalties.map((penalty, idx) =>
        idx === index ? { ...penalty, ...updates } : penalty
      )
    );
  };

  const handleAddPenalty = () => {
    setPenalties([...penalties, createPenaltyRule()]);
    setPenaltyKeys((prev) => [...prev, generateClientKey()]);
  };

  const handleRemovePenalty = (index: number) => {
    setPenalties(penalties.filter((_, idx) => idx !== index));
    setPenaltyKeys((prev) => prev.filter((_, idx) => idx !== index));
  };

  const normalizedParts = useMemo<NormalizedPart[]>(
    () =>
      parts.map((part) => ({
        id: part.id.trim(),
        label: part.label.trim(),
      })),
    [parts]
  );

  const normalizedPartIds = useMemo(
    () =>
      normalizedParts
        .filter((part) => part.id.length > 0)
        .map((part) => part.id),
    [normalizedParts]
  );

  const formulaReferences = useMemo(
    () =>
      deriveFormulaReferences(
        form.state.values.totalFormula,
        normalizedPartIds
      ),
    [form.state.values.totalFormula, normalizedPartIds]
  );

  const partsWithKeys = useMemo(
    () =>
      parts.map((part, index) => ({
        part,
        index,
        key: partKeys[index],
      })),
    [partKeys, parts]
  );

  const penaltiesWithKeys = useMemo(
    () =>
      penalties.map((penalty, index) => ({
        penalty,
        index,
        key: penaltyKeys[index],
      })),
    [penalties, penaltyKeys]
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
      const position = start + token.length;
      input.focus();
      input.setSelectionRange(position, position);
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(focusTextarea);
    } else {
      focusTextarea();
    }
  };

  const handleReset = () => {
    form.reset();
    setPartKeys(initialValues.parts.map(() => generateClientKey()));
    setPenaltyKeys(initialValues.penalties.map(() => generateClientKey()));
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
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disableFields}
              onClick={() => handleAddPart("NUMBER")}
              type="button"
              variant="secondary"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add numeric part
            </Button>
            <Button
              disabled={disableFields}
              onClick={() => handleAddPart("BOOLEAN")}
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
          {partsWithKeys.map(({ part, index, key }) => (
            <ScoreProfilePartItem
              canRemove={parts.length > 1}
              disabled={disableFields}
              index={index}
              key={key}
              onRemove={() => handleRemovePart(index)}
              onTypeSwitch={(nextType) => handlePartTypeSwitch(index, nextType)}
              onUpdate={(updatedPart) => handlePartUpdate(index, updatedPart)}
              part={part}
            />
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
            onClick={handleAddPenalty}
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
          {penaltiesWithKeys.map(({ penalty, index, key }) => (
            <PenaltyItem
              disabled={disableFields}
              index={index}
              key={key}
              onRemove={() => handleRemovePenalty(index)}
              onUpdate={(updates) => handlePenaltyUpdate(index, updates)}
              penalty={penalty}
            />
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

          <FormulaHelperSidebar
            disabled={disableFields}
            onInsertToken={insertFormulaToken}
            parts={normalizedParts}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          disabled={disableFields}
          onClick={handleReset}
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
