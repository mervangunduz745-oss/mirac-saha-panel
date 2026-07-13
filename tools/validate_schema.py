from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from mirac_migration import DEFAULT_API_URL, run_migration, validate_seed_files


def main() -> int:
    cli = argparse.ArgumentParser(description="Kaynak state veya üretilmiş Firebase seed klasörünü doğrular.")
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument("--source", help=f"GET URL, JSON veya XLSX. Varsayılan API örneği: {DEFAULT_API_URL}")
    mode.add_argument("--seed-dir", type=Path, help="manifest.json içeren seed klasörü.")
    cli.add_argument("--org-id", default="mirac", help="Kaynak doğrulamada geçici hedef org.")
    cli.add_argument("--schema-version", type=int, default=1)
    cli.add_argument("--timeout", type=float, default=10.0)
    args = cli.parse_args()
    try:
        if args.seed_dir:
            issues = validate_seed_files(args.seed_dir.resolve())
            counts = Counter(issue.severity for issue in issues)
            for issue in issues:
                print(f"{issue.severity.upper()} {issue.code} {issue.collection}: {issue.message}")
            print(f"Hata/Uyarı: {counts['error']}/{counts['warning']}")
            return 2 if counts["error"] else 0

        _, _, report = run_migration(args.source, args.org_id, args.schema_version, timeout=args.timeout)
        summary = report["summary"]
        for issue in report["issues"]:
            print(f"{issue['severity'].upper()} {issue['code']} {issue['collection']}: {issue['message']}")
        print(f"Şema geçerli: {summary['schemaValid']}")
        print(f"Yüklemeye hazır: {summary['uploadReady']}")
        return 0 if summary["uploadReady"] else (2 if not summary["schemaValid"] else 3)
    except Exception as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
