export const LISTING_FROM_OPTIONS = [
  "+60 11-4537 7886 | Iphone 16 | Whatsapp Business",
  "+60 13-628 6627 | Iphone 14 | Whatsapp",
  "+60 10-503 8618 | Iphone 10 | Whatsapp",
  "+60 11-3538 1186 | Iphone 10 | Whatsapp Business",
  "+60 11-5593 7903 | Iphone 6 | Whatsapp Business",
  "+60 11-4536 7886 | Huawei| Whatsapp Business",
  "+60 11-4534 7886 | Huawei| Whatsapp",
];

export function normalizeBedrooms(value: string, isStudio = false) {
  if (isStudio) return "0";

  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function bedroomNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function bedroomLabel(value: string | number | null | undefined) {
  if (value === 0 || value === "0" || String(value ?? "").toLowerCase() === "studio") {
    return "Studio";
  }

  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}
