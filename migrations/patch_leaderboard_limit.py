"""
Widens the leaderboard endpoint from 20 to 100, matching the new p_limit
default in the RPC. Both calls (weekly and all-time) are updated.

Anchors on the literal "p_limit: 20" and requires exactly two of them, so this
is indentation-proof and aborts if content.mjs does not look as expected.

Run from repo root:  python3 migrations/patch_leaderboard_limit.py
"""
import sys, os, shutil

PATH = "api/content.mjs"
OLD = "p_limit: 20"
NEW = "p_limit: 100"


def main():
    if not os.path.exists(PATH):
        print("ERROR: %s not found. Run from repo root." % PATH)
        sys.exit(1)
    s = open(PATH).read()

    n = s.count(OLD)
    if n != 2:
        print("ABORTED - nothing written. Found %d occurrences of %r, expected 2." % (n, OLD))
        if n == 0 and "leaderboard" not in s:
            print("content.mjs has no leaderboard branch at all - that change is")
            print("still uncommitted on your tree, or was lost.")
        elif n == 0:
            print("The limit may already be 100. Check with:")
            print("  grep -n p_limit api/content.mjs")
        sys.exit(1)

    shutil.copy(PATH, PATH + ".bak")
    open(PATH, "w").write(s.replace(OLD, NEW))
    print("Patched %s (backup at %s.bak) - both calls now request 100." % (PATH, PATH))


if __name__ == "__main__":
    main()
