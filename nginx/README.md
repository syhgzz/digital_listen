# nginx 部署说明

配置文件：`nginx/digital-listen.conf`，监听端口 **53002**，静态托管 `dist/`（Vite 构建产物，
已包含 `assets/` 与 `public/tts/` 复制过来的语音资源）。

## 一键部署（推荐）

仓库根目录的 `deploy.sh` 把「准备语音资源 → 构建 → 发布 → 装 nginx 配置 → 校验并重载」
串成一步（幂等，可重复执行）：

```bash
cd /srv/digital_listen
./deploy.sh
```

> 不要加 `sudo`：脚本会对需要 root 的步骤（写 `/var/www`、装 nginx 配置、reload）自动调用 sudo。
> 若 node 由 nvm 安装，加 sudo 会导致 `secure_path` 里找不到 node（报 `缺少命令：node`）；
> 确需 sudo 时用 `sudo env "PATH=$PATH" ./deploy.sh`。

常用参数：

```bash
./deploy.sh --skip-install      # 依赖没变时跳过 npm ci
./deploy.sh --skip-build        # 只发布已有 dist/
./deploy.sh --no-nginx          # 只同步文件，不动 nginx
./deploy.sh --pull              # 部署前 git pull --ff-only
./deploy.sh --web-root /srv/www/site --port 8080 --conf-dir /etc/nginx/conf.d
```

脚本行为：`rsync -a --delete --chmod=D755,F644 dist/ <web_root>/`；安装配置前先备份原文件，
`nginx -t` 失败会自动回滚并终止；配置中的 `root` / `listen` 会按 `--web-root` / `--port` 自动替换。

## 手动部署步骤

```bash
# 1. 服务器上准备代码与依赖
cd /srv/digital_listen
npm ci

# 2. 准备语音资源（约 60MB，只需一次；HF 不通时脚本会自动走 hf-mirror）
npm run tts:setup

# 3. 构建
npm run build

# 4. 发布静态文件
sudo mkdir -p /var/www/digital_listen_dsh41f
sudo rsync -a --delete dist/ /var/www/digital_listen_dsh41f/

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
| `root` | `/var/www/digital_listen_dsh41f`（构建产物内容直接放在这里，不再套一层 `dist/`） |
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
