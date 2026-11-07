import copy
import json
import unittest
from unittest.mock import patch
import traceability


class TraceabilityTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((traceability.QUALITY / 'traceability.json').read_text(encoding='utf-8'))

    def test_inventory_has_exact_reviewed_requirement_set(self):
        self.assertEqual(65, len(traceability.validate(self.data)))

    def test_missing_or_duplicate_requirement_cannot_pass(self):
        for replacement in (self.data['requirements'][:-1], self.data['requirements'] + [self.data['requirements'][0]]):
            changed = copy.deepcopy(self.data)
            changed['requirements'] = replacement
            with self.assertRaises(ValueError):
                traceability.validate(changed)

    def test_done_without_test_evidence_and_review_cannot_pass(self):
        changed = copy.deepcopy(self.data)
        changed['requirements'][0].update(status='Verified', tests=[], evidence=[], reviewedBy=None)
        with self.assertRaises(ValueError):
            traceability.validate(changed)

    def test_normalized_spec_change_requires_catalog_review(self):
        def digest(path):
            if path == traceability.ROOT / traceability.SPEC:
                return 'changed'
            return original_digest(path)

        original_digest = traceability.source_digest
        with patch.object(traceability, 'source_digest', side_effect=digest):
            with self.assertRaisesRegex(ValueError, 'Source changed:.*Culinary_Blog_Spec'):
                traceability.validate(self.data)

    def test_explicit_spec_requirement_must_have_criteria(self):
        changed = copy.deepcopy(self.data)
        row = next(row for row in changed['requirements'] if row['id'] == 'FR-RCP-005')
        del row['specCriteria']
        with self.assertRaisesRegex(ValueError, 'Missing normalized spec criteria: FR-RCP-005'):
            traceability.validate(changed)

    def test_unnumbered_checklist_clause_cannot_disappear(self):
        changed = copy.deepcopy(self.data)
        magic_bytes = next(text for text in changed['specChecklist'] if 'magic bytes' in text)
        del changed['specChecklist'][magic_bytes]
        with self.assertRaisesRegex(ValueError, 'checklist item'):
            traceability.validate(changed)

    def test_acceptance_requires_endpoint_review_and_evidence_even_with_both_test_cases(self):
        source = 'scripts/quality/traceability.py'
        test = 'scripts/quality/test_traceability.py::test_inventory_has_exact_reviewed_requirement_set'
        entry = {'source': source, 'happy': [test], 'error': [test],
                 'evidence': [], 'status': 'NeedsOwnerReview'}
        rows = [{'id': 'FR-TEST-001', 'status': 'Verified'}]
        inventory = {'Operation': source}
        endpoints = {'Operation': entry}
        self.assertEqual({'Operation': ['evidence', 'Verified status']},
                         traceability.validate_endpoints(endpoints, inventory))
        entry['evidence'] = ['quality/evidence/verification-20261106.json']
        with self.assertRaisesRegex(ValueError, '1 endpoints without verified coverage'):
            traceability.check_acceptance(rows, traceability.validate_endpoints(endpoints, inventory))
        entry['status'] = 'Verified'
        traceability.check_acceptance(rows, traceability.validate_endpoints(endpoints, inventory))
        for missing in ('happy', 'error', 'evidence'):
            with self.subTest(missing=missing):
                invalid = {**entry, missing: []}
                with self.assertRaisesRegex(ValueError, f'without {missing}'):
                    traceability.validate_endpoints({'Operation': invalid}, inventory)


if __name__ == '__main__':
    unittest.main()
