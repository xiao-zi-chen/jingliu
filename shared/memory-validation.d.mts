import type { MemoryDraft } from '../src/types';
export function validPhoto(photo:unknown):boolean;
export function parseMemoryDraft(body:unknown,isValidStar:(id:string)=>boolean):MemoryDraft|null;
export function memoryFingerprint(memory:MemoryDraft):string;