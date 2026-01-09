# ブランチ保護ルール設定ガイド

このドキュメントでは、`main`ブランチへの直接プッシュを禁止し、PRとCIを必須とするブランチ保護ルールの設定手順を説明します。

## 設定手順

### 1. リポジトリ設定を開く

1. GitHubリポジトリのページを開く
2. **Settings** タブをクリック
3. 左メニューから **Branches** を選択

### 2. ブランチ保護ルールを追加

1. **Add branch protection rule** または **Add rule** をクリック
2. **Branch name pattern** に `main` と入力

### 3. 保護ルールを設定

以下のオプションにチェックを入れます：

#### 必須設定

- [x] **Require a pull request before merging**
  - mainブランチへの直接プッシュを禁止し、PRを必須にする
  - サブオプション:
    - [x] **Require approvals** (任意): レビュー承認を必須にする場合
    - 承認数: 1 (推奨)

- [x] **Require status checks to pass before merging**
  - CIが成功しないとマージできないようにする
  - [x] **Require branches to be up to date before merging**
  - **Status checks that are required** で以下を追加:
    - `test (macos-latest)`
    - `test (windows-latest)`

#### 推奨設定

- [x] **Do not allow bypassing the above settings**
  - 管理者も含めてルールを適用する場合

- [x] **Require conversation resolution before merging** (任意)
  - すべてのコメントが解決されるまでマージを禁止

### 4. ルールを保存

**Create** または **Save changes** をクリックして保存

## 設定後の動作

| 操作 | 許可 |
|------|------|
| mainブランチへの直接push | 禁止 |
| PRの作成 | 許可 |
| CIが失敗した状態でのマージ | 禁止 |
| CIが成功した状態でのマージ | 許可 |

## CI Status Checks について

このリポジトリでは `.github/workflows/ci.yml` で以下のチェックが実行されます：

- TypeScriptの型チェック
- Rustのコンパイルチェック
- Tauriアプリのビルド（macOS, Windows）

すべてのチェックが成功しないとPRをマージできません。

## 参考リンク

- [GitHub Docs: ブランチ保護ルールの管理](https://docs.github.com/ja/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
