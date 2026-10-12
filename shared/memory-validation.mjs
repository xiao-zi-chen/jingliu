export function validPhoto(photo){
  if(photo===undefined||photo===null||photo==='')return true;
  return typeof photo==='string'&&photo.length<=1000000&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photo);
}
export function parseMemoryDraft(body,isValidStar){
  if(!body||typeof body!=='object')return null;
  const {title,date,category,content,theme,starId,tag,photo}=body;
  if(typeof title!=='string'||!title.trim()||title.trim().length>40||typeof content!=='string'||!content.trim()||content.trim().length>5000)return null;
  if(tag!==undefined&&(typeof tag!=='string'||tag.trim().length>16))return null;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const parsed=new Date(date+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date<'1900-01-01'||date>new Date(Date.now()+14*3600000).toISOString().slice(0,10))return null;
  if(!['成长','生活','心动','旅行'].includes(category)||!['sunrise','campus','love','ocean','forest','night'].includes(theme)||typeof starId!=='string'||!isValidStar(starId)||!validPhoto(photo))return null;
  return {title:title.trim(),date,category,tag:tag?.trim()||category,content:content.trim(),theme,starId,...(photo?{photo}:{})};
}
export function memoryFingerprint(memory){return JSON.stringify([memory.title,memory.date,memory.content,memory.starId,memory.category,memory.tag||memory.category,memory.theme,memory.photo||'']);}
