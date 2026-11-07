import pathlib
import tempfile
import unittest
from coverage_gate import measure


class CoverageGateTests(unittest.TestCase):
    def test_union_counts_shared_lines_once_and_keeps_uncovered_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for index, hits in enumerate([(1, 0), (0, 1)]):
                path = pathlib.Path(directory) / f'{index}.xml'
                path.write_text(f'<coverage><packages><package name="CulinaryBlog.Application"><classes><class filename="CulinaryBlog.Application/a.cs"><lines><line number="1" hits="{hits[0]}"/><line number="2" hits="{hits[1]}"/><line number="3" hits="0"/></lines></class></classes></package></packages></coverage>')
                paths.append(path)
            result = measure(paths)
            self.assertEqual((result['covered'], result['valid']), (2, 3))

    def test_empty_report_fails_closed(self):
        with self.assertRaises(ValueError):
            measure([])

    def test_different_build_line_inventories_cannot_be_merged(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for index, line_number in enumerate([1, 2]):
                path = pathlib.Path(directory) / f'{index}.xml'
                path.write_text(f'<coverage><packages><package name="CulinaryBlog.Application"><classes><class filename="a.cs"><lines><line number="{line_number}" hits="1"/></lines></class></classes></package></packages></coverage>')
                paths.append(path)
            with self.assertRaises(ValueError):
                measure(paths)


if __name__ == '__main__':
    unittest.main()
