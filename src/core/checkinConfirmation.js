export function confirmationMessage(checkinCount, flagCount) {
  if (checkinCount === 1) return 'This is your baseline. Check in again before your next infusion and your twin will start showing changes.';
  if (flagCount) return `Compared with your first check-in, ${flagCount} thing${flagCount > 1 ? 's have' : ' has'} changed. Your twin shows the details.`;
  return 'Things look about the same as at your first check-in.';
}
