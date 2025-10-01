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

# 依存関係をインストール（本番環境用）
RUN npm ci --omit=dev

# ビルド済みのコードをコピー
COPY lib/ ./lib/
