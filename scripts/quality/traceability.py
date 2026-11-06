"""Validate full requirement inventory, evidence links, and endpoint inventory drift."""
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
QUALITY = ROOT / 'quality'
ID = re.compile(r'(?:NFR|FR)-[A-Z]+-\d{3}')


def source_digest(path):
    content = path.read_bytes() if path.suffix.lower() == '.pdf' else path.read_text(encoding='utf-8-sig').encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def validate(data):
    catalog = json.loads((QUALITY / 'requirements-catalog.json').read_text(encoding='utf-8'))
    for source, digest in catalog['sourceHashes'].items():
        if source_digest(ROOT / source) != digest:
            raise ValueError(f'Source changed: re-extract and review catalog for {source}')
    rows = data['requirements']
    ids = [row['id'] for row in rows]
    if len(ids) != len(set(ids)) or set(ids) != set(catalog['ids']):
        raise ValueError('Requirements missing, duplicated, or outside reviewed catalog')
    for row in rows:
        if not row.get('owner') or row['status'] not in {'NeedsOwnerReview', 'MissingEvidence', 'Verified'}:
            raise ValueError(f'Invalid owner/status: {row["id"]}')
        for key in ('code', 'tests', 'evidence'):
            for reference in row[key]:
                if not (ROOT / reference.split('::')[0]).exists():
                    raise ValueError(f'Broken {key} link: {reference}')
                if '::' in reference:
                    path, symbol = reference.split('::', 1)
                    if symbol not in (ROOT / path).read_text(encoding='utf-8-sig'):
                        raise ValueError(f'Unknown test symbol: {reference}')
        if row['status'] == 'Verified' and (not all(row[key] for key in ('code', 'tests', 'evidence')) or not row.get('reviewedBy') or not row.get('reviewedCommit')):
            raise ValueError(f'Verified requires code/test/evidence, reviewer, and commit: {row["id"]}')
        if row['status'] == 'Verified' and (any('::' not in reference for reference in row['tests']) or
                any(not (ROOT / reference.split('::')[0]).is_file() for reference in row['tests'] + row['evidence']) or
                not re.fullmatch(r'[a-f0-9]{7,40}', row['reviewedCommit'])):
            raise ValueError(f'Verified requires concrete test symbols, evidence files and a commit SHA: {row["id"]}')
    return rows


def endpoint_inventory():
    result = {}
    for file in sorted((ROOT / 'Culinary_Blog_Nhom5/src/CulinaryBlog.API/Endpoints').glob('*.cs')):
        source = file.read_text(encoding='utf-8-sig')
        names = re.findall(r'\.WithName\("([^"]+)"\)', source)
        routes = re.findall(r'\.Map(?:Get|Post|Put|Patch|Delete|Methods)\(', source)
        if len(names) != len(routes):
            raise ValueError(f'Every application endpoint must have a stable operation name: {file}')
        for name in names:
            if name in result:
                raise ValueError(f'Duplicate operation name: {name}')
            result[name] = file.relative_to(ROOT).as_posix()
    return result


def main():
    data = json.loads((QUALITY / 'traceability.json').read_text(encoding='utf-8'))
    rows = validate(data)
    endpoints = json.loads((QUALITY / 'endpoint-tests.json').read_text(encoding='utf-8'))
    actual = endpoint_inventory()
    if set(actual) != set(endpoints):
        raise ValueError(f'Endpoint inventory changed. Added={set(actual)-set(endpoints)} Removed={set(endpoints)-set(actual)}')
    for operation, entry in endpoints.items():
        if entry['source'] != actual[operation]:
            raise ValueError(f'Endpoint source moved: update reviewed mapping for {operation}')
        for case in ('happy', 'error'):
            for reference in entry[case]:
                path, symbol = reference.split('::', 1)
                if symbol not in (ROOT / path).read_text(encoding='utf-8-sig'):
                    raise ValueError(f'Unknown test symbol for {operation}: {reference}')
        if entry['status'] == 'Verified' and (not entry['happy'] or not entry['error'] or not entry.get('evidence')):
            raise ValueError(f'Endpoint cannot be Verified without both cases and evidence: {operation}')
        for reference in entry['evidence']:
            if not (ROOT / reference).is_file():
                raise ValueError(f'Broken endpoint evidence: {reference}')
    output = ['# Requirement traceability matrix', '',
              'Generated from `quality/traceability.json`; edit the JSON then run `python scripts/quality/traceability.py`.', '',
              'Verified requires owner review, concrete tests and run evidence. Existing files alone are not proof of acceptance.', '',
              '| Requirement | Code/API/UI | Test | Owner | Status | Evidence / gap |',
              '| --- | --- | --- | --- | --- | --- |']
    for row in rows:
        links = lambda values: '<br>'.join(f'`{v}`' for v in values) or '—'
        output.append(f'| {row["id"]} | {links(row["code"])} | {links(row["tests"])} | {row["owner"]} | {row["status"]} | {links(row["evidence"])}<br>{row["gap"]} |')
    text = '\n'.join(output) + '\n'
    target = ROOT / 'Culinary_Blog_Nhom5/docx/Spec/Requirement_Traceability_Matrix.md'
    if '--check' in sys.argv:
        if not target.exists() or target.read_text(encoding='utf-8') != text:
            raise ValueError('Generated Markdown matrix is stale')
    else:
        target.write_text(text, encoding='utf-8')
    endpoint_lines = ['# Endpoint happy/error test inventory', '',
                      'Each reference is a candidate assertion mapping. Owner review is required before Verified; API contract substitutes are not live provider/storage evidence.', '',
                      '| Operation | Happy test | Error/authorization test | Status |', '| --- | --- | --- | --- |']
    for name, entry in sorted(endpoints.items()):
        endpoint_lines.append('| ' + ' | '.join([name, '<br>'.join(entry['happy']) or '—', '<br>'.join(entry['error']) or '—', entry['status']]) + ' |')
    endpoint_text = '\n'.join(endpoint_lines) + '\n'
    endpoint_target = target.with_name('Endpoint_Test_Coverage.md')
    if '--check' in sys.argv:
        if not endpoint_target.exists() or endpoint_target.read_text(encoding='utf-8') != endpoint_text:
            raise ValueError('Generated endpoint Markdown inventory is stale')
    else:
        endpoint_target.write_text(endpoint_text, encoding='utf-8')
    gaps = [name for name, entry in endpoints.items() if not entry['happy'] or not entry['error']]
    report = {'requirements': len(rows), 'verified': sum(r['status'] == 'Verified' for r in rows),
              'endpointCount': len(actual), 'endpointCaseGaps': gaps}
    directory = ROOT / 'artifacts/quality'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'traceability.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    # Inventory gate passes with explicitly recorded legacy gaps, never calls them covered.
    # --acceptance is the stricter release/issue-closing check.
    if '--acceptance' in sys.argv and (gaps or report['verified'] != len(rows)):
        raise ValueError('Acceptance incomplete: owner evidence or endpoint cases missing')


if __name__ == '__main__':
    main()
