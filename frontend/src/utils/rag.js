// ---------------------------------------------------------------------------
// RAG status business logic (mirrors the backend spec exactly).
//
//   budget_used_percent = budget_used / allocated_budget * 100
//   hours_used_percent  = hours_used  / allocated_hours  * 100
//   progress_gap = max(budget_used_percent, hours_used_percent)
//                  - actual_completion_percent
//
//   Green : progress_gap <= 10
//   Amber : progress_gap > 10 and <= 25
//   Red   : progress_gap > 25
//
// The backend is the source of truth; we recompute on the client so the UI can
// preview status as users edit numbers, and so mock mode behaves identically.
// ---------------------------------------------------------------------------

const safePercent = (used, allocated) => {
  if (!allocated || allocated <= 0) return 0;
  return (used / allocated) * 100;
};

export function computeRag({
  allocated_budget,
  budget_used,
  allocated_hours,
  hours_used,
  actual_completion_percent,
}) {
  const budgetUsedPercent = safePercent(budget_used, allocated_budget);
  const hoursUsedPercent = safePercent(hours_used, allocated_hours);
  const burn = Math.max(budgetUsedPercent, hoursUsedPercent);
  const progressGap = burn - (actual_completion_percent ?? 0);

  let status = 'Green';
  if (progressGap > 25) status = 'Red';
  else if (progressGap > 10) status = 'Amber';

  return {
    status,
    progressGap,
    burn,
    budgetUsedPercent,
    hoursUsedPercent,
    completion: actual_completion_percent ?? 0,
  };
}

// Sort helper: Red first, then Amber, then Green (most urgent on top).
export const ragSortWeight = { Red: 0, Amber: 1, Green: 2 };
