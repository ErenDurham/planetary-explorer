import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useBoundsReporter } from "@/hooks/useBoundsReporter";
import type { OverlayBounds } from "@/lib/overlay";
import { createPortal } from "react-dom";

/** Desktop region; native modal on narrow screens handles inert background and focus. */
export function ResponsiveSurface({
  label,
  children,
  onClose,
  className = "",
  focusOnMount = true,
  onBoundsChange,
  style,
  mobileClassName = "h-[90dvh] max-h-[90dvh]",
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  focusOnMount?: boolean;
  onBoundsChange?: (bounds: OverlayBounds) => void;
  style?: CSSProperties;
  mobileClassName?: string;
}) {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const region = useRef<HTMLElement>(null);
  useBoundsReporter(narrow ? dialog : region, onBoundsChange);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (narrow) dialog.current?.showModal();
    else if (focusOnMount)
      region.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (dialog.current?.open) dialog.current.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [narrow, focusOnMount]);
  if (narrow)
    return createPortal(
      <dialog
        ref={dialog}
        style={style}
        aria-label={label}
        onCancel={(e) => {
          e.preventDefault();
          close.current();
        }}
        className={`fixed inset-x-0 bottom-0 top-auto m-0 flex w-screen max-w-none flex-col rounded-t-xl border border-line-strong bg-bg-elev p-0 text-fg backdrop:bg-black/60 ${mobileClassName}`}
      >
        {children}
      </dialog>,
      document.body,
    );
  return (
    <section
      ref={region}
      style={style}
      role="region"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close.current();
        }
      }}
      className={className}
    >
      {children}
    </section>
  );
}
