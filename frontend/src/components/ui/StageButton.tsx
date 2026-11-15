import { ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

/** Shared primary action for advancing between mission stages. */
export function StageButton({children,className="",type="button",size="default",...props}:ButtonHTMLAttributes<HTMLButtonElement> & {size?:"default"|"compact"}) {
  return <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-copper bg-copper ${size === "compact" ? "min-h-8 px-3 py-1.5 text-xs" : "min-h-11 px-5 py-2.5 text-sm"} font-semibold text-white hover:bg-copper-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-bright disabled:opacity-40 ${className}`} {...props}>{children}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden/></button>;
}
