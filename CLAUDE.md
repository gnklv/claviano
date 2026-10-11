# Claviano

A web player for learning piano pieces, written from scratch (Vue 3, TypeScript, Vite, Vitest).

Read before working, and follow:

@docs/rules.md

- What the app is for and how its screens are laid out: `docs/concept.md`.
- What is done and what is next, in order: `docs/roadmap.md`.

## How we work

- Answers are in Russian, plain and short; code, comments, commit messages and documents are in
  English, in the voice of the code around them.
- The user commits and pushes. A result ends with the command to commit it:
  `git add . && git commit -m "…" -m "- …"`, in a `bash` block.
- Checks before a result is offered: `npm run lint`, `npm run typecheck`,
  `CI=true npx vitest run`, `npm run build`.
- The dev server is the user's (port 5173); `window.claviano` holds the use cases in development.
  The Browser pane is often hidden: screenshots and timers may stall. Say what was not seen.
- Never discard uncommitted work (see "Work" in the rules): a trial is undone by editing it back.
