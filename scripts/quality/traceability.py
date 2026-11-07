"""Validate full requirement inventory, evidence links, and endpoint inventory drift."""
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
QUALITY = ROOT / 'quality'
SRS = 'Culinary_Blog_Nhom5/docx/SRS_Culinary_Blog_v1.0.0.pdf'
ASSIGNMENT = 'Culinary_Blog_Nhom5/docx/Spec/Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md'
SPEC = 'Culinary_Blog_Nhom5/docx/Spec/Culinary_Blog_Spec.md'
SOURCES = (SRS, ASSIGNMENT, SPEC)
STATUSES = {'NeedsOwnerReview', 'MissingEvidence', 'Verified'}


def normalized_sections():
    source = (ROOT / SPEC).read_text(encoding='utf-8-sig')
    return dict(re.findall(r'^#{2,6} (\d+(?:\.\d+)*)\.? (.+)$', source, re.MULTILINE))


def validate_spec_mapping(data, ids):
    sections = normalized_sections()
    mapping = data['specSections']
    if set(mapping) != set(sections):
        raise ValueError('Every numbered normalized spec section requires a traceability mapping')
    for section, entry in mapping.items():
        requirements = entry['requirements']
        if not entry['scope'].strip() or set(requirements) - set(ids):
            raise ValueError(f'Invalid normalized spec section mapping: {section}')
        if not requirements and section not in {'9', '11'}:
            raise ValueError(f'Missing requirements for normalized spec section: {section}')
    source = (ROOT / SPEC).read_text(encoding='utf-8-sig')
    checklist = re.findall(r'^- \[[ xX]\] (.+)$', source.split('## 12.', 1)[1], re.MULTILINE)
    checklist_mapping = data['specChecklist']
    if set(checklist) != set(checklist_mapping):
        raise ValueError('Every normalized spec checklist item requires a traceability mapping')
    for criterion, requirements in checklist_mapping.items():
        if not requirements or set(requirements) - set(ids):
            raise ValueError(f'Invalid normalized spec checklist mapping: {criterion}')
    return sections


def source_digest(path):
    content = path.read_bytes() if path.suffix.lower() == '.pdf' else path.read_text(encoding='utf-8-sig').encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def validate(data):
    catalog = json.loads((QUALITY / 'requirements-catalog.json').read_text(encoding='utf-8'))
    if set(catalog['sourceHashes']) != set(SOURCES):
        raise ValueError('Catalog must track the SRS, assignment and normalized spec')
    for source, digest in catalog['sourceHashes'].items():
        if source_digest(ROOT / source) != digest:
            raise ValueError(f'Source changed: re-extract and review catalog for {source}')
    rows = data['requirements']
    ids = [row['id'] for row in rows]
    if len(ids) != len(set(ids)) or set(ids) != set(catalog['ids']):
        raise ValueError('Requirements missing, duplicated, or outside reviewed catalog')
    missing_spec = set(catalog['specIds']) - {row['id'] for row in rows if row.get('specCriteria')}
    if missing_spec:
        raise ValueError(f'Missing normalized spec criteria: {", ".join(sorted(missing_spec))}')
    spec_sections = validate_spec_mapping(data, ids)
    for row in rows:
        if not row.get('owner') or row['status'] not in STATUSES:
            raise ValueError(f'Invalid owner/status: {row["id"]}')
        for section, criteria in row.get('specCriteria', {}).items():
            if section not in spec_sections or not criteria.strip():
                raise ValueError(f'Invalid normalized spec criteria: {row["id"]} / {section}')
        for key in ('code', 'tests', 'evidence'):
            for reference in row[key]:
                if not (ROOT / reference.split('::')[0]).exists():
                    raise ValueError(f'Broken {key} link: {reference}')
                if '::' in reference:
                    path, symbol = reference.split('::', 1)
                    if not symbol.strip() or not (ROOT / path).is_file() or symbol not in (ROOT / path).read_text(encoding='utf-8-sig'):
                        raise ValueError(f'Unknown test symbol: {reference}')
        if row['status'] == 'Verified' and (not all(row[key] for key in ('code', 'tests', 'evidence')) or not (row.get('reviewedBy') or '').strip() or not row.get('reviewedCommit')):
            raise ValueError(f'Verified requires code/test/evidence, reviewer, and commit: {row["id"]}')
        if row['status'] == 'Verified' and (any('::' not in reference for reference in row['tests']) or
                any(not (ROOT / reference.split('::')[0]).is_file() for reference in row['code'] + row['tests'] + row['evidence']) or
                not re.fullmatch(r'[a-f0-9]{7,40}', row['reviewedCommit'])):
            raise ValueError(f'Verified requires code files, concrete test symbols, evidence files and a commit SHA: {row["id"]}')
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


def validate_endpoints(endpoints, actual):
    if set(actual) != set(endpoints):
        raise ValueError(f'Endpoint inventory changed. Added={set(actual)-set(endpoints)} Removed={set(endpoints)-set(actual)}')
    blockers = {}
    for operation, entry in endpoints.items():
        if entry['status'] not in STATUSES:
            raise ValueError(f'Invalid endpoint status: {operation}')
        if entry['source'] != actual[operation]:
            raise ValueError(f'Endpoint source moved: update reviewed mapping for {operation}')
        missing = [case for case in ('happy', 'error', 'evidence') if not entry[case]]
        for case in ('happy', 'error'):
            for reference in entry[case]:
                path, _, symbol = reference.partition('::')
                if not symbol.strip() or not (ROOT / path).is_file() or symbol not in (ROOT / path).read_text(encoding='utf-8-sig'):
                    raise ValueError(f'Unknown test symbol for {operation}: {reference}')
        if entry['status'] == 'Verified' and missing:
            raise ValueError(f'Endpoint cannot be Verified without {", ".join(missing)}: {operation}')
        for reference in entry['evidence']:
            evidence_file = ROOT / reference
            if not evidence_file.is_file() or not evidence_file.stat().st_size:
                raise ValueError(f'Broken endpoint evidence: {reference}')
        if entry['status'] != 'Verified':
            missing.append('Verified status')
        if missing:
            blockers[operation] = missing
    return blockers


def check_acceptance(rows, endpoint_blockers):
    pending = [row['id'] for row in rows if row['status'] != 'Verified']
    if pending or endpoint_blockers:
        raise ValueError(f'Acceptance incomplete: {len(pending)} unverified requirements and '
                         f'{len(endpoint_blockers)} endpoints without verified coverage. See artifacts/quality/traceability.json.')


def main():
    data = json.loads((QUALITY / 'traceability.json').read_text(encoding='utf-8'))
    rows = validate(data)
    endpoints = json.loads((QUALITY / 'endpoint-tests.json').read_text(encoding='utf-8'))
    actual = endpoint_inventory()
    blockers = validate_endpoints(endpoints, actual)
    output = ['# Requirement traceability matrix', '',
              'Generated from `quality/traceability.json`; edit the JSON then run `python scripts/quality/traceability.py`.', '',
              'Verified requires owner review, concrete tests and run evidence. Existing files alone are not proof of acceptance.', '',
              'Sources: [SRS](../SRS_Culinary_Blog_v1.0.0.pdf), [assignment](Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md), [normalized spec](Culinary_Blog_Spec.md).',
              '',
              '| Requirement | Normalized spec criteria | Code/API/UI | Test | Owner | Status | Evidence / gap |',
              '| --- | --- | --- | --- | --- | --- | --- |']
    for row in rows:
        links = lambda values: '<br>'.join(f'`{v}`' for v in values) or '—'
        criteria = '<br>'.join(f'§{section}: {detail}' for section, detail in row.get('specCriteria', {}).items()) or '—'
        criteria = criteria.replace('|', '&#124;')
        output.append(f'| {row["id"]} | {criteria} | {links(row["code"])} | {links(row["tests"])} | {row["owner"]} | {row["status"]} | {links(row["evidence"])}<br>{row["gap"]} |')
    output.extend(['', '## Normalized spec section index', '',
                   'Section links identify review scope. Verify individual clauses and assertions before marking the mapped requirements Verified.', '',
                   '| Section | Review scope | Requirements |', '| --- | --- | --- |'])
    for section, title in normalized_sections().items():
        entry = data['specSections'][section]
        output.append(f'| §{section} {title} | {entry["scope"]} | {", ".join(entry["requirements"]) or "—"} |')
    output.extend(['', '## Normalized spec acceptance checklist', '',
                   '| Criterion from §12 | Requirements |', '| --- | --- |'])
    for criterion, requirements in data['specChecklist'].items():
        output.append(f'| {criterion.replace("|", "&#124;")} | {", ".join(requirements)} |')
    text = '\n'.join(output) + '\n'
    target = ROOT / 'Culinary_Blog_Nhom5/docx/Spec/Requirement_Traceability_Matrix.md'
    if '--check' in sys.argv:
        if not target.exists() or target.read_text(encoding='utf-8') != text:
            raise ValueError('Generated Markdown matrix is stale')
    else:
        target.write_text(text, encoding='utf-8')
    endpoint_lines = ['# Endpoint happy/error test inventory', '',
                      'Each reference is a candidate assertion mapping. Owner review is required before Verified; API contract substitutes are not live provider/storage evidence.', '',
                      '| Operation | Happy test | Error/authorization test | Status | Evidence |', '| --- | --- | --- | --- | --- |']
    for name, entry in sorted(endpoints.items()):
        endpoint_lines.append('| ' + ' | '.join([name, '<br>'.join(entry['happy']) or '—', '<br>'.join(entry['error']) or '—', entry['status'], '<br>'.join(entry['evidence']) or '—']) + ' |')
    endpoint_text = '\n'.join(endpoint_lines) + '\n'
    endpoint_target = target.with_name('Endpoint_Test_Coverage.md')
    if '--check' in sys.argv:
        if not endpoint_target.exists() or endpoint_target.read_text(encoding='utf-8') != endpoint_text:
            raise ValueError('Generated endpoint Markdown inventory is stale')
    else:
        endpoint_target.write_text(endpoint_text, encoding='utf-8')
    gaps = [name for name, entry in endpoints.items() if not entry['happy'] or not entry['error']]
    report = {'requirements': len(rows), 'verified': sum(r['status'] == 'Verified' for r in rows),
              'unverifiedRequirements': [r['id'] for r in rows if r['status'] != 'Verified'],
              'endpointCount': len(actual), 'endpointCaseGaps': gaps,
              'endpointVerified': len(actual) - len(blockers), 'endpointAcceptanceGaps': blockers}
    directory = ROOT / 'artifacts/quality'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'traceability.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{report["verified"]}/{len(rows)} requirements and {report["endpointVerified"]}/{len(actual)} endpoints verified')
    print('Details: artifacts/quality/traceability.json')
    # Inventory gate passes with explicitly recorded legacy gaps, never calls them covered.
    # --acceptance is the stricter release/issue-closing check.
    if '--acceptance' in sys.argv:
        check_acceptance(rows, blockers)


if __name__ == '__main__':
    main()
