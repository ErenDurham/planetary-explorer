import { useEffect, useRef } from "react";
import { useMotionPreference } from "./preferences";

/** Animate the reading surface without remounting mission drafts, queries or conversations. */
export function useViewArrival(view: string) {
  const ref = useRef<HTMLElement>(null);
  const previous = useRef(view);
  const reduced = useMotionPreference();
  useEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    if (reduced || !ref.current?.animate) return;
    const animation = ref.current.animate([{opacity:.68},{opacity:1}], {duration:240,easing:"cubic-bezier(.2,.65,.2,1)"});
    return () => animation.cancel();
  },[view,reduced]);
  return ref;
}
