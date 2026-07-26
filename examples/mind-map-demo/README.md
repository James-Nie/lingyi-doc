# mind-map Offline Demo

验证 Open Core 首发包可在无账号、无商业依赖下运行。

```bash
# 在仓库根目录
npm install
npm -w @lingyi-doc/core-mindmap run build
npm -w @lingyi-doc/mind-map run build
npm -w @lingyi-doc/mind-map-react run build

cd examples/mind-map-demo
npm install
npm run dev
```

打开 http://localhost:5179 。
