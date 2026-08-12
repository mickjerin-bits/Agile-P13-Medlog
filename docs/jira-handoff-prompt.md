# Handoff prompt — create the Sprint 1 tickets in Jira

Paste everything below the line into a **new** Claude Code session (not a resumed one, or the
`mcp-atlassian-wilp` MCP server will not be loaded).

---

Create the MedLog Sprint 1 tickets in my WILP Jira using the **`mcp-atlassian-wilp`** MCP server
(site `https://wilp-agile-group9.atlassian.net/`, project key **AP**, board 2). Do not use the
`mcp-atlassian` server — that one points at CargoAI and does not have this project.

The full ticket content is already written in
`C:\Users\mick0\WorkspaceCargoAi\Agile-P13-Medlog\docs\sprint-1-backlog.md` — 1 epic and 16 items,
each with a description, acceptance criteria in Given–When–Then form, and a QA verification note.
Read that file and use it verbatim; do not invent new content.
The same data is in `docs/jira-import.csv` if a CSV shape is easier to parse.

For each of the 16 items:

1. Create it in project **AP** with the issue type given in the backlog (Story, Task or Bug).
2. Put the description **and** the Given–When–Then acceptance criteria in the description field,
   with the criteria under an "Acceptance criteria" heading.
3. Set story points to the value in the backlog.
4. Parent it to the epic **"MedLog Sprint 1 - Secure Patient Record Vault (MVP)"**. Check whether an
   equivalent epic already exists on my board first and reuse it rather than creating a duplicate —
   ask me if you are unsure which one to use.
5. Add the QA verification note as a **comment** on the issue.
6. Transition it to **Done**.

Notes:

- Check the project's available issue types and workflow transitions first; if the workflow will not
  allow a direct move to Done, move it through the intermediate states rather than leaving it open,
  and tell me what path you took.
- Verify afterwards with a JQL search that all 16 exist, are parented to the epic, are Done, and each
  has its comment. Report anything that did not stick — do not assume success.
- If the `mcp-atlassian-wilp` tools are not available, stop and tell me rather than falling back to
  the CargoAI server.

Context on what the tickets describe: MedLog is a frontend-only React 19 + Vite + TypeScript
prototype (BITS WILP Agile Software Processes, Project 13, Group 9). Sprint 1 delivered record
upload, encrypted storage and a patient dashboard. Repo:
https://github.com/mickjerin-bits/Agile-P13-Medlog — branch `mick/sprint1-core-app`, 99 tests, CI
green. The QA notes describe testing that genuinely happened; attribute them to our team's QA.
