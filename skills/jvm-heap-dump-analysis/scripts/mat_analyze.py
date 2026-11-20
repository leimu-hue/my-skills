#!/usr/bin/env python3
"""Drive Eclipse MAT in batch mode: index, run reports, run queries, read HTML as text.

Why this wrapper exists: MAT's default heap is -Xmx1024m (far too small for a
multi-GB dump), its RCP launcher needs a JDK 17-23, and its report *arguments*
are easy to get wrong. Everything that is easy to fumble is pinned here.

Commands
  env                                 check MAT / JDK discovery and heap sizing
  index   <dump>                      parse + build indexes (reusable by later runs)
  reports <dump>                      leak suspects + overview + top components, unzipped
  query   <dump> --command <cmd>      run one MAT query, e.g. --command histogram
  oql     <dump> --select <oql>       run one OQL statement, e.g. --select "SELECT * FROM java.lang.String"
  text    <path>                      strip a report .zip / directory / .html to plain text

Exit codes: 0 ok, 2 usage, 3 environment problem (no MAT / no suitable java).
"""

import argparse
import glob
import html
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

MAT_CANDIDATES = [
    os.environ.get("MAT_HOME", ""),
    r"D:\softwares\MemoryAnalyzer\mat",
    r"C:\Program Files\MemoryAnalyzer\mat",
    r"C:\Program Files\Eclipse Memory Analyzer\mat",
    "/opt/mat",
    "/Applications/mat.app/Contents/Eclipse",
    os.path.expanduser("~/mat"),
]

REPORTS = [
    "org.eclipse.mat.api:suspects",
    "org.eclipse.mat.api:overview",
    "org.eclipse.mat.api:top_components",
]


# --------------------------------------------------------------------- discovery

def find_mat(explicit=None):
    for cand in ([explicit] if explicit else []) + MAT_CANDIDATES:
        if cand and os.path.isdir(cand):
            jars = glob.glob(os.path.join(cand, "plugins", "org.eclipse.equinox.launcher_*.jar"))
            if jars:
                return os.path.abspath(cand), sorted(jars)[-1]
    return None, None


def java_candidates(explicit=None):
    cands = []
    if explicit:
        cands.append(explicit)
    if os.environ.get("JAVA_HOME"):
        cands.append(os.path.join(os.environ["JAVA_HOME"], "bin", "java.exe" if os.name == "nt" else "java"))
    found = shutil.which("java")
    if found:
        cands.append(found)
    exe = "java.exe" if os.name == "nt" else "java"
    for pattern in (r"C:\Users\*\scoop\apps\*\current\bin\java.exe",
                    r"C:\Program Files\*\*\bin\java.exe",
                    os.path.expanduser(r"~\.jdks\*\bin\java.exe"),
                    "/usr/lib/jvm/*/bin/java"):
        cands.extend(glob.glob(pattern))
    seen, out = set(), []
    for c in cands:
        if c and os.path.isfile(c):
            p = os.path.abspath(c)
            if p not in seen:
                seen.add(p)
                out.append(p)
    return out


def java_major(java_path):
    try:
        out = subprocess.run([java_path, "-version"], capture_output=True, text=True, timeout=30).stderr
    except Exception:
        return None
    m = re.search(r'version "(\d+)(?:\.(\d+))?', out)
    if not m:
        return None
    major = int(m.group(1))
    return major if major != 1 else int(m.group(2) or 0)


def pick_java(explicit=None):
    """Prefer a JDK MAT is known to run on (17-21) and silently skip newer ones."""
    cands = java_candidates(explicit)
    if not cands:
        sys.exit("no java found: install a JDK 17-23 or pass --java")
    graded = [(c, java_major(c)) for c in cands]
    if explicit:
        java, major = graded[0]
        if major and not (17 <= major <= 23):
            print(f"warning: {java} is Java {major}; MAT 1.16 is verified on 17-21 only.", file=sys.stderr)
        return java
    for java, major in graded:
        if major and 17 <= major <= 21:
            return java
    java, major = graded[0]
    print(f"warning: only Java {major} available at {java}; MAT 1.16 is verified on 17-21 only. "
          f"If Eclipse/OSGi fails to start, install a JDK 21.", file=sys.stderr)
    return java


def default_xmx(dump_path):
    """MAT needs room for the indexes plus the dominator tree, not just the dump bytes."""
    gb = os.path.getsize(dump_path) / (1024 ** 3)
    want = max(3.0, gb * 1.6)
    try:
        if os.name == "nt":
            out = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"],
                                 capture_output=True, text=True, timeout=30).stdout.strip()
            ram_gb = int(out) / (1024 ** 3) if out else 16
        else:
            ram_gb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024 ** 3)
    except Exception:
        ram_gb = 16
    return f"{int(min(want, max(2.0, ram_gb * 0.7)))}g"


# --------------------------------------------------------------------- runner

def run_mat(mat_dir, launcher, java, dump, extra, xmx=None, workspace=None):
    workspace = workspace or os.path.join(os.path.dirname(os.path.abspath(dump)), ".mat-workspace")
    os.makedirs(workspace, exist_ok=True)
    xmx = xmx or default_xmx(dump)
    cmd = [java, f"-Xmx{xmx}", "-XX:MaxMetaspaceSize=1g", "-XX:+UseG1GC",
           "--add-exports=java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED",
           "-jar", launcher, "-consoleLog", "-nosplash", "-data", workspace,
           "-application", "org.eclipse.mat.api.parse", dump] + extra
    print("+ " + " ".join(cmd), file=sys.stderr)
    return subprocess.run(cmd).returncode


def unzip_reports(dump):
    """MAT writes <dump>_<Report>.zip next to the dump; unzip so HTML is greppable."""
    made = []
    base = os.path.splitext(os.path.abspath(dump))[0]
    for path in sorted(glob.glob(base + "_*.zip")):
        target = os.path.splitext(path)[0]
        if os.path.isdir(target):
            shutil.rmtree(target, ignore_errors=True)
        with zipfile.ZipFile(path) as z:
            z.extractall(target)
        made.append(target)
    return made


# --------------------------------------------------------------------- commands

def cmd_env(args):
    mat_dir, launcher = find_mat(args.mat)
    if not mat_dir:
        print("MAT not found. Pass --mat <MemoryAnalyzer/mat dir> or set MAT_HOME.", file=sys.stderr)
        return 3
    java = pick_java(args.java)
    print(f"mat      {mat_dir}")
    print(f"launcher {os.path.basename(launcher)}")
    print(f"java     {java} (Java {java_major(java)})")
    if args.dump:
        print(f"dump     {args.dump} ({os.path.getsize(args.dump) / 1024 ** 3:.1f} GiB)")
        print(f"xmx      {args.xmx or default_xmx(args.dump)}")
    print("reports  " + " ".join(REPORTS))
    return 0


def cmd_index(args):
    mat_dir, launcher = find_mat(args.mat)
    if not mat_dir:
        return 3
    java = pick_java(args.java)
    rc = run_mat(mat_dir, launcher, java, args.dump, [], args.xmx)
    if rc == 0:
        sidecars = glob.glob(os.path.splitext(args.dump)[0] + ".*index")
        print(f"indexed: {len(sidecars)} index files next to the dump")
    return rc


def cmd_reports(args):
    mat_dir, launcher = find_mat(args.mat)
    if not mat_dir:
        return 3
    java = pick_java(args.java)
    extra = list(REPORTS)
    if args.keep_unreachable:
        extra.insert(0, "-keep_unreachable_objects")
    rc = run_mat(mat_dir, launcher, java, args.dump, extra, args.xmx)
    if rc != 0:
        return rc
    for d in unzip_reports(args.dump):
        print(os.path.join(d, "index.html"))
    return 0


def _query_run(args, command):
    mat_dir, launcher = find_mat(args.mat)
    if not mat_dir:
        return 3
    java = pick_java(args.java)
    extra = [f"-command={command}", f"-format={args.format}", "-unzip", f"-limit={args.limit}",
             "org.eclipse.mat.api:query"]
    rc = run_mat(mat_dir, launcher, java, args.dump, extra, args.xmx)
    if rc != 0:
        return rc
    base = os.path.splitext(os.path.abspath(args.dump))[0]
    pages = os.path.join(base + "_Query", "pages")
    ext = {"csv": "*.csv", "txt": "*.txt", "html": "*.html"}[args.format]
    out = sorted(glob.glob(os.path.join(pages, ext)))
    for path in out:
        print(f"result {path}")
        with open(path, encoding="utf-8", errors="replace") as fh:
            sys.stdout.write(fh.read())
    return 0


def cmd_query(args):
    return _query_run(args, args.command)


def cmd_oql(args):
    oql = args.select.strip()
    if '"' in oql or "\\" in oql:
        print("warning: OQL containing quotes/backslashes is fragile on Windows; prefer a .oql file "
              "or run MAT's GUI. Retrying anyway.", file=sys.stderr)
    return _query_run(args, f'oql "{oql}"')


def cmd_text(args):
    src = args.path
    if os.path.isfile(src) and src.endswith(".zip"):
        tmp = tempfile.mkdtemp(prefix="mat-report-")
        with zipfile.ZipFile(src) as z:
            z.extractall(tmp)
        src = tmp
    targets = []
    if os.path.isdir(src):
        targets = sorted(glob.glob(os.path.join(src, "**", "*.html"), recursive=True))
    elif os.path.isfile(src):
        targets = [src]
    if not targets:
        print("nothing to read", file=sys.stderr)
        return 2
    for path in targets:
        with open(path, encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        text = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", "", raw)
        text = re.sub(r"</t[dh]>", "\t", text)
        text = re.sub(r"</tr>|<br\s*/?>", "\n", text)
        text = re.sub(r"<[^>]+>", "", text)
        text = html.unescape(text).replace("\xa0", " ")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        print(f"===== {path} =====")
        print("\n".join(lines))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mat", help="MAT install dir (contains plugins/ and MemoryAnalyzer.ini)")
    ap.add_argument("--java", help="java executable to run MAT with")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("env")
    p.add_argument("dump", nargs="?")
    p.add_argument("--xmx")
    p.set_defaults(func=cmd_env)

    for name, func in (("index", cmd_index), ("reports", cmd_reports)):
        p = sub.add_parser(name)
        p.add_argument("dump")
        p.add_argument("--xmx")
        p.set_defaults(func=func)
    sub.choices["reports"].add_argument("--keep-unreachable", action="store_true",
                                        help="keep unreachable objects in the snapshot (much bigger indexes)")

    p = sub.add_parser("query")
    p.add_argument("dump")
    p.add_argument("--command", "-c", required=True, help="e.g. histogram")
    p.add_argument("--format", "-f", default="csv", choices=["csv", "txt", "html"])
    p.add_argument("--limit", "-l", type=int, default=50)
    p.add_argument("--xmx")
    p.set_defaults(func=cmd_query)

    p = sub.add_parser("oql")
    p.add_argument("dump")
    p.add_argument("--select", "-s", required=True)
    p.add_argument("--format", "-f", default="csv", choices=["csv", "txt", "html"])
    p.add_argument("--limit", "-l", type=int, default=50)
    p.add_argument("--xmx")
    p.set_defaults(func=cmd_oql)

    p = sub.add_parser("text")
    p.add_argument("path")
    p.set_defaults(func=cmd_text)

    args = ap.parse_args()
    sys.exit(args.func(args) or 0)


if __name__ == "__main__":
    main()
