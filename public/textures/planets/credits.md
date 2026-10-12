# 镜留三维天体：素材来源与模拟说明

这些资源随应用离线提供。三维球体、光照、视角与星环投影是本项目的渲染；不代表实时天象、当前云层或相互之间的真实比例。月球是天然卫星，另外八个对象是太阳系行星。

## 公开地图

- **地球地表**：NASA Earth Observatory，Blue Marble，陆地、海洋与冰盖观测合成图。原图：<https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png>。保留 2048×1024 像素，转换为 WebP。来源页：<https://visibleearth.nasa.gov/images/57730/the-blue-marble-land-surface-ocean-color-and-sea-ice>。
- **地球云层**：NASA Earth Observatory，Blue Marble 云层合成图。原图：<https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg>。将灰度用作白色云层的透明度，保留 2048×1024 像素；不是当日天气。
- **月球颜色与高程**：NASA / GSFC / Arizona State University，LRO / LOLA；NASA SVS CGI Moon Kit：<https://svs.gsfc.nasa.gov/4720/>。颜色原图：<https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg>；高程原图：<https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg>。高程缩为 1024×512，以保留移动设备内存；用于细微凹凸着色，不改变球体的实际几何结构。
- **木星、火星、土星**：NASA 3D Resources 的 Images and Textures 目录：<https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures>。分别采用 `Jupiter/Jupiter.jpg`、`Mars/Mars.jpg`、`Saturn/Saturn.jpg`，转换为 WebP。木星饱和度调至原图的 60%，土星调至 28%，用于统一画面。它们是公开的可视化素材，不能据此推断拍摄日期或当前地貌、云层状态。

## 自行绘制的模拟内容

- 海王星、天王星、金星云顶、水星地貌由 `scripts/prepare-planets.py` 使用固定种子的球面噪声和撞击坑模型绘制。纹理在经度方向接合；具体云带、风暴与撞击坑位置属于模拟。
- 土星环根据径向密度绘制，包含细环纹与明显暗隙；并非观测扫描。大气边缘、光源方向、转速与自转按钮均为观赏设计。
- 缩略图和不支持 WebGL 时的静态预览由程序生成。地球缩略图不含独立云层。运行中地图加载失败时会使用简化模拟纹理，并在界面注明。
- 原始照片仅用于审阅素材，没有把正面照片直接当作完整的球面地图。

## 生成与依赖

已经生成的 WebP 是正式应用资源，构建和离线使用不需要下载。重新生成素材需要 Python、Pillow、NumPy 和网络：`python scripts/prepare-planets.py`。

Three.js 负责 WebGL 三维渲染，遵循 MIT License；许可全文随应用附带于 `/licenses/three-LICENSE.txt`。来源：<https://github.com/mrdoob/three.js>。