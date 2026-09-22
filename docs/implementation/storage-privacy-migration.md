# Storage 非公開化の本番移行手順

Issue #6 のコードは、公開URLではなく Storage object path と Firebase Auth を使って画像を取得する。本番の既存データ・ACL・download token は自動変更しないため、以下を段階的に実行する。

## 変更後の境界

- `galleries/**`: Firebase Auth 認証済みユーザーはread、adminだけwrite
- `showcase/**`: `musashino-u.ac.jp`またはサブドメインの認証済みユーザーはread、同ドメインのadminだけwrite
- `unprocessed/**`: クライアントread / write全面拒否。Admin SDK、Cloud Run、Cloud FunctionsはRulesをバイパスする
- 新規作品画像: `storagePath` / `thumbnailPath`をFirestoreへ保存し、public ACLとdownload tokenを作らない
- 新規Showcase概要画像: `overviewImagePath` / `overviewImageThumbPath`だけを保存する

## 事前確認

1. Firestore / Storage の復元可能なバックアップを確認する。
2. 対象プロジェクト、bucket、管理者アカウント、学内viewerアカウントを確認する。
3. root / Functions build、Functions test、Storage Rules testを成功させる。
4. 変更をCloud Run → Functions → Hostingの順で反映する。この段階ではStorage Rulesをまだ反映しない。

## dry-run棚卸し

Application Default Credentials、または読み取り可能なサービスアカウントを用意する。

```powershell
gcloud auth application-default login
npm.cmd run audit:storage-privacy -- --project=online-review-gallery --bucket=online-review-gallery.firebasestorage.app --list-all
```

別のbucket名を使う環境では実在する名前を指定する。サービスアカウントJSONを使う場合は`--credentials=PATH`を追加する。

dry-runは次を列挙し、何も変更しない。

- public ACLを持つobject
- `firebaseStorageDownloadTokens` metadataを持つobject
- pathフィールドを補完できるFirestore文書
- Firestoreから参照されないobject
- Firestoreが参照するがStorageに存在しないpath

## 段階移行

各段階でdry-run結果を保存し、対象件数とpathを人手確認する。変更フラグだけでは動作せず、`--apply`も同時に必要である。

1. 既存Firestore文書へ復元可能なpathだけを補完する。

   ```powershell
   npm.cmd run audit:storage-privacy -- --project=online-review-gallery --bucket=BUCKET_NAME --apply --update-firestore-paths
   ```

2. Hosting上で、管理者ログイン、通常ギャラリーthumbnail、モーダル原寸、注釈、Showcase入口・詳細・概要画像を確認する。
3. Storage Rulesを反映する。

   ```powershell
   firebase deploy --only storage --project online-review-gallery
   ```

4. 未ログイン、学外ログイン、学内ログイン、adminのRules境界と、Cloud Run / Functionsのインポートを確認する。
5. public ACLを解除する。

   ```powershell
   npm.cmd run audit:storage-privacy -- --project=online-review-gallery --bucket=BUCKET_NAME --apply --remove-public-acl
   ```

6. 旧Firebase download URLを利用していないことを確認してから、download token metadataを解除する。

   ```powershell
   npm.cmd run audit:storage-privacy -- --project=online-review-gallery --bucket=BUCKET_NAME --apply --remove-download-tokens
   ```

7. dry-runを再実行し、public ACLとtokenが0件、必要なFirestore pathが補完済みであることを確認する。

## リリース後の確認

- 未認証で通常画像をStorage SDKから取得できない
- 学外アカウントでShowcase画像を取得できない
- 学内アカウントでShowcase入口、概要thumbnail、詳細画像、featured / update source画像を表示できる
- 管理者で通常ギャラリー一覧、thumbnail、モーダル原寸、注釈を表示できる
- 画像とPDFを新規インポートでき、`unprocessed/**`のserver-side処理が成功する
- 新規objectにpublic ACLと`firebaseStorageDownloadTokens`がない
- 旧`storage.googleapis.com` URLと旧token URLを未認証で直接開いて取得できない

孤立objectの削除はIssue #6の自動処理対象ではない。棚卸し結果を確認し、別途削除範囲の承認を得て実施する。
