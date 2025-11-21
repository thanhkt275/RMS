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

type NormalizedPart = {
  id: string;
  label: string;
};

type FormulaHelperSidebarProps = {
  parts: NormalizedPart[];
  disabled?: boolean;
  onInsertToken: (token: string) => void;
};

export function FormulaHelperSidebar({
  parts,
  disabled,
  onInsertToken,
}: FormulaHelperSidebarProps) {
  return (
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
          {parts.map((part, index) => {
            const hasId = Boolean(part.id);
            return (
              <button
                aria-label={
                  hasId
                    ? `Insert ${part.id} token`
                    : "Set an ID to enable insertion"
                }
                className="flex min-w-[140px] flex-col items-start gap-0.5 rounded-md border border-input/70 bg-background px-3 py-2 text-left font-medium text-[11px] text-foreground transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled || !hasId}
                key={`formula-part-${part.id || index}`}
                onClick={() => hasId && onInsertToken(part.id)}
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
              disabled={disabled}
              key={helper.token}
              onClick={() => onInsertToken(helper.token)}
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
  );
}
