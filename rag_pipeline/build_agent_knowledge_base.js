const fs = require('fs');
const path = require('path');

const REFERENCES_DIR = path.join(__dirname, 'references');
const SKILLS_DIR = path.join(__dirname, 'skills');
const OUTPUT_FILE = path.join(__dirname, 'agent_knowledge_base.json');

function buildKnowledgeBase() {
    const kb = {
        metadata: {
            version: "1.0",
            domain: "Bangladesh Agriculture & Disaster Management",
            sources: ["BRRI", "DAE", "DMB", "FAO", "WMO"]
        },
        documents: []
    };

    function readFilesRecursively(dir) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                readFilesRecursively(filePath);
            } else if (file.endsWith('.md')) {
                const content = fs.readFileSync(filePath, 'utf8');
                const category = path.basename(dir);
                const id = path.basename(file, '.md');
                kb.documents.push({
                    id: id,
                    category: category,
                    title: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    content: content
                });
            }
        }
    }

    readFilesRecursively(REFERENCES_DIR);
    readFilesRecursively(SKILLS_DIR);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(kb, null, 2), 'utf8');
    console.log(`✅ Knowledge Base built: ${kb.documents.length} documents loaded.`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
}

buildKnowledgeBase();
