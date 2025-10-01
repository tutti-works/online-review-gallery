# Dockerを使用したCloud Functionsデプロイ手順

このプロジェクトでは、PDF処理にGraphicsMagickが必要なため、Dockerfileを使用してCloud Functionsをデプロイします。

## 前提条件

- Firebase CLIがインストールされていること
- Dockerがインストールされていること（ローカルでテストする場合）
- Google Cloud Projectが作成され、課金が有効化されていること

## デプロイ手順

### 1. TypeScriptをビルド

```bash
cd functions
npm run build
```

### 2. Cloud Functionsをデプロイ

Dockerfileがある場合、Firebase CLIは自動的にそれを検出して使用します。

```bash
# functionsディレクトリから
firebase deploy --only functions
```

または、プロジェクトルートから：

```bash
npm run deploy
```

**注意**: 初回デプロイ時は、Dockerイメージのビルドに5〜10分かかる場合があります。

### 3. デプロイの確認

デプロイが成功すると、以下のようなURLが表示されます：

```
✔  functions[asia-northeast1-importClassroomSubmissions] https://asia-northeast1-online-review-gallery.cloudfunctions.net/importClassroomSubmissions
✔  functions[asia-northeast1-processFileTask] deployed
✔  functions[asia-northeast1-getImportStatus] https://asia-northeast1-online-review-gallery.cloudfunctions.net/getImportStatus
```

### 4. 環境変数の設定

本番環境用の環境変数を設定します：

```bash
# .env.productionまたは.envに追加
NEXT_PUBLIC_FUNCTIONS_BASE_URL=https://asia-northeast1-online-review-gallery.cloudfunctions.net
```

### 5. Next.jsアプリをビルド＆デプロイ

```bash
# プロジェクトルートで
npm run build
firebase deploy --only hosting
```

## Dockerfileの内容

`functions/Dockerfile`には以下が含まれています：

- **Node.js 18**: Cloud Functions Gen2の推奨バージョン
- **GraphicsMagick**: PDF→画像変換に必要
- **Ghostscript**: PDFレンダリングに必要

## トラブルシューティング

### デプロイが失敗する場合

1. **Docker Buildエラー**:
   ```bash
   # ローカルでDockerイメージをテストビルド
   cd functions
   docker build -t test-functions .
   ```

2. **権限エラー**:
   ```bash
   # Firebase CLIで再ログイン
   firebase login --reauth
   ```

3. **メモリ不足エラー**:
   - `functions/src/index.ts`の各関数定義で`memory`を増やす（例：`2GiB`→`4GiB`）

### PDFが処理されない場合

1. **ログを確認**:
   ```bash
   firebase functions:log --only processFileTask
   ```

2. **GraphicsMagickの確認**:
   本番環境のログに`gm "identify"`エラーがないか確認

## 開発環境での注意

- **エミュレーターではPDF処理はスキップされます**
- 画像ファイル（JPG、PNG）でのみテスト可能
- PDF処理のテストは本番環境でのみ可能

## コスト

Dockerベースのデプロイは、標準的なCloud Functionsと同じ料金体系です。

- 無料枠: 月2百万回の呼び出し、400,000 GB-秒、200,000 GHz-秒
- 本プロジェクトの想定使用量（70人/週）は無料枠内に収まります

詳細は`docs/FREE_TIER_ANALYSIS.md`を参照してください。
