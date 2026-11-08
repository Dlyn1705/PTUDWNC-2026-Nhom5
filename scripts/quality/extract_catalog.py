"""Extract explicit IDs from the SRS, assignment and normalized spec."""
import argparse
import json
import re
from pypdf import PdfReader
from traceability import ROOT, QUALITY, SRS, ASSIGNMENT, SPEC, SOURCES, source_digest


def ids(text):
    return {re.sub(r'\s', '', code) for code in re.findall(r'(?:NFR|FR)\s*-\s*[A-Z]+\s*-\s*\d{3}', text)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Update inventory only; owner must update rows and review source changes.')
    args = parser.parse_args()
    srs = ids('\n'.join(page.extract_text() or '' for page in PdfReader(ROOT / SRS).pages))
    assigned = ids((ROOT / ASSIGNMENT).read_text(encoding='utf-8-sig'))
    normalized = ids((ROOT / SPEC).read_text(encoding='utf-8-sig'))
    inventory = srs | assigned | normalized
    catalog = {'sourceHashes': {source: source_digest(ROOT / source) for source in SOURCES},
               'sourceCount': len(srs), 'assignmentAdditions': sorted(assigned - srs),
               'specIds': sorted(normalized), 'specAdditions': sorted(normalized - srs - assigned),
               'ids': sorted(inventory)}
    target = QUALITY / 'requirements-catalog.json'
    if args.write:
        target.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    else:
        current = json.loads(target.read_text(encoding='utf-8'))
        if current != catalog:
            raise ValueError('Catalog differs from source extraction. Review source, use --write, then update traceability rows.')
    print(f'SRS {len(srs)} + assignment-only {len(assigned-srs)} + spec-only {len(normalized-srs-assigned)} = {len(inventory)} requirements')


if __name__ == '__main__':
    main()
