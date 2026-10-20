"""Executes generated Python utility sources: stdin [{source, inputs}] -> stdout [[utility]]."""
import json
import sys

results = []
for case in json.load(sys.stdin):
    scope = {}
    exec(case["source"], scope)
    results.append([scope["utility"](x) for x in case["inputs"]])
json.dump(results, sys.stdout)
