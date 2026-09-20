import sys
sys.path.insert(0, "scripts/tests")
import test_workflows
import inspect

workflows = test_workflows.load_workflows()
for name, func in inspect.getmembers(test_workflows, inspect.isfunction):
    if name.startswith("test_"):
        print(f"Running {name}...")
        try:
            func(workflows)
            print(f"✅ {name} passed.")
        except Exception as e:
            print(f"❌ {name} failed: {e}")
