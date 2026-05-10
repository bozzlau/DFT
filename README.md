# Fourier Audio Lab

一个基于 Vite、React 和 TypeScript 构建的浏览器端傅里叶音频实验台。项目用于把声音和波形拆解成更直观的频率结构，适合做音频频谱观察、频段试听和基础傅里叶合成演示。

## 功能概览

- **音频输入**：支持上传本地音频文件，也可以通过浏览器麦克风录音。
- **频谱分析**：展示波形、平均频谱和时间-频率热力图。
- **频段拆分**：将音频按低频、低中频、中高频、高频拆分，并支持单独试听或调整音量。
- **波形合成**：通过多个正弦/余弦分量合成波形，观察叠加后的时域曲线和频率分布。
- **公式输入**：支持类似 `f(x) = 3sin(x) + 2sin(5x)` 的公式，用于快速生成自定义波形。

## 项目结构

```text
.
├── index.html          # Vite HTML 入口
├── package.json        # 项目脚本与依赖
├── vite.config.ts      # Vite 配置
├── tsconfig.json       # TypeScript 配置
├── src/
│   ├── main.tsx        # React 挂载入口
│   ├── App.tsx         # 音频分析实验台
│   ├── WaveDesk.tsx    # 波形合成实验台
│   ├── styles.css      # 全局样式
│   └── vite-env.d.ts   # Vite 类型声明
└── dist/               # 构建产物
```

## 本地运行

先安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

默认访问地址为：

```text
http://127.0.0.1:5173/
```

功能入口：

- **声音分析实验台**：`http://127.0.0.1:5173/`
- **波形合成实验台**：`http://127.0.0.1:5173/wave-desk`

## 构建与预览

生成生产构建：

```bash
npm run build
```

本地预览构建产物：

```bash
npm run preview
```

`npm run build` 会先执行 TypeScript 类型检查，再由 Vite 输出 `dist/`。

## 技术栈

- React 19
- TypeScript 5
- Vite 7
- Web Audio API
- Canvas 2D
- lucide-react 图标库

## 开发说明

- 主要业务逻辑集中在 `src/App.tsx` 和 `src/WaveDesk.tsx`。
- 样式集中维护在 `src/styles.css`，当前采用深色科技风界面。
- 目前没有配置独立测试框架，提交前至少运行 `npm run build`。
- 麦克风录音依赖浏览器权限，建议在本地开发服务或安全上下文中测试。
