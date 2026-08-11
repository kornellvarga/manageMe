from pathlib import Path

path = Path(__file__).resolve().parents[1] / "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java"
text = path.read_text(encoding="utf-8")
old = '''            FinanceSyncClient.syncAsync(this);\n            finish();\n        } catch (IllegalArgumentException ex) {\n            Toast.makeText(this, ex.getMessage(), Toast.LENGTH_LONG).show();\n        }\n    }'''
new = '''            FinanceSyncClient.syncAsync(this);\n            finish();\n        } catch (Exception ex) {\n            Toast.makeText(this, ex.getMessage() == null ? "Could not save the finance plan link." : ex.getMessage(), Toast.LENGTH_LONG).show();\n        }\n    }'''
if old not in text:
    raise RuntimeError("QuickAdd planning save catch marker not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Android planning exception handling fixed.")
