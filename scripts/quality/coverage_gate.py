"""Merge Cobertura by source line (never average report percentages). Fail closed."""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


def measure(reports):
    lines = {}
    expected_inventory = None
    for report in reports:
        root = ET.parse(report).getroot()
        inventory = set()
        for package in root.findall('.//package'):
            if package.get('name') != 'CulinaryBlog.Application':
                continue
            for cls in package.findall('./classes/class'):
                filename = cls.get('filename', '').replace('\\', '/')
                # Count the complete Application assembly, a stricter scope than only CQRS.
                anchor = 'CulinaryBlog.Application/'
                filename = filename[filename.index(anchor):] if anchor in filename else filename
                for line in cls.findall('./lines/line'):
                    key = (filename, int(line.attrib['number']))
                    inventory.add(key)
                    lines[key] = lines.get(key, False) or int(line.attrib['hits']) > 0
        if inventory:
            if expected_inventory is not None and inventory != expected_inventory:
                raise ValueError('Application line inventory differs between reports. Do not merge Debug/Release, filters, or different builds.')
            expected_inventory = inventory
    if not lines:
        raise ValueError('No Application source lines found; coverage cannot pass on empty/missing reports.')
    covered = sum(lines.values())
    return {'covered': covered, 'valid': len(lines), 'percent': round(covered * 100 / len(lines), 6)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('reports', type=pathlib.Path)
    parser.add_argument('--baseline', type=pathlib.Path, default=pathlib.Path('quality/coverage-baseline.json'))
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('artifacts/quality/coverage.json'))
    parser.add_argument('--base-ref', default=os.environ.get('QUALITY_BASE_SHA'))
    parser.add_argument('--label', default='Application coverage')
    args = parser.parse_args()
    reports = list(args.reports.rglob('coverage.cobertura.xml'))
    result = measure(reports)
    baseline = json.loads(args.baseline.read_text(encoding='utf-8-sig'))
    if args.base_ref and not re.fullmatch('0{40}', args.base_ref):
        if not re.fullmatch('[a-f0-9]{40}', args.base_ref):
            raise ValueError('Quality base must be a full commit SHA')
        subprocess.run(['git', 'cat-file', '-e', args.base_ref + '^{commit}'], check=True, capture_output=True)
        previous = subprocess.run(['git', 'show', args.base_ref + ':quality/coverage-baseline.json'], capture_output=True, text=True)
        if previous.returncode == 0:
            old = json.loads(previous.stdout)['minimumPercent']
            if baseline['minimumPercent'] < old:
                raise ValueError(f'Coverage baseline cannot decrease: {old} -> {baseline["minimumPercent"]}')
    threshold = max(80.0, baseline['minimumPercent'])
    result.update(reports=len(reports), requiredPercent=threshold, passed=result['percent'] >= threshold)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
            summary.write(f'### {args.label}\n\n| Covered / valid | Line coverage | Required | Result |\n| --- | --- | --- | --- |\n| {result["covered"]}/{result["valid"]} | {result["percent"]:.4f}% | {threshold}% | {"PASS" if result["passed"] else "FAIL"} |\n\n')
    if not result['passed']:
        sys.exit(1)


if __name__ == '__main__':
    main()
