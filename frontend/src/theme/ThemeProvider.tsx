import { useLayoutEffect, type ReactNode } from "react";
import { useMotionPreference } from "@/lib/motion/preferences";
import { useAppearance } from "./appearance";
import { APP_THEME, type ThemeName } from "./config";

/** One document-wide provider. Document scope also themes portaled tooltips
 * and dialogs, without adding a wrapper or changing any workspace dimensions.
 * Controlled `theme` changes can later be driven by a settings screen. */
export function ThemeProvider({ children, theme = APP_THEME }: { children: ReactNode; theme?: ThemeName }) {
  const mode = useAppearance(s => s.mode);
  useLayoutEffect(() => {
    const root=document.documentElement;
    const previous=root.getAttribute("data-appearance");
    root.dataset.appearance=mode;
    return ()=>{if(previous===null)root.removeAttribute("data-appearance");else root.setAttribute("data-appearance",previous);};
  }, [mode]);
  const reduced = useMotionPreference();
  useLayoutEffect(() => { document.documentElement.dataset.motion = reduced ? "reduced" : "full"; }, [reduced]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-app-theme");
    root.setAttribute("data-app-theme", theme);
    return () => {
      if (previous == null) root.removeAttribute("data-app-theme");
      else root.setAttribute("data-app-theme", previous);
    };
  }, [theme]);
  return <>{children}</>;
}
