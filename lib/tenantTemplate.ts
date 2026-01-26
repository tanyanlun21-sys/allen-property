import { rm } from "@/lib/money";

type Listing = {
  condo_name: string;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carparks: number | null;
  furnish: string | null;
  price: number | null;
  available_from?: string | null;
};

export function buildTenantText(x: Listing) {
  const lines: string[] = [];

  lines.push(x.condo_name || "—");
  lines.push("");

  if (x.sqft) lines.push(`${x.sqft} sqft`);
  lines.push(`${x.bedrooms ?? "—"} bedroom`);
  lines.push(`${x.bathrooms ?? "—"} bathroom`);
  lines.push(`${x.carparks ?? "—"} parking`);
  if (x.furnish) lines.push(`${x.furnish} Furnished`);

  lines.push(x.price != null ? rm(x.price) : "RM—");

  if (x.available_from) {
    lines.push("");
    lines.push(`Available from ${x.available_from}`);
  }

  return lines.join("\n");
}