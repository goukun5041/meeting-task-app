# 課題管理アプリ 設計書

## 1. アプリの目的

個人または小規模チームで使える、シンプルな課題管理アプリを作る。

最初の段階では、以下を目的にする。

```txt
- 課題を登録できる
- 課題を一覧で確認できる
- ステータス・優先度・期限で状況を把握できる
- 課題を編集・削除できる
- ブラウザ内にデータを保存できる
- DBなしで動く
```

将来的には、以下に拡張できるようにする。

```txt
- IndexedDB対応
- バックエンドAPI対応
- ログイン対応
- プロジェクト別管理
- コメント・履歴管理
- 添付ファイル
- GitHub Issues連携
```

---

## 2. 技術構成

### 初期構成

```txt
Vue 3
TypeScript
Vite
Vuetify
Pinia
localStorage
```

### 理由

`Vue 3 + TypeScript + Vite` は、軽く始めやすく、個人開発向き。

`Vuetify` は業務アプリっぽいUIを作りやすい。

`Pinia` は状態管理を整理しやすく、あとでAPI連携に置き換えやすい。

### localStorage と IndexedDB の方針

最初は `localStorage` でよい。

理由:

```txt
- 実装が簡単
- 課題管理アプリの初期版なら十分
- JSON保存で扱いやすい
- デバッグしやすい
```

ただし、以下をやりたくなったら IndexedDB に移行する。

```txt
- データ件数が増える
- 添付ファイルを保存したい
- 検索性能を上げたい
- 複雑な履歴管理をしたい
```

---

## 3. 画面構成

初期版で作る画面は以下。

```txt
1. 課題一覧画面
2. 課題登録・編集ダイアログ
3. 課題詳細ダイアログ
```

最初はルーティングを増やしすぎず、一覧画面を中心にした単画面アプリにする。

---

## 4. 画面イメージ

### 課題一覧画面

```txt
┌──────────────────────────────────────────────┐
│ 課題管理                                      │
│ [新規課題] [検索キーワード____] [条件クリア]  │
├──────────────────────────────────────────────┤
│ ステータス: [すべて v] 優先度: [すべて v]     │
│ 期限: [すべて v]                             │
├──────────────────────────────────────────────┤
│ ID | タイトル | ステータス | 優先度 | 期限 | 操作 │
│ 1  | ○○修正   | 対応中     | 高     | 7/12 | 詳細 編集 │
│ 2  | △△確認   | 未着手     | 中     | 7/20 | 詳細 編集 │
└──────────────────────────────────────────────┘
```

### 課題登録・編集ダイアログ

```txt
┌────────────────────────────┐
│ 課題登録                    │
├────────────────────────────┤
│ タイトル                    │
│ [____________________]      │
│ 内容                        │
│ [____________________]      │
│ ステータス                  │
│ [未着手 v]                  │
│ 優先度                      │
│ [中 v]                      │
│ 期限日                      │
│ [2026/07/31]                │
├────────────────────────────┤
│ [キャンセル]        [保存]   │
└────────────────────────────┘
```

### 課題詳細ダイアログ

```txt
┌────────────────────────────┐
│ 課題詳細                    │
├────────────────────────────┤
│ ID: 1                       │
│ タイトル: ○○修正            │
│ ステータス: 対応中           │
│ 優先度: 高                   │
│ 期限: 2026/07/31             │
│ 作成日時: 2026/07/08 12:30   │
│ 更新日時: 2026/07/08 12:45   │
│                              │
│ 内容                         │
│ ○○のレイアウトを修正する。   │
├────────────────────────────┤
│ [閉じる] [編集]              │
└────────────────────────────┘
```

---

## 5. データ設計

### Issue型

```ts
export type IssueStatus =
  | '未着手'
  | '対応中'
  | 'レビュー待ち'
  | '完了'
  | '保留'

export type IssuePriority =
  | '低'
  | '中'
  | '高'
  | '緊急'

export interface Issue {
  id: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  dueDate: string | null
  createdAt: string
  updatedAt: string
}
```

### 各項目の意味

| 項目 | 内容 |
|---|---|
| id | UUID または timestamp ベース。画面表示用には連番風でもよい |
| title | 必須。一覧で一番重要な項目 |
| description | 任意。詳細内容 |
| status | 必須。初期値は「未着手」 |
| priority | 必須。初期値は「中」 |
| dueDate | 任意。未設定なら null |
| createdAt | 登録日時 |
| updatedAt | 更新日時 |

---

## 6. ステータス設計

### ステータス一覧

```txt
未着手
対応中
レビュー待ち
完了
保留
```

### ステータスの意味

| ステータス | 意味 |
|---|---|
| 未着手 | まだ作業していない |
| 対応中 | 現在作業している |
| レビュー待ち | 自分の作業は終わり、確認待ち |
| 完了 | 対応が完了している |
| 保留 | いったん止めている |

---

## 7. 優先度設計

### 優先度一覧

```txt
低
中
高
緊急
```

### 並び順

```txt
緊急 > 高 > 中 > 低
```

一覧では、優先度が高いものほど目立つようにする。

---

## 8. 初期版の機能一覧

### 必須機能

```txt
- 課題一覧表示
- 課題登録
- 課題編集
- 課題削除
- 課題詳細表示
- localStorage保存
- ステータス絞り込み
- 優先度絞り込み
- キーワード検索
```

### できれば初期版で入れる機能

```txt
- 期限切れ表示
- 完了済みを薄く表示
- 件数サマリ
- 条件クリアボタン
```

### 後回しでよい機能

```txt
- ドラッグ＆ドロップ
- カンバン表示
- コメント
- 変更履歴
- 添付ファイル
- ログイン
- DB保存
- API連携
```

---

## 9. ファイル構成案

```txt
meeting-task-app
├─ package.json
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ src
│  ├─ main.ts
│  ├─ App.vue
│  ├─ plugins
│  │  └─ vuetify.ts
│  ├─ types
│  │  └─ issue.ts
│  ├─ constants
│  │  └─ issueOptions.ts
│  ├─ stores
│  │  └─ issueStore.ts
│  ├─ utils
│  │  ├─ date.ts
│  │  └─ storage.ts
│  ├─ components
│  │  ├─ IssueFilterBar.vue
│  │  ├─ IssueTable.vue
│  │  ├─ IssueFormDialog.vue
│  │  ├─ IssueDetailDialog.vue
│  │  └─ IssueStatusChip.vue
│  └─ views
│     └─ IssueListView.vue
└─ README.md
```

---

## 10. 各ファイルの役割

### `src/types/issue.ts`

課題データの型定義を置く。

```txt
Issue
IssueStatus
IssuePriority
IssueFormInput
```

### `src/constants/issueOptions.ts`

ステータスや優先度の選択肢を定義する。

```txt
ISSUE_STATUSES
ISSUE_PRIORITIES
```

### `src/stores/issueStore.ts`

Pinia store。

担当:

```txt
- 課題一覧の保持
- localStorageから読み込み
- localStorageへ保存
- 課題追加
- 課題更新
- 課題削除
- 絞り込み済み一覧の算出
```

### `src/utils/storage.ts`

localStorage操作をまとめる。

```txt
loadIssues()
saveIssues()
```

### `src/utils/date.ts`

日付表示や期限切れ判定をまとめる。

```txt
formatDate()
formatDateTime()
isOverdue()
```

### `src/views/IssueListView.vue`

課題一覧画面の親コンポーネント。

担当:

```txt
- フィルター状態
- ダイアログ開閉
- テーブル表示
- 新規登録・編集・詳細表示の制御
```

### `src/components/IssueTable.vue`

一覧テーブル。

担当:

```txt
- 課題一覧表示
- 詳細ボタン
- 編集ボタン
- 削除ボタン
```

### `src/components/IssueFormDialog.vue`

登録・編集ダイアログ。

担当:

```txt
- 入力フォーム
- 必須チェック
- 保存ボタン
```

### `src/components/IssueDetailDialog.vue`

詳細表示ダイアログ。

### `src/components/IssueFilterBar.vue`

検索・ステータス・優先度などの絞り込みUI。

### `src/components/IssueStatusChip.vue`

ステータス表示用のチップ。

---

## 11. 状態管理設計

Pinia store は以下のような構成にする。

```ts
interface IssueState {
  issues: Issue[]
}
```

主な actions:

```ts
load()
createIssue(input)
updateIssue(id, input)
deleteIssue(id)
```

主な getters:

```ts
sortedIssues
getIssueById
summary
```

絞り込みは store に持たせてもよいが、初期版では画面側で持つ方がわかりやすい。

理由:

```txt
- フィルター条件は画面UIの状態に近い
- storeを複雑にしすぎない
- 後でURLクエリ化しやすい
```

---

## 12. バリデーション設計

### 課題登録・編集

必須:

```txt
タイトル
ステータス
優先度
```

任意:

```txt
内容
期限日
```

### ルール

```txt
タイトル:
- 必須
- 100文字以内

内容:
- 1000文字以内

期限日:
- 未入力可
- 入力する場合は日付形式
```

---

## 13. localStorage設計

### キー名

```txt
meeting-task-app:issues
```

### 保存形式

```json
[
  {
    "id": "issue-001",
    "title": "サンプル課題",
    "description": "これはサンプルです。",
    "status": "未着手",
    "priority": "中",
    "dueDate": "2026-07-31",
    "createdAt": "2026-07-08T12:00:00.000Z",
    "updatedAt": "2026-07-08T12:00:00.000Z"
  }
]
```

### 初回データ

初期表示で空でもよいが、開発中はサンプル課題を数件入れると確認しやすい。

おすすめは以下。

```txt
初期データはコード内に用意
初回起動時のみlocalStorageに保存
```

---

## 14. UI設計方針

Vuetifyで業務アプリ風にする。

### 使用コンポーネント候補

```txt
v-app
v-app-bar
v-main
v-container
v-card
v-btn
v-data-table
v-dialog
v-form
v-text-field
v-textarea
v-select
v-chip
v-alert
v-snackbar
```

### レイアウト方針

```txt
- 画面上部にタイトルと新規登録ボタン
- フィルターはカード内に横並び
- 一覧は v-data-table
- 操作は行右端
- 登録・編集はダイアログ
- 詳細も最初はダイアログ
```

---

## 15. 実装フェーズ

### Phase 1: 最小構成

```txt
- Viteプロジェクト作成
- Vuetify導入
- Pinia導入
- 課題一覧を固定データで表示
```

### Phase 2: localStorage対応

```txt
- Issue型定義
- issueStore作成
- localStorage読み書き
- 初期サンプルデータ
```

### Phase 3: 登録・編集・削除

```txt
- IssueFormDialog作成
- 新規登録
- 編集
- 削除確認
```

### Phase 4: 検索・絞り込み

```txt
- キーワード検索
- ステータス絞り込み
- 優先度絞り込み
- 条件クリア
```

### Phase 5: 見た目改善

```txt
- ステータスチップ
- 優先度チップ
- 期限切れ表示
- 件数サマリ
- 空状態表示
```

### Phase 6: 拡張候補

```txt
- カンバン表示
- コメント
- 変更履歴
- IndexedDB移行
- バックエンドAPI化
```

---

## 16. Hermesへ投げる初期実装プロンプト

```txt
/workspace に Vue 3 + TypeScript + Vite + Vuetify + Pinia の課題管理アプリを新規作成してください。

前提:
- /workspace は空の Git リポジトリです。
- フロントエンドのみで開始します。
- DBはまだ使いません。
- 保存先はまず localStorage にします。
- 後で IndexedDB や API に差し替えやすい構成にしてください。

作りたいアプリ:
- 個人または小規模チーム向けの課題管理アプリ
- 業務アプリっぽい見た目
- 一覧中心の単画面アプリ

技術構成:
- Vue 3
- TypeScript
- Vite
- Vuetify
- Pinia
- localStorage

課題データ:
- ID
- タイトル
- 内容
- ステータス
- 優先度
- 期限日
- 作成日時
- 更新日時

ステータス:
- 未着手
- 対応中
- レビュー待ち
- 完了
- 保留

優先度:
- 低
- 中
- 高
- 緊急

初期実装する画面・機能:
- 課題一覧画面
- 課題登録ダイアログ
- 課題編集ダイアログ
- 課題詳細ダイアログ
- 課題削除
- キーワード検索
- ステータス絞り込み
- 優先度絞り込み
- localStorage保存
- サンプルデータ初期投入

実装方針:
- 実装前にファイル構成案を提示してください。
- その後、必要なファイルを作成・編集してください。
- npm install や npm run dev は、必要なコマンドだけ提示してください。実行はユーザーがPowerShell側で行います。
- 長いログを読み込まないでください。
- node_modules は探索しないでください。
- まずは Phase 1〜3 までを実装してください。
```

---

## 17. 最初のゴール

最初のゴールは以下。

```txt
ブラウザで課題一覧が表示される
新規課題を登録できる
登録した課題がlocalStorageに保存される
編集・削除できる
```

ここまでできれば、アプリとして一旦成立。

次に検索・絞り込み・見た目改善を足す。
