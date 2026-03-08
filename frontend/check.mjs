import fs from 'fs';
import * as esbuild from 'esbuild';

const code = fs.readFileSync('src/components/Sidebar.jsx', 'utf8');

async function run() {
    try {
        await esbuild.transform(code, { loader: 'jsx' });
        console.log('Success!');
    } catch (e) {
        if (e.errors && e.errors.length > 0) {
            const loc = e.errors[0].location;
            console.log("Error at line:", loc.line, "col:", loc.column);
            const lines = code.split('\n');
            for (let i = Math.max(0, loc.line - 10); i < Math.min(lines.length, loc.line + 10); i++) {
                if (i === loc.line - 1) {
                    console.log(`> ${lines[i]}`);
                    console.log(`  ${' '.repeat(loc.column)}^`);
                } else {
                    console.log(`  ${lines[i]}`);
                }
            }
        }
    }
}
run();
