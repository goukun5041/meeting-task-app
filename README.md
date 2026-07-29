# meeting-task-app

Vue 3 + TypeScript + Vite の静的フロントエンド、Netlify Functions、Neon PostgreSQL、Firebase Authentication で構成する課題管理アプリです。

本番URL: [https://meeting-task-app.netlify.app/](https://meeting-task-app.netlify.app/)

## アーキテクチャ

```text
Vue 3 + TypeScript + Vite
        ↓
Netlify
├ 静的フロントエンド
└ Netlify Functions
        ↓
Neon PostgreSQL
```

ブラウザは Neon に直接接続しません。すべての DB 操作は Firebase ID トークンを検証した Netlify Functions 経由で実行します。

## 主な機能

- Google ログイン / ログアウト
- プロジェクト単位の課題管理
- 課題の登録、編集、削除、詳細表示
- 対応履歴の登録、編集、削除
- キーワード、ステータス、優先度、完了非表示の絞り込み
- `updated_at` による楽観ロック
- localStorage `meeting-task-app:data` から Neon への移行、上書き、更新日時優先マージ

## 必要なサービス

- Firebase プロジェクト
- Firebase Authentication Google プロバイダ
- Firebase Web アプリ
- Firebase Admin SDK サービスアカウント
- Neon PostgreSQL
- Netlify サイト

## 環境変数

`.env.example` を参考に設定してください。秘密情報は Git にコミットしないでください。

```env
# Firebase Web SDK
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=

# Neon
DATABASE_URL=

# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

`DATABASE_URL` と Firebase Admin SDK 設定は Netlify Functions だけで参照します。`VITE_` で始まる Firebase Web SDK 設定は公開設定値です。

Netlify の `FIREBASE_PRIVATE_KEY` は `\n` を含む形式で登録できます。Functions 側で実改行へ復元します。

本番とDeploy Previewでは環境変数のコンテキストを分離してください。Deploy Previewから本番Neonへ接続させず、必要な場合はNeonのPreview用ブランチとPreview専用Firebase設定を使用します。未信頼PRのDeploy Previewには本番シークレットを公開しないでください。

## Firebase 設定

1. Firebase Console でプロジェクトを作成します。
2. Authentication を有効化します。
3. Sign-in method で Google プロバイダを有効化します。
4. Web アプリを登録し、表示される Web SDK 設定を `VITE_FIREBASE_*` に設定します。
5. プロジェクト設定からサービスアカウントを作成します。
6. `project_id`、`client_email`、`private_key` を Netlify 環境変数の `FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY` に登録します。
7. Authentication の承認済みドメインへ Netlify の本番ドメインを追加します。

## Neon 設定

1. Neon でプロジェクトを作成します。
2. 接続文字列を取得し、Netlify 環境変数 `DATABASE_URL` に登録します。
3. ローカルまたは CI でマイグレーションを実行します。

```sh
DATABASE_URL='postgres://...' npm run db:migrate
```

マイグレーションSQLは`migrations/`の番号順に適用され、`schema_migrations`へファイル名・SHA-256・適用日時を記録します。適用済みファイルを書き換えるとrunnerは停止するため、変更は`002_*.sql`のような新しいファイルとして追加してください。各migrationは再実行可能に作成します。

## ローカル開発

通常の Vite だけでは Functions が動きません。Functions 込みで確認する場合は Netlify CLI を使います。Node.js `22.13`以上`25`未満、npm `11.16.0`を使用してください。

```sh
npm ci
npm run dev:netlify
```

WindowsでNetlify Functionsの再バンドル先がロックされる問題を避けるため、`dev:netlify`は`CHOKIDAR_USEPOLLING=true`を設定するラッパー経由でNetlify CLIを起動します。

Vite のみ確認する場合:

```sh
npm run dev
```

## テスト

```sh
npm run verify
```

`verify` はテスト、TypeScript型チェック、Vite本番ビルドを順に実行します。Netlifyのビルドゲートでも同じコマンドを使用します。

## Netlify デプロイ

1. Netlify で新規サイトを作成し、このリポジトリを接続します。
2. Build command は `npm run verify`、Publish directory は `dist` です。
3. Functions directory は `netlify/functions` です。`netlify.toml` に定義済みです。
4. Netlify 環境変数を設定します。
5. Neon のマイグレーションを実行します。
6. デプロイ後、Firebase Authentication の承認済みドメインへ Netlify ドメインを追加します。

## GitHub Pages から Netlify への切り替え

- Vite の GitHub Pages 用 `base` は削除済みです。
- GitHub Pages ではアプリ本体を配信せず、`github-pages/index.html` からNetlifyの本番URLへ転送します。
- `.github/workflows/deploy-pages-redirect.yml` は `main` 更新時にリダイレクトページだけをデプロイします。
- GitHub Pagesは静的ホスティングのためHTTP 301/302ではなく、JavaScriptの`location.replace()`と`meta refresh`を使用します。

## localStorage データ移行

旧 localStorage の正式キーは `meeting-task-app:data` です。`meeting-task-app:issues` は移行対象外です。

確認ダイアログの表示条件:

- ログイン済み
- localStorage に `meeting-task-app:data` が存在する
- DBからのデータ取得に成功している

移行 API は `POST /api/migration/import-local-data` です。リクエストの`mode`は`merge`または`overwrite`です。どちらも認証ユーザーの`users`行をロックし、Projects、Tasks、Task historiesを単一トランザクションで処理します。通常の作成・更新・削除も同じユーザー行ロックへ参加するため、別PCの通常操作と移行処理はユーザー単位で直列化されます。途中で失敗した場合はDB処理をすべてロールバックし、localStorageを残します。

通常更新の楽観ロックでは、JavaScriptが保持できる精度に合わせて`updatedAt`をミリ秒単位で比較します。PostgreSQLのマイクロ秒部分がブラウザへの返却時に失われても、変更直後の正しい`updatedAt`で更新できます。

このAPIを含むデプロイを公開する前に、`002_preserve_import_timestamps.sql`まで適用してください。通常のCRUDでは更新トリガーが従来どおり現在時刻を設定しますが、マージトランザクション内では移行元の`updatedAt`を保持し、後続PCでも正しく新旧比較できるようにします。

サーバーに既存データがある場合:

- **マージ**: プロジェクトは処理開始時のサーバーデータを基準に、すべての同一IDを先に対応付け、次にまだ予約されていない同名プロジェクトを対応付けます。この対応関係はトランザクション内で固定し、途中の改名によって課題の移行先が変わらないようにします。課題と履歴は同一IDを同じものとして扱い、内容が異なる場合は`updatedAt`が新しい方を採用します。同時刻の場合はサーバー側を維持します。片方にしかないデータは追加します。IDと名前が交差するなど一意に対応付けできない場合は`409 merge_conflict`で全処理を中止し、localStorageを残します。
- **上書き**: 認証ユーザーのサーバー上のプロジェクトを削除し、外部キーのcascadeによって課題と履歴も削除してから、このPCのデータを登録します。確認ダイアログを二段階で表示します。他ユーザーのデータは対象外です。
- **あとで**: その画面では処理せず、localStorageを維持します。

上書き前のサーバーデータはブラウザへ自動バックアップされません。本番で上書きを許可する場合は、NeonのPITRまたはブランチによる復元手段を有効にしてください。

成功後、フロントエンドはDBから再取得し、このPCのlocalStorage元データを日時付きバックアップキーへコピーしてから通常キーを削除します。サーバー処理に成功し、ブラウザ側のバックアップだけ失敗した場合は、その違いを画面へ通知します。

バックアップ例:

```text
meeting-task-app:data:backup:2026-07-14T14-30-00
```

localStorageはPC・ブラウザプロファイル・オリジンごとに分離されます。たとえばGitHub Pages、Netlify本番URL、`http://localhost:8888`のデータは相互に参照できません。旧ドメインのデータを移行する場合は、旧ドメイン上で同じアプリを開ける状態を維持するか、別途エクスポート／インポート手段を用意してください。

## ロールバック

- アプリのロールバックは Netlify の Deploys から以前のデプロイを publish します。
- DB変更前にNeonのブランチまたはPITR復元ポイントを確認し、復元手順を記録してください。
- 現在の`001_init.sql`は追加的かつ再実行可能な初期スキーマですが、自動down migrationはありません。破壊的変更は既存Functionsとの互換期間を設け、新しい番号のmigrationとして追加してください。
- DBを以前の状態へ戻す場合は、先にNeonのブランチ/PITRへ復元して整合性を確認してから、対応するNetlifyデプロイをpublishします。
- localStorage 移行後のブラウザ内データは `meeting-task-app:data:backup:*` から復元できます。

## 本番デプロイ後の確認

- Google ログインできる
- ログアウトできる
- プロジェクトを作成できる
- 課題を作成、編集、削除できる
- 対応履歴を作成、編集、削除できる
- 別ユーザーのデータが見えない
- サーバーデータが空の場合にlocalStorage移行確認が表示される
- サーバーデータが存在する場合に上書き・マージ・あとでを選択できる
- マージ後に新しい項目と片方だけの項目が保持される
- 上書き時に二段階確認が表示され、対象ユーザーのデータだけが置換される
- Netlify Functions のログにトークン、秘密鍵、DB URL が出ていない

## セキュリティ方針

- 全 API で Firebase ID トークンを検証します。
- 所有者判定は Functions 側で検証した Firebase UID から解決した DB ユーザー ID のみを使います。
- SQL はパラメータ化クエリで実行します。
- すべての CRUD で `user_id` 条件を付与します。
- エラー応答にスタックトレースや接続文字列を含めません。
- リクエストボディは 512KB に制限しています。
