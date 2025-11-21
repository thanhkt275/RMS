import { Trash2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SCORE_PROFILE_PENALTY_DIRECTIONS,
  SCORE_PROFILE_PENALTY_TARGETS,
  type ScoreProfilePenaltyRule,
} from "@/utils/score-profiles";

type PenaltyItemProps = {
  penalty: ScoreProfilePenaltyRule;
  index: number;
  disabled?: boolean;
  onUpdate: (updates: Partial<ScoreProfilePenaltyRule>) => void;
  onRemove: () => void;
};

export function PenaltyItem({
  penalty,
  index,
  disabled,
  onUpdate,
  onRemove,
}: PenaltyItemProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary">Penalty {index + 1}</Badge>
        <Button
          disabled={disabled}
          onClick={onRemove}
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField disabled={disabled} label="Penalty ID" required>
          <Input
            disabled={disabled}
            onChange={(event) => onUpdate({ id: event.target.value })}
            placeholder="minor-penalty"
            value={penalty.id}
          />
        </FormField>

        <FormField disabled={disabled} label="Label" required>
          <Input
            disabled={disabled}
            onChange={(event) => onUpdate({ label: event.target.value })}
            placeholder="Minor penalty"
            value={penalty.label}
          />
        </FormField>

        <FormField
          className="sm:col-span-2"
          disabled={disabled}
          label="Description"
        >
          <Textarea
            disabled={disabled}
            onChange={(event) => onUpdate({ description: event.target.value })}
            placeholder="Robot entered the opponent launch zone."
            rows={2}
            value={penalty.description ?? ""}
          />
        </FormField>

        <FormField disabled={disabled} label="Points" required>
          <Input
            disabled={disabled}
            min={0}
            onChange={(event) =>
              onUpdate({
                points: Number(event.target.value) || 0,
              })
            }
            type="number"
            value={penalty.points}
          />
        </FormField>

        <FormField disabled={disabled} label="Target" required>
          <Select
            disabled={disabled}
            onChange={(event) =>
              onUpdate({
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

        <FormField
          className="sm:col-span-2"
          disabled={disabled}
          label="Direction"
          required
        >
          <Select
            disabled={disabled}
            onChange={(event) =>
              onUpdate({
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
  );
}
