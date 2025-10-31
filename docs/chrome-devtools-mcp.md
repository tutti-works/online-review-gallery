# Chrome DevTools MCP 導入ガイド

## 概要

Chrome DevTools MCPは、Claude Codeからブラウザをプログラマティックに操作できるModel Context Protocol (MCP)サーバーです。このガイドでは、任意のプロジェクトでChrome DevTools MCPを導入する方法と、その活用方法について説明します。

## MCPとは

Model Context Protocol (MCP)は、AIアシスタントが外部ツールやサービスと連携するための標準プロトコルです。Claude CodeはMCPを通じて、データベース、API、開発ツールなどと統合できます。Chrome DevTools MCPは、ブラウザ自動化機能をClaude Codeに提供するMCPサーバーの一つです。

## セットアップ方法

### ステップ1: 前提条件の確認

以下がインストールされていることを確認してください:

1. **VSCode** (または対応エディタ)
2. **Claude Code拡張機能**
   - VSCodeの拡張機能マーケットプレイスから「Claude Code」をインストール
   - インストール後、Anthropic APIキーを設定
3. **Node.js** (v18以上推奨)
   - `node --version`で確認
4. **Google Chrome**
   - 最新版を推奨

### ステップ2: Chrome DevTools MCPの追加

VSCodeのターミナルで以下のコマンドを実行:

```bash
claude mcp add chrome-devtools npx -- chrome-devtools-mcp@latest
```

このコマンドは以下を実行します:
- `chrome-devtools`という名前でMCPサーバーを登録
- `npx`を使用して`chrome-devtools-mcp@latest`パッケージを実行
- Claude Codeの設定ファイルに自動的に追加

#### 手動設定の場合

Claude CodeのMCP設定ファイル(通常は`~/.config/claude/mcp.json`または`%APPDATA%\claude\mcp.json`)に以下を追加:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

### ステップ3: 接続確認

MCPサーバーが正常に起動していることを確認:

```bash
claude mcp list
```

正常に接続されている場合の出力例:
```
Checking MCP server health...

chrome-devtools: npx chrome-devtools-mcp@latest - ✓ Connected
```

### ステップ4: 初回使用

Claude Codeのチャットで以下のように依頼してみてください:

```
「Chromeで https://example.com を開いてスクリーンショットを撮ってください」
```

初回実行時、Chromeが自動的に起動し、指定したページが開かれます。

## 主な機能

Chrome DevTools MCPを使用すると、以下のような操作が可能になります:

### ページナビゲーション

- `mcp__chrome-devtools__navigate_page` - 指定したURLへの遷移
- `mcp__chrome-devtools__navigate_page_history` - 戻る/進む操作
- `mcp__chrome-devtools__new_page` - 新しいタブを開く
- `mcp__chrome-devtools__list_pages` - 開いているページの一覧取得

### ページ操作

- `mcp__chrome-devtools__take_snapshot` - ページのアクセシビリティツリーベースのスナップショット取得
- `mcp__chrome-devtools__take_screenshot` - スクリーンショットの撮影
- `mcp__chrome-devtools__click` - 要素のクリック
- `mcp__chrome-devtools__fill` - フォーム入力
- `mcp__chrome-devtools__fill_form` - 複数フォーム要素の一括入力
- `mcp__chrome-devtools__hover` - ホバー操作
- `mcp__chrome-devtools__drag` - ドラッグ&ドロップ

### 開発者向け機能

- `mcp__chrome-devtools__evaluate_script` - JavaScriptコードの実行
- `mcp__chrome-devtools__list_console_messages` - コンソールメッセージの取得
- `mcp__chrome-devtools__list_network_requests` - ネットワークリクエストの監視
- `mcp__chrome-devtools__get_network_request` - 特定リクエストの詳細取得

### パフォーマンス分析

- `mcp__chrome-devtools__performance_start_trace` - パフォーマンストレースの開始
- `mcp__chrome-devtools__performance_stop_trace` - トレース記録の停止
- `mcp__chrome-devtools__performance_analyze_insight` - パフォーマンス分析結果の詳細

### エミュレーション

- `mcp__chrome-devtools__emulate_network` - ネットワーク速度のエミュレーション(3G、4Gなど)
- `mcp__chrome-devtools__emulate_cpu` - CPU速度のスロットリング
- `mcp__chrome-devtools__resize_page` - ビューポートサイズの変更

### その他

- `mcp__chrome-devtools__wait_for` - 特定テキストの出現を待機
- `mcp__chrome-devtools__handle_dialog` - ブラウザダイアログの操作
- `mcp__chrome-devtools__upload_file` - ファイルアップロード

## 使用例

Chrome DevTools MCPを使うと、自然言語でブラウザ操作を依頼できます。以下は実用的な使用例です。

### 例1: ローカル開発サーバーのテスト

**依頼内容:**
```
localhost:3000を開いて、スクリーンショットを撮ってください
```

**用途:** 開発中のWebアプリケーションの見た目を確認する

**内部動作:**
1. `navigate_page` - ページを開く
2. `take_screenshot` - スクリーンショットを撮る

### 例2: レスポンシブデザインの確認

**依頼内容:**
```
モバイルサイズ(375x667)とタブレットサイズ(768x1024)でホームページのスクリーンショットを撮ってください
```

**用途:** 異なる画面サイズでの表示確認

**内部動作:**
1. `resize_page` - 画面サイズを変更
2. `take_screenshot` - 各サイズでスクリーンショット

### 例3: フォームの自動入力テスト

**依頼内容:**
```
ログインページで以下を入力してログインしてください:
- メール: test@example.com
- パスワード: testpass123
```

**用途:** ログイン機能の動作確認

**内部動作:**
1. `take_snapshot` - ページの要素を取得
2. `fill_form` - フォームに値を入力
3. `click` - ログインボタンをクリック
4. 結果を報告

### 例4: パフォーマンス分析

**依頼内容:**
```
トップページのパフォーマンスを計測して、Core Web Vitalsを報告してください
```

**用途:** Webサイトのパフォーマンス最適化

**内部動作:**
1. `performance_start_trace` - トレース開始(リロード付き)
2. `performance_stop_trace` - トレース停止
3. LCP、FID、CLSなどのメトリクスを分析・報告

### 例5: ネットワークリクエストの監視

**依頼内容:**
```
APIダッシュボードページを開いて、XHRリクエストを全て表示してください
```

**用途:** API呼び出しのデバッグ

**内部動作:**
1. `navigate_page` - ページを開く
2. `list_network_requests` - リクエスト一覧を取得(resourceTypes: ["xhr", "fetch"])
3. 各リクエストの詳細(URL、ステータス、レスポンス)を報告

### 例6: エラーログの確認

**依頼内容:**
```
管理画面を開いて、コンソールにエラーがないか確認してください
```

**用途:** JavaScriptエラーの検出

**内部動作:**
1. `navigate_page` - ページを開く
2. `list_console_messages` - コンソールメッセージを取得(types: ["error"])
3. エラーメッセージを報告

### 例7: E2Eシナリオテスト

**依頼内容:**
```
ECサイトで以下のシナリオをテストしてください:
1. 商品を検索
2. 商品をカートに追加
3. カートページに遷移
4. 合計金額が正しいことを確認
```

**用途:** ユーザーフローの自動テスト

**内部動作:**
複数のツールを組み合わせて、実際のユーザー操作を再現

### 例8: スロー環境でのテスト

**依頼内容:**
```
3G回線をエミュレートして、画像読み込みの速度を確認してください
```

**用途:** 低速回線でのUX確認

**内部動作:**
1. `emulate_network` - "Slow 3G"を設定
2. ページを読み込み
3. 読み込み時間を計測

## 活用シーン

Chrome DevTools MCPは、以下のような場面で特に有用です:

### 1. フロントエンド開発

- **ビジュアル回帰テスト**: 変更前後のスクリーンショット比較
- **レスポンシブ確認**: 複数デバイスサイズでの表示チェック
- **インタラクティブテスト**: ボタンやフォームの動作確認

### 2. パフォーマンス最適化

- **Core Web Vitals計測**: LCP、FID、CLSの測定
- **ネットワーク分析**: 読み込みリソースの確認
- **CPU/ネットワークスロットリング**: 低スペック環境のシミュレーション

### 3. デバッグとトラブルシューティング

- **コンソールエラー監視**: JavaScript実行時エラーの検出
- **ネットワークエラー調査**: API呼び出しの失敗原因特定
- **動的デバッグ**: `evaluate_script`でJavaScriptを実行

### 4. QAと自動テスト

- **E2Eシナリオ実行**: ユーザーフローの自動化
- **フォームバリデーション**: 入力チェックの動作確認
- **クロスブラウザテストの補助**: Chrome環境での基準テスト

### 5. ドキュメンテーション

- **スクリーンショット生成**: ドキュメント用の画面キャプチャ
- **機能デモ**: 新機能の動作記録
- **バグレポート**: エラー状態のスナップショット取得

## トラブルシューティング

### 問題1: MCPサーバーが接続できない

**症状:**
```
chrome-devtools: npx chrome-devtools-mcp@latest - ✗ Failed to connect
```

**解決方法:**

1. **Claude Codeを再起動**
   - VSCodeを完全に終了して再起動

2. **MCPサーバーを再起動**
   ```bash
   claude mcp restart chrome-devtools
   ```

3. **Node.jsのバージョン確認**
   ```bash
   node --version  # v18以上が必要
   ```

4. **パッケージの再インストール**
   ```bash
   claude mcp remove chrome-devtools
   claude mcp add chrome-devtools npx -- chrome-devtools-mcp@latest
   ```

### 問題2: Chromeが起動しない

**症状:**
ブラウザ操作を依頼してもChromeが開かない

**解決方法:**

1. **Chromeがインストールされているか確認**
   - Google Chromeの最新版をインストール

2. **Chromeの実行パスを確認**
   - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - macOS: `/Applications/Google Chrome.app`
   - Linux: `/usr/bin/google-chrome`

3. **Chromiumで代替**
   - Chromeがインストールできない場合、Chromiumでも動作可能

### 問題3: タイムアウトエラー

**症状:**
```
Error: Timeout waiting for page to load
```

**解決方法:**

1. **ネットワーク速度が遅い場合**
   - Claude Codeに「タイムアウトを60秒に設定してページを開いてください」と依頼

2. **重いページの場合**
   - 特定の要素が表示されるまで待つように依頼
   - 例: 「ページを開いて、"ログイン"というテキストが表示されるまで待ってください」

3. **JavaScript読み込みに時間がかかる場合**
   - `wait_for`での待機を明示的に依頼

### 問題4: 要素が見つからない

**症状:**
```
Error: Element with uid "XXX" not found
```

**解決方法:**

1. **最新のスナップショットを取得**
   - Claude Codeに「最新のページスナップショットを取得してください」と依頼

2. **要素が動的に生成される場合**
   - 要素が表示されるまで待機してから操作

3. **iframeやシャドウDOM内の要素**
   - 現在のバージョンでは制限がある場合があります

### 問題5: 認証が必要なページにアクセスできない

**解決方法:**

1. **ログイン操作を自動化**
   ```
   以下の手順でログインしてください:
   1. ログインページを開く
   2. メールとパスワードを入力
   3. ログインボタンをクリック
   4. ダッシュボードページに遷移したことを確認
   ```

2. **セッションストレージ/Cookieを使用**
   - `evaluate_script`で認証情報を設定可能

### 問題6: パフォーマンストレースが記録されない

**症状:**
トレース結果が空または不完全

**解決方法:**

1. **リロード付きでトレース開始**
   - 「リロードしながらパフォーマンストレースを記録してください」と依頼

2. **十分な時間待つ**
   - ページが完全に読み込まれるまで待機

3. **自動停止を使用**
   - autoStopオプションでページ読み込み完了時に自動停止

## ベストプラクティス

### 1. スナップショットを優先

スクリーンショットよりもスナップショットの方が高速で情報量が多いため、まずスナップショットを取得することを推奨します。

```
良い例: 「ページのスナップショットを取得して、エラーメッセージがないか確認してください」
```

### 2. 明確な指示

Claude Codeに操作を依頼する際は、できるだけ具体的に指示します。

```
良い例: 「idが"submit-button"のボタンをクリックしてください」
悪い例: 「ボタンを押してください」
```

### 3. エラーハンドリング

操作が失敗する可能性がある場合は、その旨を伝えます。

```
例: 「ログインを試みて、失敗した場合はエラーメッセージを教えてください」
```

### 4. 段階的な操作

複雑な操作は段階的に依頼します。

```
例:
1. まず商品ページを開いてください
2. 次に「カートに追加」ボタンをクリックしてください
3. 最後にカートページに移動して合計金額を確認してください
```

### 5. コンテキストを保持

複数のページを開く場合、どのページで操作するか明確にします。

```
例: 「タブ1のログインページでログインして、タブ2のダッシュボードを確認してください」
```

## 高度な使用例

### JavaScriptの実行

```
依頼: 「ページのローカルストレージにトークンを設定してください」

内部動作: evaluate_script を使用
localStorage.setItem('auth_token', 'xxx')
```

### 複数ページの比較

```
依頼: 「本番環境とステージング環境のトップページのスクリーンショットを並べて比較してください」

内部動作:
1. 新しいページを開いて本番環境にアクセス
2. スクリーンショット撮影
3. 別のページを開いてステージング環境にアクセス
4. スクリーンショット撮影
5. 2つの画像を比較
```

### 自動リグレッションテスト

```
依頼: 「主要な5ページのスクリーンショットを撮影して、前回のスクリーンショットと比較してください」
```

## セキュリティとプライバシー

### 注意事項

1. **機密情報の取り扱い**
   - 本番環境のパスワードやAPIキーは直接入力しない
   - テスト用の認証情報を使用する

2. **スクリーンショットの共有**
   - 個人情報が含まれるスクリーンショットは慎重に取り扱う
   - 必要に応じてマスキング処理を依頼

3. **ネットワークリクエストの監視**
   - 機密データを含むリクエストの内容を不用意に公開しない

4. **ローカル環境での使用を推奨**
   - 本番環境へのアクセスは最小限に
   - 開発・ステージング環境での使用を優先

## よくある質問 (FAQ)

### Q1: Chrome以外のブラウザで使えますか?

A: 現在はChrome/Chromiumのみサポートされています。Firefoxやサファリには対応していません。

### Q2: ヘッドレスモードで実行できますか?

A: デフォルトではヘッドレスモードではなく、実際のChromeウィンドウが開きます。これにより、操作を視覚的に確認できます。

### Q3: セッションは保持されますか?

A: 基本的に各操作で新しいブラウザインスタンスが起動します。ログイン状態などを維持したい場合は、一連の操作を続けて依頼してください。

### Q4: 既存の自動テストと統合できますか?

A: Chrome DevTools MCPはClaude Codeから使用するツールであり、既存のテストフレームワーク(Playwright、Seleniumなど)の代替ではありません。開発時の手動テストやデバッグの補助として使用します。

### Q5: 料金はかかりますか?

A: Chrome DevTools MCP自体は無料ですが、Claude CodeはAnthropic APIの使用料金が発生します。

### Q6: プロジェクトメンバー全員で使えますか?

A: 各メンバーが個別にMCPをセットアップする必要があります。プロジェクトの設定ファイルとしては共有できません。

## 参考リンク

- [Chrome DevTools MCP公式リポジトリ](https://github.com/anthropics/chrome-devtools-mcp)
- [Claude Code公式ドキュメント](https://docs.claude.com/docs/claude-code)
- [MCP (Model Context Protocol) 仕様](https://modelcontextprotocol.io)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

## まとめ

Chrome DevTools MCPを導入することで、Claude Codeがブラウザ操作のアシスタントとして機能するようになります。以下のような作業が効率化されます:

- ✅ UI/UXの視覚的確認
- ✅ レスポンシブデザインのテスト
- ✅ フォーム操作の自動化
- ✅ パフォーマンスメトリクスの計測
- ✅ ネットワークリクエストのデバッグ
- ✅ JavaScriptエラーの検出

自然言語で指示するだけで、これらの操作を自動化できるため、開発効率が大幅に向上します。

---

**ドキュメントバージョン:** 1.0.0
**最終更新日:** 2025-10-29
**対象MCP:** chrome-devtools-mcp@latest
