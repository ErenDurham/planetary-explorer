// Georeferenced annotations over an orbital image: the selected coordinate
// (a dot), the analysis footprint (a dashed square, visibly different from the
// dot and from a landing ellipse) and a scale bar computed from the bounds and
// the rendered height. Rendered ONLY when the entry carries `bounds`.
import { footprintBox, metresPerPixel, pointPosition, scaleBar } from "@/lib/comparison";
import type { Body } from "@/lib/analogFeatures";
import type { ImageBounds } from "@/types";

export function GeoOverlay({ bounds, body, lat, lonEast, halfWidthDeg, renderedHeightPx }: { bounds: ImageBounds; body: Body; lat: number; lonEast: number; halfWidthDeg: number; renderedHeightPx: number | null }) {
  const point = pointPosition(bounds, lat, lonEast);
  const box = footprintBox(bounds, lat, lonEast, halfWidthDeg);
  const mpp = metresPerPixel(bounds, renderedHeightPx, body);
  const bar = scaleBar(mpp);
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="geo-overlay">
      {box && (
        <div
          role="img"
          aria-label={`Analysis footprint, ±${halfWidthDeg}° square around the selected coordinate${box.clipped ? ". It extends beyond this image" : ""}`}
          data-testid="footprint-outline"
          className="absolute border-2 border-dashed border-ok/90 shadow-[0_0_0_1px_rgba(0,0,0,.6)]"
          style={{ left: `${box.leftPct}%`, top: `${box.topPct}%`, width: `${box.widthPct}%`, height: `${box.heightPct}%` }}
        />
      )}
      {point && (
        <span
          role="img"
          aria-label="Selected coordinate"
          data-testid="point-marker"
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-copper shadow-[0_0_0_2px_rgba(0,0,0,.7)]"
          style={{ left: `${point.xPct}%`, top: `${point.yPct}%` }}
        />
      )}
      {bar && (
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white" data-testid="scale-bar" aria-label={`Scale bar: ${bar.label}`}>
          <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: `${Math.round(bar.px)}px` }} aria-hidden />
          <div className="num mt-0.5">{bar.label}</div>
        </div>
      )}
    </div>
  );
}
