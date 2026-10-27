export function checkpointRetentionIds(rows: Array<{ id: string; created_at: string; daily_bucket: string }>, now = Date.now()) {
  const daily = new Set<string>(); const keep = new Set<string>();
  // One verified recovery point per day is enough. Keep the newest checkpoint
  // for each of the last three days and remove the rest as redundant.
  for (const row of rows) { const age = now - Date.parse(row.created_at); if (age >= 0 && age <= 3 * 86_400_000 && daily.size < 3 && !daily.has(row.daily_bucket)) { daily.add(row.daily_bucket); keep.add(row.id); } }
  return keep;
}
