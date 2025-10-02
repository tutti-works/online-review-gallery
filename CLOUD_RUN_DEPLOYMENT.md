# Cloud Run デプロイメントガイド（PDF処理用）

このガイドでは、GraphicsMagickを使用したPDF処理機能を持つ`processFileTask`をCloud Runにデプロイする手順を説明します。

## 前提条件

- Google Cloud SDK（`gcloud` CLI）がインストール済み
- プロジェクトへの適切な権限（Cloud Run Admin, Service Account User）
- Node.js 18以上

## なぜCloud Runを使うのか？

Firebase Cloud Functions Gen2では、カスタムDockerfileを使用したシステムパッケージ（GraphicsMagick）のインストールがサポートされていません。そのため、PDF処理機能のみをCloud Runにデプロイし、他の関数はFirebase Functionsのままにします。

## デプロイ手順

**重要:** Cloud BuildとCloud Runへのデプロイは、現在のところ手動で実行する必要があります。自動化スクリプトは使用しないでください。

### ステップ1: TypeScriptをビルド

```bash
cd functions
npm run build
```

### ステップ2: Dockerイメージをビルド（Cloud Build使用）

**functionsディレクトリから実行してください：**

```bash
cd functions
gcloud builds submit --tag gcr.io/online-review-gallery/processfiletask --project=online-review-gallery
```

このコマンドは：
- Dockerfileを使ってイメージをビルド
- GraphicsMagickとGhostscriptをインストール
- Google Container Registryにプッシュ

### ステップ3: Cloud Runにデプロイ

**1行コマンド（改行なし）で実行してください：**

```bash
gcloud run deploy processfiletask --image gcr.io/online-review-gallery/processfiletask --project=online-review-gallery --region=asia-northeast1 --platform=managed --no-allow-unauthenticated --memory=2Gi --timeout=1800 --min-instances=0 --max-instances=20 --cpu=1 --service-account=816131605069-compute@developer.gserviceaccount.com --set-env-vars=FUNCTION_TARGET=processFileTask,GCLOUD_PROJECT=online-review-gallery
```

**注意:** PowerShellやBashの改行記号（`` ` ``や`\`）は使用せず、すべて1行で実行してください。

### ステップ3: Cloud Run URLを取得

デプロイ完了後、サービスURLを取得します：

```bash
gcloud run services describe processfiletask \
  --region=asia-northeast1 \
  --format='value(status.url)'
```

出力例：`https://processfiletask-xxxxxxxxxxxx-an.a.run.app`

### ステップ4: 他のFunctions関数の環境変数を設定

`importClassroomSubmissions`関数に、Cloud Run URLを環境変数として設定します。

Firebase Consoleで設定する場合：
1. Firebase Console > Functions
2. `importClassroomSubmissions`を選択
3. 環境変数タブ
4. `PROCESS_FILE_TASK_URL` = `https://processfiletask-xxxxxxxxxxxx-an.a.run.app`

または、`firebase.json`に追加：

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs18",
      "environmentVariables": {
        "PROCESS_FILE_TASK_URL": "https://processfiletask-xxxxxxxxxxxx-an.a.run.app"
      }
    }
  ]
}
```

### ステップ5: 他の関数をデプロイ

```bash
firebase deploy --only functions
```

注意：`processFileTask`はCloud Runにあるため、Firebase Functionsからは削除する必要があります。

## アーキテクチャ

```
Google Classroom
    ↓
importClassroomSubmissions (Firebase Functions)
    ↓
Cloud Tasks Queue
    ↓
processFileTask (Cloud Run with Docker + GraphicsMagick)
    ↓
Firebase Storage + Firestore
```

## トラブルシューティング

### エラー: "Permission denied"

Cloud Tasksが Cloud Runを呼び出す権限がない場合：

```bash
gcloud run services add-iam-policy-binding processfiletask \
  --region=asia-northeast1 \
  --member=serviceAccount:816131605069-compute@developer.gserviceaccount.com \
  --role=roles/run.invoker
```

### エラー: "GraphicsMagick not found"

Dockerfileが正しくビルドされていない可能性があります。ログを確認：

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=processfiletask" \
  --limit=50 \
  --format=json
```

### 既存のCloud Functionsを削除

Cloud Runに移行後、古い`processFileTask`関数を削除：

```bash
gcloud functions delete processFileTask \
  --gen2 \
  --region=asia-northeast1
```

## ローカルテスト

Cloud Runサービスをローカルでテストする場合：

```bash
cd functions
npm run build

# Dockerイメージをビルド
docker build -t processfiletask .

# コンテナを起動
docker run -p 8080:8080 \
  -e FUNCTION_TARGET=processFileTask \
  -e FIREBASE_CONFIG='{"projectId":"online-review-gallery","storageBucket":"online-review-gallery.firebasestorage.app"}' \
  processfiletask

# テストリクエストを送信
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"data":{"importJobId":"test","fileName":"test.pdf",...}}'
```

## コスト

- Cloud Run: リクエスト数 + 実行時間に応じた課金
- 最小インスタンス0で設定しているため、アイドル時の課金なし
- PDF処理1件あたり: 約0.001〜0.01円（ファイルサイズによる）

## 参考リンク

- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [Functions Framework](https://github.com/GoogleCloudPlatform/functions-framework-nodejs)
- [GraphicsMagick](http://www.graphicsmagick.org/)
