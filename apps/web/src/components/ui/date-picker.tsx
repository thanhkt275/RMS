import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function parseYmd(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const dt = new Date(y, mm - 1, dd);
  if (Number.isNaN(dt.getTime())) return null;
  // ensure roundtrip
  if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mm || dt.getDate() !== dd) return null;
  return dt;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, delta: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export type DatePickerProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  min?: Date;
  max?: Date;
  disabled?: boolean;
  className?: string;
  // Display format for the button label, tokens: yyyy, MM, dd
  format?: string;
};

function formatDateLabel(date: Date, pattern: string) {
  const yyyy = String(date.getFullYear());
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  // Support tokens in various cases: yyyy/YYYY, MM/mm, dd/DD
  return pattern
    .replace(/yyyy|YYYY/g, yyyy)
    .replace(/MM|mm/g, MM)
    .replace(/dd|DD/g, dd);
}

function patternToPlaceholder(pattern: string) {
  return pattern
    .replace(/yyyy/gi, "YYYY")
    .replace(/MM|mm/g, "MM")
    .replace(/dd|DD/g, "DD");
}

export function DatePicker({ value, onChange, placeholder, min, max, disabled, className, format = "yyyy-MM-dd" }: DatePickerProps) {
  const today = useMemo(() => new Date(), []);
  const parsed = useMemo(() => parseYmd(value) ?? null, [value]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => parsed ?? today);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // helpers for month/year controls
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const currentYear = today.getFullYear();
  const minYear = (min ? min.getFullYear() : currentYear - 120);
  const maxYear = (max ? max.getFullYear() : currentYear);
  const years = useMemo(() => {
    const ys: number[] = [];
    for (let y = maxYear; y >= minYear; y--) ys.push(y);
    return ys;
  }, [minYear, maxYear]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (parsed) setView(parsed);
  }, [parsed]);

  const start = startOfMonth(view);
  const end = endOfMonth(view);
  const startWeekday = (start.getDay() + 6) % 7; // make week start on Monday
  const daysInMonth = end.getDate();

  const grid: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(view.getFullYear(), view.getMonth(), d));
  while (grid.length % 7 !== 0) grid.push(null);

  function dayDisabled(d: Date) {
    if (disabled) return true;
    if (min && d < new Date(min.getFullYear(), min.getMonth(), min.getDate())) return true;
    if (max && d > new Date(max.getFullYear(), max.getMonth(), max.getDate())) return true;
    return false;
  }

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(view);

  function setViewMonth(m: number) {
    const y = view.getFullYear();
    const next = new Date(y, m, 1);
    // clamp to min/max by month
    if (min && next < new Date(min.getFullYear(), min.getMonth(), 1)) return;
    if (max && next > new Date(max.getFullYear(), max.getMonth(), 1)) return;
    setView(next);
  }
  function setViewYear(y: number) {
    const m = view.getMonth();
    const next = new Date(y, m, 1);
    if (min && next < new Date(min.getFullYear(), min.getMonth(), 1)) return;
    if (max && next > new Date(max.getFullYear(), max.getMonth(), 1)) return;
    setView(next);
  }

  const label = parsed ? formatDateLabel(parsed, format) : (placeholder ?? patternToPlaceholder(format));

  return (
    <div className={className}>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className={parsed ? "text-foreground" : "text-muted-foreground"}>
            {label}
          </span>
          <CalendarIcon className="ml-2 size-4 opacity-70" />
        </button>

        {open && (
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose date"
            className="absolute z-50 mt-2 w-[20rem] rounded-md border bg-card p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                onClick={() => setView((v) => addMonths(v, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </button>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Select month"
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={String(view.getMonth())}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                >
                  {monthNames.map((name, idx) => (
                    <option key={idx} value={idx}>{name}</option>
                  ))}
                </select>
                <select
                  aria-label="Select year"
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={String(view.getFullYear())}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                onClick={() => setView((v) => addMonths(v, +1))}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {grid.map((d, idx) => {
                if (!d)
                  return <div key={idx} className="h-8" />;
                const isSelected = parsed ? isSameDay(parsed, d) : false;
                const isToday = isSameDay(d, today);
                const isDisabled = dayDisabled(d);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(toYmd(d));
                      setOpen(false);
                    }}
                    className={`h-8 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40 ${
                      isSelected
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : isToday
                        ? "ring-1 ring-primary/50"
                        : ""
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => onChange("")}
              >
                Clear
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setView(today)}
                >
                  This month
                </button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    const ymd = toYmd(today);
                    if (!max || new Date() <= max) onChange(ymd);
                    setView(today);
                  }}
                >
                  Today
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DatePicker;
