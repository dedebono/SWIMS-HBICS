'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Book, ChevronDown, ChevronRight, Search, BookOpen } from 'lucide-react';

interface GuidebookPage {
  pageNumber: number;
  headings: { text: string; level: number }[];
  paragraphs: string[];
}

interface CategorySection {
  title: string;
  pages: GuidebookPage[];
}

interface GuidebookSchool {
  filename: string;
  schoolLevel: string;
  categories: Record<string, CategorySection>;
}

interface GuidebookData {
  filename: string;
  schoolLevel: string;
  categories: Record<string, CategorySection>;
}

const LEVEL_LABELS: Record<string, string> = {
  category_1: 'Ringan (Light)',
  category_2: 'Sedang (Medium)',
  category_3: 'Berat (Heavy)',
  category_4: 'Sangat Berat (Very Heavy)',
};

const LEVEL_COLORS: Record<string, string> = {
  category_1: 'border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800',
  category_2: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800',
  category_3: 'border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800',
  category_4: 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800',
};

export function GuidebookPanel() {
  const [data, setData] = useState<GuidebookData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchGuidebook = async () => {
      setIsLoading(true);
      const res = await apiClient<GuidebookData[]>('/guidebook');
      if (res.success && res.data) setData(res.data);
      setIsLoading(false);
    };
    fetchGuidebook();
  }, []);

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allText = useMemo(() => {
    const texts: string[] = [];
    for (const school of data) {
      for (const [catKey, cat] of Object.entries(school.categories)) {
        for (const page of cat.pages) {
          for (const p of page.paragraphs) texts.push(p);
          for (const h of page.headings) texts.push(h.text);
        }
      }
    }
    return texts;
  }, [data]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.map(school => {
      const filteredCats: Record<string, CategorySection> = {};
      for (const [catKey, cat] of Object.entries(school.categories)) {
        const matchingPages = cat.pages.filter(page =>
          page.paragraphs.some(p => p.toLowerCase().includes(q)) ||
          page.headings.some(h => h.text.toLowerCase().includes(q))
        );
        if (matchingPages.length > 0) {
          filteredCats[catKey] = { ...cat, pages: matchingPages };
        }
      }
      return { ...school, categories: filteredCats };
    }).filter(school => Object.keys(school.categories).length > 0);
  }, [data, search]);

  if (isLoading) {
    return (
      <Card className="glass border-border/50">
        <CardContent className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-3 text-sm text-muted-foreground">Loading guidebook...</span>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="glass border-border/50">
        <CardContent className="text-center py-8 text-sm text-muted-foreground">
          Guidebook data not available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Book className="w-4 h-4 text-primary" />
          Buku Pedoman Disiplin
        </CardTitle>
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-7 h-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {filteredData.map(school => (
          <div key={school.schoolLevel} className="rounded-lg border border-border/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSchool(expandedSchool === school.schoolLevel ? null : school.schoolLevel)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted/30 hover:bg-muted/60 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-500" />
                {school.filename.replace('02. Buku Pedoman - ', '').replace('-pdfjar', '')}
              </span>
              {expandedSchool === school.schoolLevel ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {expandedSchool === school.schoolLevel && (
              <div className="px-4 py-3 space-y-2">
                {Object.entries(school.categories).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No violation categories found.</p>
                ) : (
                  Object.entries(school.categories).map(([catKey, cat]) => (
                    <div key={catKey} className={`rounded-lg border ${LEVEL_COLORS[catKey] ?? 'border-border/50'}`}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(`${school.schoolLevel}-${catKey}`)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold"
                      >
                        <Badge variant="outline" className="text-[10px]">
                          {LEVEL_LABELS[catKey] || catKey}
                        </Badge>
                        {expandedCategories[`${school.schoolLevel}-${catKey}`] ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                      {expandedCategories[`${school.schoolLevel}-${catKey}`] && (
                        <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto">
                          {cat.pages.map(page => (
                            <div key={page.pageNumber} className="text-xs text-muted-foreground leading-relaxed">
                              {page.headings.filter(h => h.level >= 4).map((h, i) => (
                                <p key={i} className="font-medium text-foreground mt-1">{h.text}</p>
                              ))}
                              {page.paragraphs.map((p, i) => (
                                <p key={i} className="mt-0.5">{p}</p>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}

        {search && filteredData.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No results found for &quot;{search}&quot;
          </p>
        )}
      </CardContent>
    </Card>
  );
}
