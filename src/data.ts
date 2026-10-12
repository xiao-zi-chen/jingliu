import type { Memory, MemoryTheme } from './types';
export { stars, starMap, constellations } from './catalog';

export const themes: { id: MemoryTheme; label: string }[] = [
  { id:'sunrise', label:'日出' }, { id:'campus', label:'校园' }, { id:'love', label:'心动' },
  { id:'ocean', label:'山海' }, { id:'forest', label:'旷野' }, { id:'night', label:'星夜' },
];

export const demoMemories: Memory[] = [
  { id:'demo-18', title:'十八岁，风是自由的', date:'2022-06-18', category:'成长', content:'吹灭蜡烛的那一刻，好像真的听见了世界向我打开的声音。\n\n那时的愿望很简单：去远方，见想见的人，成为自己喜欢的大人。\n\n写给以后的自己：别忘记今天眼睛里的光。', theme:'sunrise', tag:'18岁', starId:'aldebaran', createdAt:'2022-06-18T12:00:00Z' },
  { id:'demo-campus', title:'故事，从这里开始', date:'2022-09-01', category:'成长', content:'拖着行李箱走进校园，树荫把阳光剪得细碎。\n\n第一次离家这么远，第一次拥有自己的小小世界。新室友说了一声“你好”，陌生的城市忽然就温柔起来。', theme:'campus', tag:'刚上大学', starId:'betelgeuse', createdAt:'2022-09-01T12:00:00Z' },
  { id:'demo-love', title:'原来，你也在这里', date:'2023-05-20', category:'心动', content:'那天一起走了很长的路，聊了很多无关紧要的话。\n\n可我记得风的温度，记得你笑起来的样子，记得回家的路第一次变得那么短。\n\n很高兴，在这么大的世界里遇见你。', theme:'love', tag:'进入恋爱', starId:'pollux', createdAt:'2023-05-20T12:00:00Z' },
  { id:'demo-ocean', title:'把心事，交给海风', date:'2024-08-16', category:'旅行', content:'终于看到念了很久的海。没有安排，没有目的，只是在岸边坐了一整个下午。\n\n原来有些答案，不用想，风吹着吹着就知道了。', theme:'ocean', tag:'去看海', starId:'sirius', createdAt:'2024-08-16T12:00:00Z' },
];

export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

export function memoryTags(memory: Memory) {
  const originalTags: Record<string,string> = {'demo-18':'18岁','demo-campus':'刚上大学','demo-love':'进入恋爱','demo-ocean':'去看海'};
  return [memory.tag || originalTags[memory.id] || memory.category, memory.category];
}
