# インポート障害分析（2026-02-08）

## 概要
- 対象: 本番 `importClassroomSubmissions`
- 事象: 一部授業の課題インポートで `Failed to fetch` / `CORS` 表示
- 結論: 主因は CORS ではなく、HTTP 関数の 540 秒タイムアウトによる `504 Gateway Timeout`

## 発生日時（JST）
- 2026-02-08 21:15 頃: 失敗（504）
- 2026-02-08 21:32 頃: 失敗（504）
- 2026-02-08 21:00 頃: 成功（200, 421.99 秒）

## ユーザー側で見えた症状
- ブラウザコンソール:
  - `No 'Access-Control-Allow-Origin' header is present...`
  - `POST .../importClassroomSubmissions net::ERR_FAILED 504 (Gateway Timeout)`
  - `TypeError: Failed to fetch`

## 事実確認（ログ）
### Cloud Run request log
- `POST /importClassroomSubmissions` が以下で終了:
  - `status=504`, `latency=540.000184164s`
  - `status=504`, `latency=540.000368578s`
  - `status=200`, `latency=421.993558549s`
- `OPTIONS` はすべて `204`（成功）

### Functions 側設定
- `timeoutSeconds: 540`（9分）
  - `functions/src/index.ts:37`
- `cors: true` + 明示ヘッダ設定あり
  - `functions/src/index.ts:39`
  - `functions/src/index.ts:43`

## 技術的原因
`importClassroomSubmissions` は「ジョブ登録のみ」ではなく、レスポンス返却前に重い初期処理を同期実行している。

重い処理の例:
- 提出一覧取得: `functions/src/importController.ts:164`
- 提出ループ処理: `functions/src/importController.ts:203`
- 学生プロフィール取得（提出ごと）: `functions/src/importController.ts:227`
- Drive 本体ダウンロード（添付ごと）: `functions/src/importController.ts:299`
- Storage 一時保存: `functions/src/importController.ts:308`

補足:
- 提出オブジェクト全文を大量ログ出力しており、処理時間とログ量を増加させる要因になっている。
  - `functions/src/importController.ts:205`
  - `functions/src/importController.ts:206`

## なぜ CORS エラーに見えるか
- 実際はサーバーが 540 秒で 504 を返却（またはゲートウェイで打ち切り）している。
- この種の失敗レスポンスは CORS ヘッダが付かず、ブラウザ上は CORS エラーとして表示される。
- したがって CORS は主因ではなく、タイムアウトが主因。

## 影響範囲
- 提出数・添付数・ファイルサイズが大きい課題ほど失敗しやすい。
- 同じ機能でも軽い課題は成功し、重い課題のみ失敗する。

## 対応方針（まだ未実施）
### 暫定対策
- `timeoutSeconds` 延長
- メモリ/CPU 増強

期待効果:
- 当面の 504 は減る可能性が高い

制約:
- データ量がさらに増えると再発する

### 根本対策
- `importClassroomSubmissions` は「ジョブ起票のみ」を返す
- 重い処理（提出走査・Drive ダウンロード・一時保存）はバックグラウンドに移譲
- 進捗は `importJobs` をポーリング/購読して表示

期待効果:
- 入口 API の 504 を構造的に回避
- 大規模課題でもフロントの待ち時間と失敗率を低減

## 未実施タスク
- 失敗リクエストごとのログを `importJobId` 単位で紐付け可能にする
- 初期化フェーズの処理時間内訳（提出取得/プロフィール取得/Drive取得/Storage保存）を計測ログ化
- 大量ログ（submission 全文）をサマリログへ縮小

