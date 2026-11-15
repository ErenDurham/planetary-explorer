export interface OverlayBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
/** Lift only a legend whose normal position intersects the floating assistant. */
export function legendBottomOffset(
  viewport: OverlayBounds,
  legend: { width: number; height: number },
  overlay: OverlayBounds | null,
  margin = 12,
): number {
  if (!overlay) return margin;
  const left = viewport.left + margin,
    right = left + legend.width;
  const bottom = viewport.bottom - margin,
    top = bottom - legend.height;
  if (
    right <= overlay.left ||
    left >= overlay.right ||
    bottom <= overlay.top - margin ||
    top >= overlay.bottom + margin
  )
    return margin;
  return Math.max(
    margin,
    Math.min(
      viewport.bottom - overlay.top + margin,
      viewport.bottom - viewport.top - legend.height - margin,
    ),
  );
}
