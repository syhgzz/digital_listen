# nginx 部署说明

配置文件：`nginx/digital-listen.conf`，监听端口 **53002**，静态托管 `dist/`（Vite 构建产物，
已包含 `assets/` 与 `public/tts/` 复制过来的语音资源）。

## 部署步骤

```bash
# 1. 服务器上准备代码与依赖
cd /srv/digital_listen
npm ci

# 2. 准备语音资源（约 60MB，只需一次；HF 不通时脚本会自动走 hf-mirror）
npm run tts:setup

# 3. 构建
npm run build

# 4. 发布静态文件
sudo mkdir -p /var/www/digital_listen
sudo rsync -a --delete dist/ /var/www/digital_listen/dist/

# 5. 安装 nginx 配置
sudo cp nginx/digital-listen.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

访问 `http://<服务器地址>:53002/`。

> `public/tts/` 不入库，所以第 2 步不能省；否则页面会提示「本地语音资源尚未准备」，
> 并降级到系统语音。

如需放行防火墙：

```bash
sudo ufw allow 53002/tcp      # 或云厂商安全组放行 53002
```

## 配置要点

| 项 | 说明 |
| --- | --- |
| `root` | 默认 `/var/www/digital_listen/dist`，按实际部署路径修改 |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` | 让页面进入 `crossOriginIsolated`，ONNX Runtime 才能多线程推理；本应用资源全部同源，可安全启用。若以后引入跨域 CDN 资源需相应加 CORP 头，或删除这两行 |
| `/assets/` 缓存 | 文件名含内容哈希，`expires 1y` |
| `/tts/voices/*.onnx` 缓存 | 约 60MB，`expires 1y`；更换音色会换文件名（如 `en_US-lessac-medium.onnx`），如需替换同名声学模型请改名或清理浏览器缓存 |
| `/tts/voices/*.json`、`/tts/piper/` | `expires -1`（每次校验），保证升级依赖或换音色后不会加载旧文件 |
| `/tts/`、`/assets/` 用 `try_files $uri =404` | 语音资源缺失时返回 404，前端据此提示 `npm run tts:setup`；若回退 `index.html` 会把 HTML 当模型解析，报错难以排查 |
| gzip | 只压缩文本与 `application/wasm`（wasm 约 14MB → 3.6MB）；`.onnx`/`.data` 为二进制模型，不压缩以省 CPU |

## 校验

```bash
sudo nginx -t
curl -I http://127.0.0.1:53002/            # 200 + text/html
curl -I http://127.0.0.1:53002/tts/voices/manifest.json   # 200 + application/json
curl -I http://127.0.0.1:53002/tts/voices/not-exist.onnx  # 404（不能是 200）
```
