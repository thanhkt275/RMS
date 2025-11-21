import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  SCORE_PROFILE_COOP_APPLIES_TO,
  type ScoreProfileCooperativeBonus,
} from "@/utils/score-profiles";

type CooperativeBonusSectionProps = {
  bonus: ScoreProfileCooperativeBonus | null | undefined;
  disabled?: boolean;
  onToggle: () => void;
  onUpdate: (bonus: ScoreProfileCooperativeBonus) => void;
};

export function CooperativeBonusSection({
  bonus,
  disabled,
  onToggle,
  onUpdate,
}: CooperativeBonusSectionProps) {
  return (
    <div className="space-y-4">
      <FormField disabled={disabled} label="Cooperative bonus">
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            checked={Boolean(bonus)}
            disabled={disabled}
            onCheckedChange={onToggle}
          />
          <p className="text-muted-foreground text-sm">
            Award bonus points when every team completes this task.
          </p>
        </div>
      </FormField>

      {bonus ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField disabled={disabled} label="Required teams">
            <Select
              disabled={disabled}
              onChange={(event) => {
                const requiredTeamCount = Number(event.target.value) as 2 | 4;
                onUpdate({
                  ...bonus,
                  requiredTeamCount,
                });
              }}
              value={String(bonus.requiredTeamCount)}
            >
              {[2, 4].map((value) => (
                <option key={value} value={value}>
                  {value} teams
                </option>
              ))}
            </Select>
          </FormField>

          <FormField disabled={disabled} label="Bonus points">
            <Input
              disabled={disabled}
              min={0}
              onChange={(event) => {
                const bonusPoints = Number(event.target.value) || 0;
                onUpdate({
                  ...bonus,
                  bonusPoints,
                });
              }}
              type="number"
              value={bonus.bonusPoints}
            />
          </FormField>

          <FormField disabled={disabled} label="Bonus applies to">
            <Select
              disabled={disabled}
              onChange={(event) => {
                const appliesTo = event.target
                  .value as (typeof SCORE_PROFILE_COOP_APPLIES_TO)[number];
                onUpdate({
                  ...bonus,
                  appliesTo,
                });
              }}
              value={bonus.appliesTo}
            >
              {SCORE_PROFILE_COOP_APPLIES_TO.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === "ALL_TEAMS" ? "All teams" : "Each team"}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            className="sm:col-span-2"
            disabled={disabled}
            label="Bonus description"
          >
            <Input
              disabled={disabled}
              onChange={(event) => {
                onUpdate({
                  ...bonus,
                  description: event.target.value,
                });
              }}
              placeholder="Awarded when every team completes the task."
              value={bonus.description ?? ""}
            />
          </FormField>
        </div>
      ) : null}
    </div>
  );
}
