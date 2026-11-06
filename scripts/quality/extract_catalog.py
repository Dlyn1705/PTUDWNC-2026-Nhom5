"""Maintainer tool: extract all explicit SRS/assignment IDs, including wrapped PDF IDs."""
import argparse
import json
import pathlib
import re
from pypdf import PdfReader
from traceability import ROOT, QUALITY, source_digest


def ids(text):
    return {re.sub(r'\s', '', code) for code in re.findall(r'(?:NFR|FR)\s*-\s*[A-Z]+\s*-\s*\d{3}', text)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Update inventory only; owner must update rows and review source changes.')
    args = parser.parse_args()
    pdf = 'Culinary_Blog_Nhom5/docx/SRS_Culinary_Blog_v1.0.0.pdf'
    assignment = 'Culinary_Blog_Nhom5/docx/Spec/Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md'
    srs = ids('\n'.join(page.extract_text() or '' for page in PdfReader(ROOT / pdf).pages))
    assigned = ids((ROOT / assignment).read_text(encoding='utf-8-sig'))
    catalog = {'sourceHashes': {source: source_digest(ROOT / source) for source in (pdf, assignment)},
               'sourceCount': len(srs), 'assignmentAdditions': sorted(assigned - srs), 'ids': sorted(srs | assigned)}
    target = QUALITY / 'requirements-catalog.json'
    if args.write:
        target.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    else:
        current = json.loads(target.read_text(encoding='utf-8'))
        if current != catalog:
            raise ValueError('Catalog differs from source extraction. Review source, use --write, then update traceability rows.')
    print(f'SRS {len(srs)} + assignment-only {len(assigned-srs)} = {len(srs|assigned)} requirements')


if __name__ == '__main__':
    main()
