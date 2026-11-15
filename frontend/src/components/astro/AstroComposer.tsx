import { useState } from "react";
import { Send } from "lucide-react";
export function AstroComposer({
  draft,
  onDraft,
  onSend,
  suggestion,
  pending,
}: {
  draft: string;
  onDraft: (draft: string) => void;
  onSend: () => void;
  suggestion: string;
  pending: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="shrink-0 p-3"
    >
      <label htmlFor="astro-message" className="sr-only">
        Message Astro
      </label>
      <div className="relative rounded-lg border border-line-strong bg-bg focus-within:border-copper">
        <textarea
          id="astro-message"
          rows={2}
          value={draft}
          maxLength={1000}
          onChange={(e) => onDraft(e.target.value)}
          placeholder={focused ? "" : suggestion}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) onSend();
            }
          }}
          className="block min-h-[68px] w-full resize-none rounded-lg bg-transparent px-3 py-2.5 pr-12 text-sm leading-5 text-fg placeholder:text-fg-faint outline-none"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Send message"
          className="absolute bottom-2 right-2 rounded-md p-2 text-copper-bright hover:bg-copper/10 disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
