import { ArrowDown, ArrowUp, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export type StageTeamOption = {
  id: string;
  name: string;
  slug: string | null;
  location?: string | null;
};

type StageTeamSelectorProps = {
  value: string[];
  onChange: (next: string[]) => void;
  options: StageTeamOption[];
  disabled?: boolean;
};

export function StageTeamSelector({
  value,
  onChange,
  options,
  disabled,
}: StageTeamSelectorProps) {
  const optionMap = new Map(options.map((option) => [option.id, option]));

  const toggleTeam = (teamId: string) => {
    if (disabled) {
      return;
    }
    if (value.includes(teamId)) {
      onChange(value.filter((id) => id !== teamId));
    } else {
      onChange([...value, teamId]);
    }
  };

  const moveTeam = (teamId: string, direction: "up" | "down") => {
    if (disabled) {
      return;
    }
    const index = value.indexOf(teamId);
    if (index === -1) {
      return;
    }
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= value.length) {
      return;
    }
    const next = [...value];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    onChange(next);
  };

  const removeTeam = (teamId: string) => {
    if (disabled) {
      return;
    }
    onChange(value.filter((id) => id !== teamId));
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <p className="font-medium">Seed order</p>
          <p className="text-muted-foreground text-sm">
            Drag controls to adjust advancement order.
          </p>
        </div>
        {value.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
            Select at least two teams to build a stage.
          </div>
        ) : (
          <ol className="space-y-2">
            {value.map((teamId, index) => {
              const team = optionMap.get(teamId);
              return (
                <li
                  className="flex items-center justify-between rounded-md border bg-background/80 p-2"
                  key={teamId}
                >
                  <div>
                    <p className="font-semibold">
                      {team?.name ?? "Unknown team"}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>Seed #{index + 1}</span>
                      {team?.location && (
                        <Badge variant="outline">{team.location}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label="Move up"
                      disabled={disabled || index === 0}
                      onClick={() => moveTeam(teamId, "up")}
                      size="icon"
                      variant="ghost"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label="Move down"
                      disabled={disabled || index === value.length - 1}
                      onClick={() => moveTeam(teamId, "down")}
                      size="icon"
                      variant="ghost"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label="Remove team"
                      disabled={disabled}
                      onClick={() => removeTeam(teamId)}
                      size="icon"
                      variant="ghost"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <p className="font-medium">Available teams</p>
          <p className="text-muted-foreground text-sm">
            Check a team to add it to the stage.
          </p>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {options.map((team) => {
            const checked = value.includes(team.id);
            const checkboxId = `stage-team-${team.id}`;
            return (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm focus-within:ring-2 focus-within:ring-ring/40 hover:bg-muted/40"
                htmlFor={checkboxId}
                key={team.id}
              >
                <input
                  checked={checked}
                  className="sr-only"
                  disabled={disabled}
                  id={checkboxId}
                  onChange={() => toggleTeam(team.id)}
                  type="checkbox"
                />
                <Checkbox
                  aria-hidden="true"
                  checked={checked}
                  className="pointer-events-none"
                  disabled={disabled}
                />
                <div>
                  <p className="font-medium">{team.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {team.location || "Location not set"}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
