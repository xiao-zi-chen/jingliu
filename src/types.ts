export type Page = 'sky' | 'shelf' | 'profile';
export type MemoryTheme = 'sunrise' | 'campus' | 'love' | 'ocean' | 'forest' | 'night';
export type MemoryCategory = '成长' | '生活' | '心动' | '旅行';

export interface Memory {
  id: string;
  title: string;
  date: string;
  category: MemoryCategory;
  tag: string;
  content: string;
  theme: MemoryTheme;
  starId: string;
  createdAt: string;
  photo?: string;
}

export type MemoryDraft = Omit<Memory, 'id' | 'createdAt'>;
export interface User { id: string; email: string; name: string; createdAt: string }

export interface Star {
  id: string;
  name: string;
  english: string;
  constellation: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
  distance: string;
  description: string;
  constellationId?: string;
  hip?: number; hd?: number; hr?: number; spectral?: string; distanceLY?: number | null; aliases?: string[];
}
