export interface Planet {
  id: string;
  name: string;
  english: string;
  subtitle: string;
  description: string;
  kind: string;
  detail: string;
  color: string;
  tilt: number;
  atmosphere?: string;
  rings?: boolean;
  observed?: boolean;
  credit: string;
}

// Close-up studies, separate from the J2000 catalog and from live ephemerides.
export const planets: Planet[] = [
  {id:'saturn', name:'土星', english:'SATURN', subtitle:'把光，绕成一枚戒指。', description:'细碎的冰粒绕着星球，铺开一圈又一圈的光。转动它，看看星环投在云层上的影子。', kind:'气态巨行星', detail:'冰粒组成的星环', color:'#d8c29b', tilt:27, rings:true, observed:true, credit:'NASA 3D Resources 公开云带地图，降低了饱和度。星环为程序绘制，光照与阴影为三维模拟。'},
  {id:'earth', name:'地球', english:'EARTH', subtitle:'所有想念，都在这颗蓝色里。', description:'越过白色云层，海洋、沙漠和大陆慢慢出现。我们所有平凡又珍贵的日子，都发生在这里。', kind:'类地行星', detail:'海洋、大陆与云层', color:'#91c8da', tilt:23.4, atmosphere:'#5aa4e0', observed:true, credit:'NASA Earth Observatory / Blue Marble：陆地、海洋、冰盖与云层观测合成地图。大气光晕与光照为模拟。'},
  {id:'jupiter', name:'木星', english:'JUPITER', subtitle:'让风暴，也有温柔的纹路。', description:'奶油色与赭色的云带缠绕着这颗巨行星。南半球的大红斑，像一枚留在风里的印记。', kind:'气态巨行星', detail:'云带与大红斑', color:'#d7b795', tilt:3.1, observed:true, credit:'NASA 3D Resources 公开木星地图，调整了饱和度；云带为历史地图，光照为三维模拟。'},
  {id:'moon', name:'月球', english:'MOON', subtitle:'借一束月光，看看时间的痕迹。', description:'靠近那些明暗交错的月海与撞击坑。没有云层遮挡，漫长岁月就这样留在表面。', kind:'地球的天然卫星', detail:'月海与撞击坑', color:'#cbd0d3', tilt:6.7, observed:true, credit:'NASA / GSFC / Arizona State University：LRO 月面颜色地图。阴影与光照为三维模拟。'},
  {id:'mars', name:'火星', english:'MARS', subtitle:'去红色的远方，留一场遐想。', description:'锈红的旷野、深色的地貌与浅色极冠，共同构成这颗安静的邻居。试着转向背光的一面。', kind:'类地行星', detail:'红色地貌与极冠', color:'#d5a085', tilt:25.2, observed:true, credit:'NASA 3D Resources 公开火星地图。三维球体与光照为模拟，画面不作精确地形测绘。'},
  {id:'neptune', name:'海王星', english:'NEPTUNE', subtitle:'在很远的地方，海蓝色依然发光。', description:'淡蓝的云层之下，是一个寒冷遥远的世界。这里用轻柔的云带，想象它大气流动的样子。', kind:'冰巨行星', detail:'蓝色大气与云带', color:'#9bbcd8', tilt:28.3, atmosphere:'#658ebc', credit:'依据海王星的蓝色大气特征绘制；云带、颜色变化与光照为模拟，不代表某次观测。'},
  {id:'uranus', name:'天王星', english:'URANUS', subtitle:'侧过身，做一个青色的梦。', description:'柔和的青蓝色包裹着这颗星球。它的自转轴倾斜得格外明显，像是侧卧在自己的旅途中。', kind:'冰巨行星', detail:'倾斜的自转轴', color:'#b4d5d7', tilt:97.8, atmosphere:'#92c7ce', credit:'依据天王星的青蓝色大气特征绘制；云层与光照为模拟。'},
  {id:'venus', name:'金星', english:'VENUS', subtitle:'云层深处，藏着一个世界。', description:'厚厚的云层遮住了金星的地表。眼前柔和的浅黄色，是为这层朦胧面纱绘制的三维想象。', kind:'类地行星', detail:'厚重的大气与云层', color:'#e4d2ac', tilt:177.4, atmosphere:'#dbbf8b', credit:'展示模拟的金星云顶，并非雷达地形或真实表面照片。'},
  {id:'mercury', name:'水星', english:'MERCURY', subtitle:'把漫长的故事，写进陨坑。', description:'灰褐色的岩石与密集撞击坑，记录着古老的面容。转动星球，让侧光掠过它的表面。', kind:'类地行星', detail:'岩石表面与撞击坑', color:'#c3b5a5', tilt:0.03, credit:'参考 NASA 水星影像的地貌特征；撞击坑位置与表面颜色为程序绘制，不作测绘用途。'},
];

export const planetTexture = (id: string) => `/textures/planets/${id}.webp`;