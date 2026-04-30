import fs from 'fs';
import path from 'path';

const testDir = path.join(process.cwd(), 'src/api/__tests__');
const files = fs.readdirSync(testDir);

for (const file of files) {
  if (file.endsWith('.test.ts')) {
    const filePath = path.join(testDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Regular expression to match vi.mock('../../db/pool.js', ...) or vi.doMock('../../db/pool.js', ...)
    // It matches until the closing });
    const regex = /vi\.(?:do)?mock\(['"`]\.\.\/\.\.\/db\/pool\.js['"`],\s*\(\)\s*=>\s*(?:\{|(\(\{))[\s\S]*?(?:(?<=\})\s*\}\)|(?<=\})\s*\)\));?\n?/g;
    
    if (regex.test(content)) {
      content = content.replace(regex, '');
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`Fixed ${file}`);
    }
  }
}
console.log('Done cleaning up mock pool overrides.');
