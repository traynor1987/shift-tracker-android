#!/usr/bin/env python3
"""Exact per-suite counts from Gradle JUnit XML, including skipped tests."""
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET

suites = []
for module in ("app", "wear"):
    for source in sorted(Path(module, "build/test-results").glob("**/TEST-*.xml")):
        root = ET.parse(source).getroot()
        cases = root.findall("testcase")
        skipped = sum(case.find("skipped") is not None for case in cases)
        failures = sum(case.find("failure") is not None for case in cases)
        errors = sum(case.find("error") is not None for case in cases)
        suites.append(dict(module=module, suite=root.attrib.get("name"), discovered=len(cases),
                           executed=len(cases)-skipped, skipped=skipped, failures=failures, errors=errors))
totals = {field: sum(suite[field] for suite in suites)
          for field in ("discovered", "executed", "skipped", "failures", "errors")}
result = dict(source="Gradle JUnit XML", totals=totals, suites=suites)
output = Path("build/reports/native-test-summary.json")
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + "\n")
lines = ["## Native JUnit results", "", "| Module | Suite | Executed | Skipped | Failures | Errors |",
         "|---|---|---:|---:|---:|---:|"]
lines.extend(f"| {s['module']} | {s['suite']} | {s['executed']} | {s['skipped']} | {s['failures']} | {s['errors']} |" for s in suites)
lines.extend(["", f"Total executed: **{totals['executed']}**; skipped: {totals['skipped']}; failures: {totals['failures']}; errors: {totals['errors']}.",
              "", "Synthetic journal benchmark is attached separately; it excludes Android Keystore and filesystem latency."])
if not suites:
    lines.append("No JUnit XML was produced; no executed-test claim is available.")
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a") as stream:
        stream.write("\n".join(lines) + "\n")
print(json.dumps(totals))
