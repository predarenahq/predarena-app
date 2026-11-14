"""
Points the leaderboard endpoint at leaderboard_points().

The board needs two columns the old leaderboard() does not return. Adding them
to it would mean a drop-and-recreate; a separate function is a plain create
that cannot half-apply and leaves the old one working.

Anchors on the rpc name string, requires exactly two, so indentation does not
matter.

Run from repo root:  python3 migrations/patch_leaderboard_rpc_name.py
"""
import sys, os, shutil

PATH = "api/content.mjs"
OLD = "supabase.rpc('leaderboard',"
NEW = "supabase.rpc('leaderboard_points',"


def main():
    if not os.path.exists(PATH):
        print("ERROR: %s not found. Run from repo root." % PATH)
        sys.exit(1)
    s = open(PATH).read()

    n = s.count(OLD)
    if n != 2:
        print("ABORTED - nothing written. Found %d of %r, expected 2." % (n, OLD))
        if "leaderboard_points" in s:
            print("Already pointing at leaderboard_points - nothing to do.")
        sys.exit(1)

    shutil.copy(PATH, PATH + ".bak")
    open(PATH, "w").write(s.replace(OLD, NEW))
    print("Patched %s - both calls now use leaderboard_points()." % PATH)


if __name__ == "__main__":
    main()
