import { Trash2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type BooleanScoreProfilePart,
  type NumberScoreProfilePart,
  SCORE_PROFILE_PART_TYPES,
  type ScoreProfileCooperativeBonus,
} from "@/utils/score-profiles";
import { CooperativeBonusSection } from "./cooperative-bonus-section";

type ScoreProfilePartItemProps = {
  part: NumberScoreProfilePart | BooleanScoreProfilePart;
  index: number;
  disabled?: boolean;
  canRemove: boolean;
  onUpdate: (part: NumberScoreProfilePart | BooleanScoreProfilePart) => void;
  onRemove: () => void;
  onTypeSwitch: (newType: "NUMBER" | "BOOLEAN") => void;
};

export function ScoreProfilePartItem({
  part,
  index,
  disabled,
  canRemove,
  onUpdate,
  onRemove,
  onTypeSwitch,
}: ScoreProfilePartItemProps) {
  const handleToggleBonus = () => {
    if (part.cooperativeBonus) {
      onUpdate({
        ...part,
        cooperativeBonus: undefined,
      });
      return;
    }

    const defaultBonus: ScoreProfileCooperativeBonus = {
      requiredTeamCount: 2,
      bonusPoints: 10,
      appliesTo: "PER_TEAM",
      description: "",
    };

    onUpdate({
      ...part,
      cooperativeBonus: defaultBonus,
    });
  };

  const handleBonusUpdate = (bonus: ScoreProfileCooperativeBonus) => {
    onUpdate({
      ...part,
      cooperativeBonus: bonus,
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Part {index + 1}</Badge>
          <Badge variant="outline">
            {part.type === "NUMBER" ? "Numeric" : "Boolean"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Select
            disabled={disabled}
            onChange={(event) =>
              onTypeSwitch(event.target.value as "NUMBER" | "BOOLEAN")
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
            disabled={disabled || !canRemove}
            onClick={onRemove}
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField disabled={disabled} label="Part ID" required>
            <Input
              disabled={disabled}
              onChange={(event) =>
                onUpdate({
                  ...part,
                  id: event.target.value,
                })
              }
              placeholder="auto-task"
              value={part.id}
            />
          </FormField>

          <FormField disabled={disabled} label="Label" required>
            <Input
              disabled={disabled}
              onChange={(event) =>
                onUpdate({
                  ...part,
                  label: event.target.value,
                })
              }
              placeholder="Autonomous shipping hub"
              value={part.label}
            />
          </FormField>

          <FormField
            className="sm:col-span-2"
            disabled={disabled}
            label="Description"
          >
            <Textarea
              disabled={disabled}
              onChange={(event) =>
                onUpdate({
                  ...part,
                  description: event.target.value,
                })
              }
              placeholder="Describe how this section is scored."
              rows={2}
              value={part.description ?? ""}
            />
          </FormField>

          {part.type === "NUMBER" ? (
            <>
              <FormField disabled={disabled} label="Points per unit" required>
                <Input
                  disabled={disabled}
                  min={0}
                  onChange={(event) =>
                    onUpdate({
                      ...part,
                      pointsPerUnit: Number(event.target.value) || 0,
                    })
                  }
                  type="number"
                  value={part.pointsPerUnit}
                />
              </FormField>

              <FormField disabled={disabled} label="Max value">
                <Input
                  disabled={disabled}
                  min={0}
                  onChange={(event) =>
                    onUpdate({
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
            <FormField disabled={disabled} label="Points when true" required>
              <Input
                disabled={disabled}
                min={0}
                onChange={(event) =>
                  onUpdate({
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

        <CooperativeBonusSection
          bonus={part.cooperativeBonus}
          disabled={disabled}
          onToggle={handleToggleBonus}
          onUpdate={handleBonusUpdate}
        />
      </div>
    </div>
  );
}
