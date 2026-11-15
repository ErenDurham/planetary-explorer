# Worktree integration — 2026-11-15

All attached development branches were integrated into main. The retirement
retains branches and commits as recovery points; local worktree directories are
removed only after tracked changes have been captured and merge ancestry checked.

| Branch | Integration |
| --- | --- |
| mission-first-flow | Mission-first pane, composer, supported-task routing, globe lighting/atmosphere, reduced motion and WebGL fallback merged. |
| usability/discovery-journey | Previously merged; research drafts, statuses and discovery journey retained. |
| deploy/github-pages | Previously merged; static Python worker deployment retained. |
| design/cosmos-atlas | Uncommitted edits preserved as 5ad836a and merged. Existing newer atlas/research/default-objective implementation retained on overlapping files. |
| design/shared-atlas-theme | Uncommitted edits preserved as 39ba88f and merged. Shared theme retained alongside newer mission-first, notebook drafts, export types and discovered-region comparison routing. Obsolete CandidateList remains replaced by DiscoveryCandidateList. |
| design/compare-atlas | Uncommitted edits preserved as 671f331 and merged. This branch had an independent copy of the original repository history; overlapping backend/scientific code retained the newer main implementations. Its reusable CompareAtlasFrame components are retained. |

Conflict resolution preserves the current discovery scoring, catalog/source
updates, Pages transport, shared region analysis and normal Compare navigation.
Historical corpus files and UI modules deliberately removed from main are not
resurrected by the independent-history merge. A duplicate Find Earth Analogs
entry introduced by an older theme edit was removed.

Generated builds, caches and dependency symlinks are not committed. Any local
analyst notebooks in retired worktrees are copied to a private retirement backup
outside the repository; they are not published to GitHub Pages.
