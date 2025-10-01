# Node.js 18 Debian bullseyeベースイメージを使用
FROM node:18-bullseye-slim

# GraphicsMagickとGhostscriptをインストール（PDF処理に必要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    graphicsmagick \
    ghostscript \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを設定
WORKDIR /workspace

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール（本番環境用のみ）
RUN npm ci --omit=dev

# ビルド済みのコードをコピー
COPY lib/ ./lib/

# Cloud Run用の環境変数を設定
ENV PORT=8080
ENV FUNCTION_TARGET=processFileTask

# Cloud Runでコンテナを起動（Cloud Tasks用のHTTPリクエストを処理）
# cloudrun.tsをエントリーポイントとして使用
CMD ["npx", "@google-cloud/functions-framework", "--target=processFileTask", "--signature-type=http", "--source=lib/cloudrun.js"]
