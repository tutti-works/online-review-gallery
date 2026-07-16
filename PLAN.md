# Online Review Gallery 改善計画

## 再評価後の結論

本リポジトリは、70人規模の大学講評会で運用中のMVPとして、機能面は十分に成立している。現時点でアプリは問題なく運用できているため、この計画の作成時点ではコード、設定、Security Rules、データ構造、CI、デプロイ構成を変更しない。

将来改善を実施する場合は、保守性や大規模化への備えよりも、次の順で現在の運用リスクを優先する。

1. HTTP APIの認証境界
2. Storage上の匿名アクセスと公開状態
3. インポート進捗の正確性
4. 学生識別と処理の冪等性
5. 上記を守る最小限の自動テスト

全面的なアーキテクチャ変更は行わず、認証、Storage、インポート、削除整合性の高リスク部分だけを段階的に改善する。

調査基準は`main`ブランチのコミット`132c65d`（2026年2月10日）である。

## 確定した問題一覧

| ID | 重要度 | 問題 | 現行コード上の根拠 | 改善方針 | 確信度 |
|---|---|---|---|---|---|
| SEC-HTTP-01 | Critical | Firebase IDトークン未検証、本文メール認可、本番管理者自動作成が結合したHTTP認証境界の欠落 | `functions/src/index.ts` | 共通IDトークン検証、本文メール認可廃止、自動管理者作成廃止 | High |
| SEC-STORAGE-01 | High | `unprocessed/`匿名アクセス、画像の公開読み取り、`makePublic()`による公開ACL | `storage.rules`、`functions/src/fileProcessor.ts` | Rules、公開ACL、既存オブジェクトを一体で非公開化 | High |
| SEC-STATUS-01 | High | `getImportStatus`が認証なしでジョブ文書を返す | `functions/src/index.ts` | Firebase IDトークンと管理者ロールを検証し、レスポンス項目も限定 | High |
| SEC-LOG-01 | High | Google OAuthトークン、提出オブジェクト、学生メール一覧のログ出力 | `src/app/admin/import/page.tsx`、`functions/src/importController.ts` | 生トークンを除去し、件数・job ID・エラーコードだけを記録 | High |
| PRIV-REPO-01 | High | 公開GitHubリポジトリで`users.json`が追跡され、認証エクスポート情報を含む | `users.json`、GitHub visibility=`PUBLIC`を確認済み | 追跡停止、公開履歴・データ実在性を確認し、必要なら履歴除去と通知 | High |
| IMP-STATE-01 | High | 進捗の学生・ファイル単位混在と`processedFiles + errorFiles.length`による二重計上 | `functions/src/fileProcessor.ts`、`functions/src/importController.ts` | 学生提出ごとの終端状態だけで完了判定 | High |
| IMP-ID-01 | High | プロフィール取得失敗時に空文字Mapキーで複数学生が統合され得る | `functions/src/importController.ts` | `email > Classroom userId > submission ID`の安定キーを使用し、空文字禁止 | High |
| IMP-QUEUE-01 | High | Cloud Task投入失敗時にジョブが`processing`のまま残り得る | `functions/src/importController.ts` | 投入失敗を学生提出の`failed`終端状態として記録し、投入後も完了判定 | High |
| IMP-IDEMP-01 | High | コンテナ停止、応答消失、入口再送時に重複作品・カウント増加が起こり得る | ランダム作品ID、名前なしCloud Task | 初期化時に作品ID・処理IDを一度だけ確定し、終端遷移を冪等化 | High |
| IMP-TIMEOUT-01 | High | インポート入口がDrive取得まで同期実行し、540秒504が実運用で発生 | `initializeImport`、2026-02-08障害分析 | N+1削減と計測後、60秒を超える場合は初期化処理もバックグラウンド化 | High |
| TEST-CI-01 | High | 認証、Rules、進捗、重送の自動テストがなく、CIもFunctionsを検査しない | `package.json`、`.github/workflows` | 高リスク経路だけを守る最小テストを先行追加 | High |
| DATA-DELETE-01 | Medium | 削除が部分成功し得て、`showcaseGalleries`と`showcase/`も対象外 | `functions/src/index.ts` | 削除順序、対象、失敗結果、再実行可能性を整理。直ちにキュー化はしない | High |
| DATA-ORPHAN-01 | Medium | 画像公開後のFirestore・集計・進捗更新失敗で公開画像が孤立し得る | `functions/src/fileProcessor.ts` | 作成済み画像パスを保持し、保存失敗時に補償削除 | High |
| DATA-LIKE-01 | Medium | like文書と`likeCount`が別更新 | `src/app/gallery/page.tsx` | Firestoreトランザクション化 | High |
| CFG-INDEX-01 | Medium | `galleryId + createdAt`の複合インデックスがリポジトリにない | `useGalleryArtworks.ts`、`firestore.indexes.json` | 本番状態を確認し、必要な定義を構成管理 | Medium |
| DOC-DRIFT-01 | Medium | 完全バックグラウンド等、現行実装と異なる説明が残る | `docs/features/BACKGROUND_IMPORT.md`等 | 高リスク改修後に現行動作へ合わせる | High |
| OPS-BACKUP-01 | Medium・未確認 | GCP側のバックアップ・復旧設定はコードから確認不能 | リポジトリ外設定 | 認証・削除改修前にエクスポート状態を確認し、なければ手動取得 | Medium |
| DATA-SCALE-01 | Low・条件付き | コメント・注釈を作品文書へ埋め込む将来の肥大化 | `src/types/index.ts` | 実測で遅延・競合・数百KB化が確認された場合のみ分離 | High |
| ARC-01 | Low | 巨大ファイルと重複処理 | `functions/src/index.ts`等 | 認証、進捗、削除の変更箇所だけを小さく分離 | High |
| QA-01 | Low | Hooks依存配列のLint警告4件 | 現行環境でLint実行済み | 高リスク対応後に通常保守で修正 | High |

## 削除・統合・重要度変更した旧項目

- 旧`SEC-01`と`SEC-02`を`SEC-HTTP-01`へ統合する。
- 旧`REL-02`と`REL-03`を、`IMP-STATE-01`、`IMP-ID-01`、`IMP-QUEUE-01`、`IMP-IDEMP-01`へ再整理する。
- 通常のアプリケーションエラーは多くがHTTP 200で終端するため、「常にCloud Tasksで再試行される」という説明は削除する。
- 旧`SEC-04`はRules修正だけでなく、`makePublic()`、既存public ACL、Firebase download tokenの扱いまで含む`SEC-STORAGE-01`へ拡張する。
- 旧`DATA-01`はHighからMediumへ下げ、即時の削除ジョブ化を撤回する。
- 旧`DATA-02`はLow・条件付きへ下げ、現在はサブコレクション化しない。
- 旧`ARC-01`はLowへ下げ、全面的な責務分割を行わない。
- 旧`OPS-01`は「バックアップがない」という断定を削除し、外部設定の確認事項へ変更する。
- 旧`PRIV-01`はLowからHighへ上げる。
- `getImportStatus`、空文字学生キー、Task投入失敗、Showcase削除漏れ、孤立公開画像を新規追加する。

## 今すぐ対応する項目

現時点では実装しない。将来改善を開始する場合は、以下を最初の作業単位とする。

### 1. HTTP認証境界

- 全HTTP FunctionsでFirebase IDトークンを検証する。
- `Authorization`にはFirebase IDトークンを送り、Google OAuthトークンは別の入力として扱う。
- 管理者権限は検証済みIDトークンのメールから判定する。
- 本文の`userEmail`を認可判断から削除する。
- 本番・開発共通経路から管理者自動作成を削除する。
- `getImportStatus`も管理者認証必須とし、必要な進捗項目だけを返す。
- CORSは本番Hostingドメインとローカル開発元だけを許可する。

### 2. Storage非公開化

- `unprocessed/`はクライアントから全面拒否する。Admin SDKはRulesを通らないため例外設定は不要。
- `fileProcessor.ts`の全`makePublic()`を停止する。
- `galleries/`はFirebase認証済みユーザーへ限定する。
- `showcase/`は製品要件を確認するまで少なくとも匿名公開を停止する。
- 既存オブジェクトのpublic ACLを棚卸しし、一括解除する。
- 既存Firebase download token URLを無効化する必要がある場合は、メタデータ上のトークンもローテーションまたは削除する。
- ACL移行前に、現行フロントが使用するURL方式を認証付き取得へ変更する。

### 3. 機密情報と公開リポジトリ

- OAuthアクセストークンのconsole出力を削除する。
- Classroom提出物全文、学生メール一覧、個人名を通常ログから除く。
- `users.json`を追跡対象から外す。
- 内容が実データの場合は、Git履歴上の露出範囲、Google識別子・写真URLの扱い、対象者への連絡要否を確認する。
- 履歴除去や強制pushは別途明示承認を得て実施する。

### 4. 変更前の運用保護

- GCP側のFirestore・Storageバックアップ設定を確認する。
- 復元可能なエクスポートがなければ、認証・Storage・削除変更前に手動取得する。
- 現在の管理者ロール一覧と、意図せず作成されたロールの有無を確認する。

## 次回リリースまたはMVP完成までに対応する項目

### 学生提出単位の進捗

新規ジョブは以下のフィールドを使用する。

- `totalSubmissions`
- `completedSubmissions`
- `succeededSubmissions`
- `failedSubmissions`
- `failedFileCount`

学生提出ごとに`queued / processing / succeeded / failed`を管理する。部分的なファイル失敗でも画像が1件以上生成できた場合は`succeeded`とし、`failedFileCount`と警告を残す。画像が0件の場合だけ`failed`とする。

終端状態への初回遷移をトランザクションで行い、その時だけジョブの集計値を1増やす。`errorFiles.length`を完了判定に使わない。

既存ジョブ表示のため旧フィールドは読み取りフォールバックだけ残し、新規ジョブの完了判定には使用しない。

### 学生識別と冪等性

- 学生キーは`正規化メール > Classroom userId > submission ID`の優先順とする。
- 空文字キーを拒否する。
- Classroom user IDを作品メタデータへ保持する。
- 初期化時に学生提出ごとの処理レコードと`artworkId`を一度だけ作る。
- Cloud Task名も`importJobId + studentKey`から決定する。
- 同じタスクが再度呼ばれた場合、終端済みなら成功レスポンスを返して何も変更しない。
- 通常の処理エラーはHTTP 200で終端可能だが、必ず学生提出を`failed`へ遷移させる。
- Task投入失敗も`failed`へ遷移させ、全投入後に完了判定を実行する。

### 既知の504

- `assignedStudents`からプロフィールMapを作り、提出ごとの`userProfiles.get()`を削減する。
- Drive処理は少数の限定並列にする。
- 提出一覧、プロフィール、Drive取得、Storage保存、Task投入の所要時間をjob ID付きで計測する。
- 70人規模の代表データで入口処理が60秒を超える、または504が再発する場合は、提出走査と一時保存を初期化Taskへ移し、入口を数秒で202応答させる。
- 現在421秒・540秒の実績があるため、計測だけで改善を先送りしない。同一リリース内でバックグラウンド化へ進める準備を含める。

### 削除・公開画像の整合性

- ギャラリー削除で対応する`showcaseGalleries/{galleryId}`と`showcase/{galleryId}/`も削除する。
- 作品削除では`curatedArtworkIds`と`featuredArtworkId`を更新する。
- Storage削除やギャラリー更新の失敗を握りつぶさず、失敗対象をレスポンスと構造化ログへ残す。
- 削除操作自体を冪等化し、同じ要求を再実行できるようにする。
- 現段階では削除キューは導入しない。
- 画像生成後の後段失敗では、今回作成した画像パスだけを補償削除する。

### 最小限の自動テストとCI

- 未認証、viewer、adminのHTTP認可マトリクス
- 任意Bearer・本文メール改変で管理者作成や削除ができないこと
- `getImportStatus`の未認証拒否
- `unprocessed/`匿名読み書き拒否
- 通常画像・Showcase画像の想定公開範囲
- 複数ファイルの一部失敗でも学生1件として集計されること
- プロフィール取得失敗した複数学生が統合されないこと
- 同一学生タスクを2回実行しても作品とカウントが増えないこと
- Task全投入失敗でジョブが終端すること
- Functionsの型検査・ビルド
- Security Rulesテスト
- `firestore.indexes.json`を含む設定検証

## 将来必要になった場合のみ検討する項目

- 作品文書が数百KBへ増加した場合のコメント・注釈サブコレクション化
- 実測で一覧表示が遅くなった場合のカード用軽量文書
- 削除失敗が運用上頻発した場合の非同期削除ジョブ
- リポジトリ層、DDD、全面的なモジュール再構成
- 複数プロジェクト対応の環境抽象化
- Showcaseの集約キャッシュ
- Cloud Runを含む完全自動デプロイ
- Node統一、CLI固定、Lint、命名整理などの通常保守

## フェーズ別ロードマップ

### Phase 0: 緊急な認証・公開停止

対象は`SEC-HTTP-01`、`SEC-STORAGE-01`、`SEC-STATUS-01`、`SEC-LOG-01`、`PRIV-REPO-01`。

#### 完了条件

- 任意Bearerで管理者ロールを作れない。
- 本文メールを変更しても権限が変わらない。
- 未認証で管理APIとジョブ情報を取得できない。
- 未認証で`unprocessed/`へアクセスできない。
- 既存作品のpublic ACL移行結果を確認できる。
- ログにOAuthトークンや提出物全文がない。
- `users.json`の公開対応方針が決まっている。

#### 必要なテスト

- 認証ロールマトリクス
- 期限切れ・不正トークン
- Storage Rules
- 既存公開URL
- 管理者自動作成回帰

### Phase 1: インポート正確性

対象は`IMP-STATE-01`、`IMP-ID-01`、`IMP-QUEUE-01`、`IMP-IDEMP-01`、`DATA-ORPHAN-01`。

#### 完了条件

- 複数ファイルでも学生1件として進捗が増える。
- 一部失敗で早期100%にならない。
- メール取得失敗した学生が統合されない。
- Task投入全失敗でもジョブが終端する。
- 同一タスクを2回送っても作品・カウントが1件。
- 後段失敗で今回作成した画像が孤立しない。

#### 必要なテスト

- 複数ファイル、一部欠落、サイズ超過
- プロフィールAPI失敗
- Task作成失敗
- 同一Task重送
- 応答消失後の再送
- `not_submitted/error → submitted`

### Phase 2: インポート入口の安定化

対象は`IMP-TIMEOUT-01`。

#### 完了条件

- 70人規模で入口が設定した60秒上限を満たすか、初期化Task化されて数秒で202を返す。
- 504が再現しない。
- 起票済みジョブは画面離脱後も継続する。
- 入口再送が重複ジョブ・作品を作らない。

#### 必要なテスト

- 70人、複数PDF、最大サイズ付近
- Google API遅延・部分失敗
- OAuthトークン失効
- 同一リクエスト再送

### Phase 3: 削除・集計整合性

対象は`DATA-DELETE-01`、`DATA-LIKE-01`、`CFG-INDEX-01`。

#### 完了条件

- ギャラリー削除後にShowcase文書・画像が残らない。
- 作品削除後に選定IDが残らない。
- 部分失敗の対象を確認して再実行できる。
- like文書数と`likeCount`が一致する。
- 新規環境でも必要なクエリがインデックス不足で失敗しない。

#### 必要なテスト

- Storage削除失敗
- Firestore更新失敗
- Showcase選定作品削除
- 同時いいね
- 削除要求の再実行

### Phase 4: 開発基盤と文書

対象は`TEST-CI-01`、`DOC-DRIFT-01`と通常保守。

#### 完了条件

- PRでフロント、Functions、認証・Rulesテストが実行される。
- Background Import資料が実装と一致する。
- 高リスク処理だけが小さな責務へ分離されている。
- セットアップ資料から本番相当テストまで再現できる。

#### 必要なテスト

- ルートとFunctionsの型検査・ビルド
- Security Rulesテスト
- 主要な認証・インポート統合テスト
- ドキュメント内パスとコマンドの検証

## 変更しないほうがよい箇所

- Next.js、Firebase、Cloud Tasks、Cloud Runという技術構成
- PDF変換をCloud Runへ分離した設計
- `submitted / not_submitted / error`を同一作品モデルで扱う仕様
- 提出済み作品を再インポートで保護する仕様
- 注釈UIの現在の分割と画像キャッシュ
- Rulesで保護できるコメント・ラベル等のFirestore直接操作
- Showcaseの独立コレクション構成
- 現在問題が計測されていない注釈・コメント保存方式

## 未確認事項

- 本番デプロイと`main`の一致
- Cloud Runの現在のIAM、invoker、未認証アクセス設定
- 既存Storageオブジェクトのpublic ACLとdownload token
- 通常ギャラリーとShowcaseをどこまで匿名公開する製品要件か
- 本番の複合インデックス
- Firestore・Storageのバックアップ、保持期間、復元実績
- 2026年2月以降の504件数
- 停止ジョブ、Task再送、孤立画像の実数
- `users.json`の情報が実在人物か、テストデータか
- Git履歴からの`users.json`除去や対象者通知の必要性
- Google OAuthトークンを初期化Taskへ渡す場合の保管・失効方針
- Showcase画像を大学ドメイン外へ公開する意図

## 最優先改善トップ5

1. Firebase IDトークンによるHTTP認証境界を構築し、本文メール認可と管理者自動作成を廃止する。
2. Storageの匿名アクセス、`makePublic()`、既存公開ACLと必要なdownload tokenを停止する。
3. インポート進捗を学生提出単位の終端状態へ統一する。
4. 安定した学生識別キーと冪等な処理・作品IDを導入する。
5. 認証、Storage、進捗、Task重送を守る最小限の自動テストとCIを追加する。

## この計画の前提

- 運用中MVP、個人開発、70人規模の大学講評会を基準とする。
- 認証、漏えい、破損、既知障害をコード整理より優先する。
- 現時点ではこの計画を実装しない。
- 実装開始時には、対象フェーズと完了条件を改めて確認する。
- この文書の保存に伴い、コード、設定、Security Rules、データ構造、CI、デプロイ構成は変更しない。
