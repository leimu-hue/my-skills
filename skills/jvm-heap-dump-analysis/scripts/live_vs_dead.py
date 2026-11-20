#!/usr/bin/env python3
"""Join a MAT live-object histogram with a full HPROF composition scan.

MAT drops unreachable objects while indexing, so its histogram only shows the
live set. HprofComposition streams the file and counts every object, live or
not. Joining the two by class yields the per-class garbage that neither tool
shows alone -- that is what explains "the heap was full but only 1 GB is live".

The two outputs spell array classes differently:
    HprofComposition   [L[Ljava.lang.Object;;     (JVM descriptor of Object[][])
    MAT histogram      java.lang.Object[][]
Joining on the raw strings silently loses the largest garbage class, because
Object[][] never matches Object[]. Both sides are normalised to source style
before the join.

Usage:
    python live_vs_dead.py --live hist.csv --total composition.csv \
                           [--top 30] [--csv out.csv] [--header-bytes 16]

Inputs:
    --live   CSV from `mat_analyze.py query <dump> --command histogram`
             (columns: Class Name, Objects, Shallow Heap)
    --total  CSV from `java HprofComposition.java <dump> --csv composition.csv`
             (columns: class, count, bytes; bytes exclude object headers)

Notes:
    * dead_count is exact (total - live).
    * dead_bytes is an estimate: the live payload is approximated as
      live_shallow - header_bytes * live_count, then subtracted from the total
      payload. MAT's shallow includes headers, HprofComposition's does not.
    * Both bytes columns are HPROF payload, NOT JVM heap bytes: HPROF ids are
      always 8 bytes while a compressed-oops heap uses 4-byte refs, so object
      arrays and instances are inflated. Use these columns to rank churn, and
      take absolute heap size from MAT (live shallow + "Removed ... bytes").
"""

import argparse
import csv
import sys

PRIM = {
    "Z": "boolean", "C": "char", "F": "float", "D": "double",
    "B": "byte", "S": "short", "I": "int", "J": "long",
}


def to_source(name):
    """Normalise either MAT or JVM-descriptor class names to source style."""
    name = name.strip()
    if not name.startswith("["):
        return name.replace("/", ".")
    rest = name[1:]
    if rest.startswith("L") and rest.endswith(";"):
        inner = to_source(rest[1:-1])
        return None if inner is None else inner + "[]"
    if rest in PRIM:
        return PRIM[rest] + "[]"
    return None


def load_live(path):
    """MAT histogram CSV -> {class: (objects, shallow_bytes)}."""
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("Class Name") or "").strip()
            if not name or name.lower().startswith("total"):
                continue
            try:
                objects = int(row["Objects"])
                shallow = int(row["Shallow Heap"])
            except (KeyError, TypeError, ValueError):
                continue
            key = to_source(name)
            if key is None:
                continue
            prev = out.get(key, (0, 0))
            out[key] = (prev[0] + objects, prev[1] + shallow)
    return out


def load_total(path):
    """HprofComposition CSV -> {class: (count, payload_bytes)}."""
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("class") or "").strip()
            if not name:
                continue
            key = to_source(name)
            if key is None:
                continue
            try:
                count = int(row["count"])
                size = int(row["bytes"])
            except (KeyError, TypeError, ValueError):
                continue
            prev = out.get(key, (0, 0))
            out[key] = (prev[0] + count, prev[1] + size)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live", required=True, help="MAT histogram CSV")
    ap.add_argument("--total", required=True, help="HprofComposition CSV")
    ap.add_argument("--top", type=int, default=30)
    ap.add_argument("--csv", help="write the full join to this CSV")
    ap.add_argument("--header-bytes", type=int, default=16,
                    help="per-object header used to convert shallow to payload (default 16)")
    args = ap.parse_args()

    live = load_live(args.live)
    total = load_total(args.total)
    if not live:
        sys.exit("no rows parsed from --live; check the column names")
    if not total:
        sys.exit("no rows parsed from --total; check the column names")

    rows = []
    total_dead_bytes = 0
    total_dead_count = 0
    for name, (tcount, tbytes) in total.items():
        lcount, lshallow = live.get(name, (0, 0))
        live_payload = max(0, lshallow - args.header_bytes * lcount)
        dead_count = tcount - lcount
        dead_bytes = max(0, tbytes - live_payload)
        total_dead_count += max(0, dead_count)
        total_dead_bytes += dead_bytes
        rows.append((name, tcount, lcount, dead_count, tbytes, dead_bytes))

    rows.sort(key=lambda r: r[5], reverse=True)

    unmatched_live = [(n, v) for n, v in live.items() if n not in total]
    unmatched_live.sort(key=lambda kv: kv[1][1], reverse=True)

    print(f"live classes={len(live)}  total classes={len(total)}  "
          f"joined={len(rows) - len(unmatched_live)}")
    print(f"dead objects={total_dead_count}  dead payload={total_dead_bytes / 1048576:.1f} MiB "
          f"(estimate: total payload - live shallow + {args.header_bytes}B/object)")
    if unmatched_live:
        print("\nlive classes absent from the composition scan (check name normalisation):")
        for name, (count, shallow) in unmatched_live[:5]:
            print(f"  {name}  objects={count}  shallow={shallow}")

    print(f"\n{'class':<58}{'total':>12}{'live':>12}{'dead':>12}{'dead MiB':>12}")
    for name, tcount, lcount, dead_count, tbytes, dead_bytes in rows[:args.top]:
        print(f"{name[:58]:<58}{tcount:>12}{lcount:>12}{dead_count:>12}{dead_bytes / 1048576:>12.1f}")

    if args.csv:
        with open(args.csv, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["class", "total_objects", "live_objects", "dead_objects",
                        "total_payload_bytes", "dead_payload_bytes_est"])
            w.writerows(rows)
        print(f"\ncsv={args.csv}")


if __name__ == "__main__":
    main()
