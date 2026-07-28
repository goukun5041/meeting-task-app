# meeting-task-app

Vue 3 + TypeScript + Vite の静的フロントエンド、Netlify Functions、Neon PostgreSQL、Firebase Authentication で構成する課題管理アプリです。

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
- localStorage `meeting-task-app:data` から Neon への初回移行

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

マイグレーション SQL は `migrations/001_init.sql` です。

## ローカル開発

通常の Vite だけでは Functions が動きません。Functions 込みで確認する場合は Netlify CLI を使います。

```sh
npm install
npm run dev:netlify
```

Vite のみ確認する場合:

```sh
npm run dev
```

## テスト

```sh
npm run test
npm run build
```

## Netlify デプロイ

1. Netlify で新規サイトを作成し、このリポジトリを接続します。
2. Build command は `npm run build`、Publish directory は `dist` です。
3. Functions directory は `netlify/functions` です。`netlify.toml` に定義済みです。
4. Netlify 環境変数を設定します。
5. Neon のマイグレーションを実行します。
6. デプロイ後、Firebase Authentication の承認済みドメインへ Netlify ドメインを追加します。

## GitHub Pages から Netlify への切り替え

- Vite の GitHub Pages 用 `base` は削除済みです。
- GitHub Pages デプロイ workflow は削除済みです。
- GitHub の Pages 設定で公開元を無効化し、Netlify の URL を利用してください。

## localStorage データ移行

旧 localStorage の正式キーは `meeting-task-app:data` です。`meeting-task-app:issues` は移行対象外です。

移行条件:

- ログイン済み
- DB 側にプロジェクトまたは課題が存在しない
- localStorage に `meeting-task-app:data` が存在する
- ユーザーが確認ダイアログで承認する

移行 API は `POST /api/migration/import-local-data` です。Projects、Tasks、Task histories をトランザクションで登録します。成功後、フロントエンドは DB から再取得し、localStorage の元データを日時付きバックアップキーへコピーしてから通常キーを削除します。

バックアップ例:

```text
meeting-task-app:data:backup:2026-07-14T14-30-00
```

## ロールバック

- アプリのロールバックは Netlify の Deploys から以前のデプロイを publish します。
- DB のスキーマ変更は `migrations/001_init.sql` を基準に確認します。
- localStorage 移行後のブラウザ内データは `meeting-task-app:data:backup:*` から復元できます。

## 本番デプロイ後の確認

- Google ログインできる
- ログアウトできる
- プロジェクトを作成できる
- 課題を作成、編集、削除できる
- 対応履歴を作成、編集、削除できる
- 別ユーザーのデータが見えない
- localStorage 移行確認が表示され、承認後に DB へ移行される
- Netlify Functions のログにトークン、秘密鍵、DB URL が出ていない

## セキュリティ方針

- 全 API で Firebase ID トークンを検証します。
- 所有者判定は Functions 側で検証した Firebase UID から解決した DB ユーザー ID のみを使います。
- SQL はパラメータ化クエリで実行します。
- すべての CRUD で `user_id` 条件を付与します。
- エラー応答にスタックトレースや接続文字列を含めません。
- リクエストボディは 512KB に制限しています。
