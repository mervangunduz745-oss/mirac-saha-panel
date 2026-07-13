from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from mirac_migration import (  # noqa: E402
    build_seed_bundle,
    load_source,
    normalize_state,
    validate_seed_files,
    validate_state,
    write_seed_bundle,
)


def sample_state() -> dict:
    return {
        "meta": {"app": "Mirac ERP", "version": "1"},
        "accounts": [{"name": "Nakit Kasa", "opening": 0}],
        "cariCards": [{"id": "CR-1", "type": "Müşteri", "name": "Ali", "phone": "", "note": "", "status": "Aktif", "createdAt": "", "updatedAt": ""}],
        "items": [
            {"code": "URN-1", "name": "Ürün", "kind": "Mamül", "unit": "adet", "opening": 0, "min": 0, "cost": 0},
            {"code": "HM-1", "name": "Hammadde", "kind": "Hammadde", "unit": "adet", "opening": 0, "min": 0, "cost": 0},
        ],
        "recipes": [{"product": "URN-1", "component": "HM-1", "qty": 2, "note": ""}],
        "transactions": [{"id": "TX-1", "date": "2026-06-24", "type": "SATIS", "party": "Ali", "item": "URN-1", "qty": 1, "unitPrice": 100, "amount": 100, "paid": 100, "account": "Nakit Kasa", "status": "Ödendi", "note": "", "debtPlanId": "", "createdAt": ""}],
        "debtPlans": [{"id": "BP-1", "type": "Diğer", "scope": "Ticari", "party": "Ali", "amount": 100, "paid": 0, "dueDate": "2026-12-31", "priority": "Normal", "status": "Planlandı", "account": "Nakit Kasa", "note": "", "createdAt": ""}],
        "fixedExpenses": [{"id": "FG-1", "name": "Kira", "category": "Temel", "amount": 100, "period": "monthly", "dueDay": 1, "account": "Nakit Kasa", "active": True}],
        "productionJobs": [{"id": "IS-1", "customer": "Ali", "product": "URN-1", "qty": 1, "dueDate": "2026-12-31", "stage": "Kesim", "priority": "Normal", "note": ""}],
        "logs": [{"at": "2026-06-24T00:00:00Z", "event": "TEST", "detail": ""}],
    }


class MigrationTests(unittest.TestCase):
    def test_bundle_uses_org_subcollections_and_migration_fields(self) -> None:
        state, normalization_issues = normalize_state(sample_state())
        self.assertEqual([], normalization_issues)
        bundle, collision_issues = build_seed_bundle(state, "mirac", 2, "batch-001", {"kind": "test"})
        self.assertEqual([], collision_issues)
        for collection, payload in bundle["collections"].items():
            self.assertEqual(f"orgs/mirac/{collection}", payload["collectionPath"])
            for document in payload["documents"]:
                self.assertTrue(document["path"].startswith(f"orgs/mirac/{collection}/"))
                self.assertIn("legacyId", document["data"])
                self.assertEqual(2, document["data"]["schemaVersion"])
                self.assertEqual("batch-001", document["data"]["importBatchId"])

    def test_duplicate_legacy_code_is_blocking(self) -> None:
        raw = sample_state()
        raw["items"].append(dict(raw["items"][0]))
        state, _ = normalize_state(raw)
        issues, _ = validate_state(state)
        codes = [issue.code for issue in issues]
        self.assertIn("DUPLICATE_LEGACY_IDENTIFIER", codes)

    def test_debt_status_mismatch_is_reported(self) -> None:
        raw = sample_state()
        raw["debtPlans"][0].update({"paid": 20, "status": "Ödendi"})
        state, _ = normalize_state(raw)
        issues, _ = validate_state(state)
        self.assertIn("DEBT_CLOSED_WITH_BALANCE", [issue.code for issue in issues])

    def test_unresolved_hard_reference_is_reported(self) -> None:
        raw = sample_state()
        raw["productionJobs"][0]["product"] = "YOK"
        state, _ = normalize_state(raw)
        issues, refs = validate_state(state)
        self.assertTrue(any(not ref.resolved and ref.targetLegacyId == "YOK" for ref in refs))
        self.assertIn("UNRESOLVED_REFERENCE", [issue.code for issue in issues])

    def test_excel_loader_uses_real_headers_not_fixed_positions(self) -> None:
        from openpyxl import Workbook

        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp_dir:
            path = Path(temp_dir) / "legacy.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "HAREKETLER"
            sheet.append(["id", "createdAt"])
            sheet.append(["TX-OLD", "2026-06-17T10:56:29.751Z"])
            workbook.save(path)
            workbook.close()

            raw, _, _ = load_source(str(path))
            state, _ = normalize_state(raw)
            self.assertEqual("2026-06-17T10:56:29.751Z", state["transactions"][0]["createdAt"])
            self.assertEqual("", state["transactions"][0]["debtPlanId"])

    def test_written_seed_validates(self) -> None:
        state, _ = normalize_state(sample_state())
        bundle, _ = build_seed_bundle(state, "mirac", 1, "batch-002", {"kind": "test"})
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp_dir:
            output = Path(temp_dir) / "seed"
            write_seed_bundle(bundle, output)
            self.assertEqual([], validate_seed_files(output))
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual("mirac", manifest["orgId"])


if __name__ == "__main__":
    unittest.main()
