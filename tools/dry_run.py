from __future__ import annotations

import argparse
import sys
from pathlib import Path

from mirac_migration import DEFAULT_API_URL, report_markdown, run_migration, write_json


BASE_DIR = Path(__file__).resolve().parent


def main() -> int:
    cli = argparse.ArgumentParser(description="Seed yazmadan Mirac ERP Firebase migrasyon dry-run raporu üretir.")
    cli.add_argument("--source", default=DEFAULT_API_URL, help="GET URL, JSON veya XLSX kaynak.")
    cli.add_argument("--org-id", required=True)
    cli.add_argument("--schema-version", type=int, default=1)
    cli.add_argument("--import-batch-id")
    cli.add_argument("--report-dir", type=Path, help="Verilmezse dry_runs/<batchId>.")
    cli.add_argument("--timeout", type=float, default=10.0)
    args = cli.parse_args()
    try:
        _, bundle, report = run_migration(
            args.source, args.org_id, args.schema_version, args.import_batch_id, args.timeout
        )
        report_dir = (args.report_dir or BASE_DIR / "dry_runs" / bundle["importBatchId"]).resolve()
        report_dir.mkdir(parents=True, exist_ok=True)
        write_json(report_dir / "dry_run_report.json", report)
        (report_dir / "dry_run_report.md").write_text(report_markdown(report), encoding="utf-8")
        summary = report["summary"]
        print(f"Rapor: {report_dir}")
        print(f"Şema/Yükleme: {summary['schemaValid']}/{summary['uploadReady']}")
        print(f"Hata/Uyarı/Çözülmeyen ref: {summary['issueCounts']['error']}/{summary['issueCounts']['warning']}/{summary['unresolvedReferenceCount']}")
        return 0 if summary["uploadReady"] else (2 if not summary["schemaValid"] else 3)
    except Exception as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
