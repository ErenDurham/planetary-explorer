import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ThemeProvider } from "./theme";
import "./index.css";
import { useAppStore } from "./store/useAppStore";
import { hashForPage, pageFromHash } from "./lib/pageUrl";

// Reopen the page named in the address, then keep the address in step with the page.
useAppStore.setState(pageFromHash(window.location.hash));
const syncAddress = () => {
  const hash = hashForPage(useAppStore.getState());
  if (hash !== window.location.hash) window.history.replaceState(null, "", hash || window.location.pathname + window.location.search);
};
useAppStore.subscribe(syncAddress);
window.addEventListener("hashchange", () => useAppStore.setState(pageFromHash(window.location.hash)));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><App /></ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
