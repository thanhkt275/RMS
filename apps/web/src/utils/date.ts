function parseDate(value?: string | number | Date | null) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function formatDate(
  value?: string | number | Date | null,
  options?: Intl.DateTimeFormatOptions
) {
  const date = parseDate(value);
  if (!date) {
    return "TBD";
  }
  return date.toLocaleDateString(undefined, options ?? { dateStyle: "medium" });
}

export function formatDateTime(value?: string | number | Date | null) {
  const date = parseDate(value);
  if (!date) {
    return "TBD";
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDateRange(
  start?: string | number | Date | null,
  end?: string | number | Date | null
) {
  const startLabel = formatDateTime(start);
  if (!end) {
    return startLabel;
  }
  const endLabel = formatDateTime(end);
  return `${startLabel} → ${endLabel}`;
}

export function toDateTimeLocalValue(value?: string | number | Date | null) {
  const date = parseDate(value);
  if (!date) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function toISOFromLocalInput(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function getCountdownLabel(value?: string | number | Date | null) {
  const date = parseDate(value);
  if (!date) {
    return "TBD";
  }
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) {
    return "In progress";
  }
  const oneMinute = 60 * 1000;
  const oneHour = 60 * oneMinute;
  const oneDay = 24 * oneHour;
  const days = Math.floor(diffMs / oneDay);
  const hours = Math.floor((diffMs % oneDay) / oneHour);
  const minutes = Math.floor((diffMs % oneHour) / oneMinute);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
