import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GuidebookPage {
  pageNumber: number;
  headings: { text: string; level: number }[];
  paragraphs: string[];
}

interface Guidebook {
  filename: string;
  pageCount: number;
  pages: GuidebookPage[];
  schoolLevel?: string;
}

const GUIDEBOOK_DIR = path.resolve(__dirname, '..', '..', 'guidebook');
const SCHOOL_LEVEL_MAP: Record<string, string> = {
  'HHK': 'KB & TK Happy Holy Kids',
  'SD': 'SD',
  'SMP-SMA': 'SMP-SMA',
};

/**
 * Extract school level from filename.
 */
function detectSchoolLevel(filename: string): string {
  for (const key of Object.keys(SCHOOL_LEVEL_MAP)) {
    if (filename.includes(key)) return key;
  }
  return 'UNKNOWN';
}

/**
 * Load all guidebooks from the guidebook directory.
 */
export function loadAllGuidebooks(): Guidebook[] {
  if (!fs.existsSync(GUIDEBOOK_DIR)) {
    return [];
  }

  const files = fs.readdirSync(GUIDEBOOK_DIR).filter(f => f.endsWith('.json'));
  return files.flatMap(file => {
    try {
      const raw = fs.readFileSync(path.join(GUIDEBOOK_DIR, file), 'utf-8');
      const data = JSON.parse(raw) as Guidebook;
      if (!data.pages || !Array.isArray(data.pages)) {
        console.warn(`[guidebook] No pages array in ${file}`);
        return [];
      }
      const nameToDetect = data.filename || file;
      data.schoolLevel = detectSchoolLevel(nameToDetect);
      return [data];
    } catch (e) {
      console.error(`[guidebook] Failed to load ${file}:`, e);
      return [];
    }
  });
}

/**
 * Group guidebook pages by main category (6.1, 6.2, 6.3, 6.4).
 */
export function extractViolationCategories(guidebook: Guidebook) {
  const categoryMap: Record<string, { title: string; pages: GuidebookPage[] }> = {};

  let currentCategory = 'other';
  let currentTitle = 'Informasi Umum';

  for (const page of guidebook.pages) {
    for (const heading of page.headings) {
      const match = heading.text.match(/6\.([1-4])\.?\s*(PELANGGARAN\s*(RINGAN|SEDANG|BERAT|SANGAT BERAT))/i);
      if (match) {
        currentCategory = `category_${match[1]}`;
        currentTitle = heading.text.trim();
      }
    }

    if (!categoryMap[currentCategory]) {
      categoryMap[currentCategory] = { title: currentTitle, pages: [] };
    }
    categoryMap[currentCategory]!.pages.push(page);
  }

  return categoryMap;
}
