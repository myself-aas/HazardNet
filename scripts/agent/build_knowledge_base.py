# scripts/agent/build_knowledge_base.py
import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
RAG_DIR = BASE_DIR / "rag_pipeline"
REF_DIR = RAG_DIR / "references"
SKILL_DIR = RAG_DIR / "skills"
OUTPUT_FILE = RAG_DIR / "agent_knowledge_base.json"

def build_kb():
    kb = {"metadata": {"version": "1.0", "domain": "BD Agriculture & Disaster"}, "documents": []}
    
    # 1. Ingest References
    if REF_DIR.exists():
        for md_file in REF_DIR.rglob("*.md"):
            with open(md_file, 'r', encoding='utf-8') as f:
                kb["documents"].append({
                    "id": md_file.stem,
                    "category": md_file.parent.name,
                    "type": "reference",
                    "content": f.read()
                })
            
    # 2. Ingest Skills
    if SKILL_DIR.exists():
        for md_file in SKILL_DIR.rglob("*.md"):
            with open(md_file, 'r', encoding='utf-8') as f:
                kb["documents"].append({
                    "id": md_file.stem,
                    "category": md_file.parent.name,
                    "type": "skill",
                    "content": f.read()
                })

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(kb, f, indent=2, ensure_ascii=False)
    print(f"✅ Agent Knowledge Base built: {len(kb['documents'])} documents -> {OUTPUT_FILE}")

if __name__ == "__main__":
    build_kb()
