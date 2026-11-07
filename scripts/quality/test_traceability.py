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


if __name__ == '__main__':
    unittest.main()
