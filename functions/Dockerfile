# Node.js 22 Debian bookwormベースイメージを使用
FROM node:22-bookworm-slim

# GraphicsMagickとGhostscriptをインストール（PDF処理に必要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    graphicsmagick \
    ghostscript \
    libwebp-dev \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# gmコマンドのパスを環境変数で明示的に指定
ENV GM_COMMAND="/usr/bin/gm"

# 作業ディレクトリを設定
WORKDIR /workspace

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール（本番環境用のみ）
RUN npm ci --omit=dev

# ビルド済みのコードをコピー（Cloud Run用のファイルのみ）
COPY lib/cloudrun.js ./lib/
COPY lib/cloudrun.js.map ./lib/
COPY lib/processFileTaskHttp.js ./lib/
COPY lib/processFileTaskHttp.js.map ./lib/
COPY lib/fileProcessor.js ./lib/
COPY lib/fileProcessor.js.map ./lib/
COPY lib/importController.js ./lib/
COPY lib/importController.js.map ./lib/
COPY lib/httpSecurity.js ./lib/
COPY lib/httpSecurity.js.map ./lib/

# ネイティブ依存、画像・PDF変換、Cloud Runエントリーポイントをビルド時に検証
COPY test/containerSmoke.js ./test/
RUN npm run smoke:container

# Cloud Run用の環境変数を設定
ENV PORT=8080
ENV FUNCTION_TARGET=processFileTask

# Cloud Runでコンテナを起動（Cloud Tasks用のHTTPリクエストを処理）
# cloudrun.tsをエントリーポイントとして使用
CMD ["node", "node_modules/@google-cloud/functions-framework/build/src/main.js", "--target=processFileTask", "--signature-type=http", "--source=lib/cloudrun.js", "--port=8080"]
