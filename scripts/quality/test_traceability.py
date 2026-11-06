import copy
import json
import unittest
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


if __name__ == '__main__':
    unittest.main()
