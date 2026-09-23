# Issue #8: インポート提出単位の状態と再送

2026-09-23 に Cloud Run → Firebase Functions → Hosting の順で本番反映済み。Cloud Run は `processfiletask-00027-bgh`、Functions は `importClassroomSubmissions` / `getImportStatus` を更新し、Hosting live version は `0df2374b97bcdba8`。ユーザーが本番インポートを確認し、Issue #8 は Close 済み。Task再送・部分失敗・強制終了の全条件を本番で検証済みとは扱わない。既存データの一括移行は行っていない。デプロイ前に取り残された旧 job `hidAqbU2RYqqFoElrYJV` のみ運用上 `error` へ終端した。現在の未対応課題は[PLAN](../../PLAN.md)を参照。

新規 `importJobs/{jobId}` は `totalSubmissions`、`completedSubmissions`、`succeededSubmissions`、`failedSubmissions`、`failedFileCount` を持つ。`initializationComplete` になるまでは、全提出が終端してもジョブを完了にしない。`errorFiles` は旧ジョブとの互換用であり、新規ジョブの完了判定へ加算しない。既存ジョブは旧フィールドで表示する。

学生キーは正規化email、Classroom userId、submission IDの順で選ぶ。すべて欠ける場合は初期化エラーにする。`submissions/{sha256(key)}` に `queued → processing → succeeded / failed` を記録し、初期化時に `artworkId` を確定する。既存の `not_submitted` / `error` 作品はIDを再利用し、既存 `submitted` 作品はスキップする。提出レコードには失敗コードと失敗ファイル数も残す。1枚以上の画像ができれば `succeeded`、0枚なら `failed` とする。

Cloud Task IDはjob IDと学生キーのSHA-256から決める。Cloud Tasks APIの明示名は同一名の実行済みTaskにも `ALREADY_EXISTS` を返し得て、再利用可能になるまで最大24時間（旧queue方式では9日）かかる。ここでは `ALREADY_EXISTS` を既投入として扱い、その他の投入失敗だけを提出 `failed` にする。参照: [Google Cloud Tasks task create API](https://docs.cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues.tasks/create)。

処理開始時に提出レコードをclaimし、終端済みならno-op、並走中なら再試行可能な503を返す。作品保存、ギャラリー件数、提出終端、ジョブ集計は同一Firestore transactionで更新する。後段transaction失敗時は今回生成した画像・thumbnailだけを補償削除し、提出をfailedへ終端する。終端更新自体が失敗した場合はclaimを解放して503を返す。既存画像は補償削除対象に含めない。

制約: プロセスの強制終了時にはメモリ内の生成pathを使う補償処理は実行されない。claimのlease期限は35分で、期限後の再処理が可能だが、queue側の再試行上限・間隔に依存する。運用で停止ジョブと孤立objectを監視する。本番反映前に Cloud Build のコンテナ smoke test は成功し、その後ユーザーが本番インポートを確認した。Task再送・強制終了・タイムアウト動作の実地検証は確認していない。入口の504対策、既存ジョブ/作品の一括移行、参照されない26 objectの削除は対象外。
