"""
Pins Leaderboard to the top of the sidebar, above the accordion.

THE PROBLEM. The sidebar holds ONE open section at a time (openSection is a
single string, defaulting to "ARENA"), so opening any section folds the rest.
Leaderboard sat inside PRODUCT, next to How to Play and Support, which meant it
was invisible unless you went looking for it in a collapsed accordion filed
under documentation.

This is the second time this exact bug has shipped. The comment already in
routeToOpenSection says it of /profile: "the link existed but stayed folded
inside a collapsed accordion, which is why it looked missing on desktop." A
pinned entry fixes the class, not just this instance: anything that must be
reachable at a glance does not belong inside a one-at-a-time accordion.

THREE EDITS
  1. A pinned Leaderboard button above the sections, inside SidebarAccordion so
     the desktop sidebar and the mobile drawer both get it from one definition.
     Collapsed rail (86px) shows the trophy alone rather than the letter "L".
  2. Removed from PRODUCT, so it is not listed twice in the same nav.
  3. Removed from routeToOpenSection. That map force-opens a section on
     navigation; a pinned link should not yank PRODUCT open underneath you. A
     path missing from the map is a no-op, so the open section stays as it was.

The footer link under Product is left alone - a footer is a sitemap, repetition
there is fine.

Run from repo root:  python3 migrations/patch_leaderboard_pinned.py
"""
import sys, os, shutil

PATH = "src/PredaLandingDashboardMockup.tsx"

PINNED = '''  return (
    <>
      {/* Pinned above the accordion on purpose. The sections below are
          one-at-a-time, so anything filed inside one is invisible until the
          user happens to open that section. A live points race has to be
          reachable without hunting for it. Rendered here rather than in the
          two shells so the desktop sidebar and the mobile drawer cannot
          drift apart. */}
      <div className="mb-5">
        <button
          onClick={() => onNavigate("/leaderboard")}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--panel-2)]"
          style={{
            background: currentPath === "/leaderboard" ? "var(--accent-soft)" : "transparent",
            justifyContent: expanded ? "flex-start" : "center",
          }}
        >
          <Trophy
            className="h-4 w-4 shrink-0"
            style={{ color: currentPath === "/leaderboard" ? "var(--text)" : "var(--text-2)" }}
          />
          {expanded ? (
            <span
              className="text-sm font-semibold"
              style={{ color: currentPath === "/leaderboard" ? "var(--text)" : "var(--text-2)" }}
            >
              Leaderboard
            </span>
          ) : null}
        </button>
      </div>

      {sidebarSections.map((section) => ('''

EDITS = [
  ("pinned button",
   "  return (\n    <>\n      {sidebarSections.map((section) => (",
   PINNED),

  ("drop from PRODUCT",
   '    title: "PRODUCT",\n'
   '    items: [\n'
   '      { label: "Leaderboard", path: "/leaderboard" },\n',
   '    title: "PRODUCT",\n'
   '    items: [\n'),

  ("drop from route map",
   '      "/news": "PRODUCT",\n'
   '      "/leaderboard": "PRODUCT",\n',
   '      "/news": "PRODUCT",\n'),
]


def main():
    if not os.path.exists(PATH):
        print("ERROR: %s not found. Run from repo root." % PATH)
        sys.exit(1)
    s = open(PATH).read()

    problems = []
    for label, anchor, _ in EDITS:
        n = s.count(anchor)
        if n != 1:
            problems.append("  [%s] anchor found %d times (expected 1)" % (label, n))
    if problems:
        print("ABORTED - nothing written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    shutil.copy(PATH, PATH + ".bak")
    for _, anchor, repl in EDITS:
        s = s.replace(anchor, repl, 1)
    open(PATH, "w").write(s)
    print("Patched %s (backup at %s.bak)" % (PATH, PATH))
    print("")
    print("Leaderboard is now pinned above the sidebar sections, on desktop and")
    print("in the mobile drawer, and no longer listed under PRODUCT.")


if __name__ == "__main__":
    main()
