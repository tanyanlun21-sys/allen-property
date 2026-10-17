export function availabilityLabel(value?: string | null) {
  if (!value) return "Ready Move In";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Ready Move In";

  const available = new Date(year, month - 1, day);
  if (
    available.getFullYear() !== year ||
    available.getMonth() !== month - 1 ||
    available.getDate() !== day
  ) {
    return "Ready Move In";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (available <= today) return "Ready Move In";

  const part = day <= 10 ? "Early" : day <= 20 ? "Mid" : "End";
  const monthName = available.toLocaleString("en-US", { month: "long" });
  return `${part} ${monthName}`;
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
