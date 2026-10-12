import { stars } from './catalog';

export type SkyRegionId = 'spring' | 'summer' | 'autumn' | 'winter';
export interface SkyRegion {
  id: SkyRegionId; name: string; english: string; note: string;
  ra: number; dec: number; fov: number; color: string; count: number;
}

// Four adjoining six-hour RA sectors cover the complete catalog. These are
// browsing regions inspired by the seasons, not live observing directions.
export function regionAt(ra: number): SkyRegionId {
  return (['autumn', 'winter', 'spring', 'summer'] as const)[Math.floor((((ra + 3) % 24 + 24) % 24) / 6)];
}

export const skyRegions: SkyRegion[] = [
  { id: 'spring', name: '春 · 初生', english: 'SPRING', note: '狮子 · 室女', ra: 12, dec: 18, fov: 66, color: '#bcd6b7', count: 0 },
  { id: 'summer', name: '夏 · 流萤', english: 'SUMMER', note: '天琴 · 天鹰', ra: 18.6, dec: 26, fov: 66, color: '#e2c99f', count: 0 },
  { id: 'autumn', name: '秋 · 星语', english: 'AUTUMN', note: '仙女 · 飞马', ra: .8, dec: 25, fov: 66, color: '#cbbbdc', count: 0 },
  { id: 'winter', name: '冬 · 长明', english: 'WINTER', note: '猎户 · 金牛', ra: 5.65, dec: 10, fov: 66, color: '#b9d6ed', count: 0 },
];
for (const star of stars) skyRegions.find(region => region.id === regionAt(star.ra))!.count++;
