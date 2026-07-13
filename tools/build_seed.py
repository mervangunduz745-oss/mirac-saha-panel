from __future__ import annotations

import argparse
import sys
from pathlib import Path

from mirac_migration import DEFAULT_API_URL, report_markdown, run_migration, write_json, write_seed_bundle


BASE_DIR = Path(__file__).resolve().parent


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(
        description="Mirac ERP state/Excel kaynağından org alt koleksiyonları için salt-okunur Firebase seed paketi üretir."
    )
    cli.add_argument("--source", default=DEFAULT_API_URL, help="GET URL, JSON veya XLSX kaynak.")
    cli.add_argument("--org-id", required=True, help="Hedef org kimliği; örnek: mirac.")
    cli.add_argument("--schema-version", type=int, default=1)
    cli.add_argument("--import-batch-id", help="Verilmezse zaman + kaynak hash ile üretilir.")
    cli.add_argument("--output-dir", type=Path, help="Boş çıktı klasörü. Verilmezse seed_batches/<batchId>.")
    cli.add_argument("--timeout", type=float, default=10.0, help="HTTP GET zaman aşımı (saniye).")
    return cli


def main() -> int:
    args = parser().parse_args()
    try:
        _, bundle, report = run_migration(
            source=args.source,
            org_id=args.org_id,
            schema_version=args.schema_version,
            import_batch_id=args.import_batch_id,
            timeout=args.timeout,
        )
        output_dir = args.output_dir or BASE_DIR / "seed_batches" / bundle["importBatchId"]
        output_dir = output_dir.resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        if report["summary"]["schemaValid"]:
            written = write_seed_bundle(bundle, output_dir)
        else:
            written = []

        write_json(output_dir / "dry_run_report.json", report)
        (output_dir / "dry_run_report.md").write_text(report_markdown(report), encoding="utf-8")

        print(f"Çıktı: {output_dir}")
        print(f"Seed belgeleri: {report['summary']['seedDocumentCount']}")
        print(f"Hata/Uyarı: {report['summary']['issueCounts']['error']}/{report['summary']['issueCounts']['warning']}")
        print(f"Şema geçerli: {report['summary']['schemaValid']}")
        print(f"Yüklemeye hazır: {report['summary']['uploadReady']}")
        if written:
            print(f"Seed dosyaları: {len(written)}")
        else:
            print("Seed yazılmadı: yapısal şema/çakışma hatası var.")

        if not report["summary"]["schemaValid"]:
            return 2
        if not report["summary"]["uploadReady"]:
            return 3
        return 0
    except Exception as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
