const fs = require('fs');
const code = fs.readFileSync('c:\\Users\\PC\\Desktop\\projeler\\uTube\\frontend\\src\\components\\Sidebar.jsx', 'utf8');
const lines = code.split('\n');

let openTags = [];
let openBraces = 0;
let openParens = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Simple checks for tags and braces (this is naive but helpful for debugging)
    const openTagMatches = line.match(/<(div|motion\.aside|AnimatePresence|Link|EmptyState|SignInPlaceholder|SectionHeader)[^>]*?[^\/]*?>/g);
    if (openTagMatches) {
        openTagMatches.forEach(tag => {
            if (!tag.endsWith('/>')) {
                const tagName = tag.match(/<([A-Za-z0-9.]+)/)[1];
                openTags.push({ tag: tagName, line: i + 1 });
            }
        });
    }

    const closeTagMatches = line.match(/<\/(div|motion\.aside|AnimatePresence|Link|EmptyState|SignInPlaceholder|SectionHeader)>/g);
    if (closeTagMatches) {
        closeTagMatches.forEach(tag => {
            const tagName = tag.match(/<\/([A-Za-z0-9.]+)/)[1];
            if (openTags.length > 0 && openTags[openTags.length - 1].tag === tagName) {
                openTags.pop();
            } else {
                console.log(`Mismatch on line ${i + 1}: expected </${openTags.length ? openTags[openTags.length - 1].tag : 'START'}> but got </${tagName}>`);
            }
        });
    }

    openBraces += (line.match(/\{/g) || []).length;
    openBraces -= (line.match(/\}/g) || []).length;

    openParens += (line.match(/\(/g) || []).length;
    openParens -= (line.match(/\)/g) || []).length;
}

console.log("Unclosed Tags at EOF:", openTags);
console.log("Unclosed Braces at EOF:", openBraces);
console.log("Unclosed Parens at EOF:", openParens);
