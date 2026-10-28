---
name: issue-pr-flow
description: このリポジトリで変更を依頼されたときの作業手順（issue 作成 → 実装 → PR → マージ）。コード修正、機能追加、README 等の文書変更を open-workout-memo で行うときに使う。
---

# issue → PR → merge フロー

変更依頼を受けたら、この順番で進める。例外は初回セットアップのみ。

1. **issue を作る**
   ```sh
   gh issue create --title "<変更内容>" --body "<背景・要件・受け入れ条件>"
   ```
   ユーザーの依頼文をそのまま要件として書き、判断が必要なら issue 本文に選択肢を残す。

2. **ブランチを切る**（main から）
   ```sh
   git switch main && git pull
   git switch -c <type>/<issue番号>-<slug>
   ```
   type は `feat` / `fix` / `docs` / `chore` のいずれか。

3. **実装してコミット**
   - コミットメッセージに `#<issue番号>` を含める。
   - 変更は依頼された範囲だけ。ついでの改善は別 issue にする。

4. **PR を作る**
   ```sh
   git push -u origin <branch>
   gh pr create --title "<変更内容>" --body "Closes #<issue番号>" --base main
   ```

5. **マージ**
   ```sh
   gh pr merge --squash --delete-branch
   ```
   失敗（コンフリクト・CI 赤）したら止めてユーザーに報告する。勝手に force push や merge commit に切り替えない。

6. **後片付け**
   ```sh
   git switch main && git pull
   ```

7. **デプロイ — マージ時にはやらない**

   マージでデプロイを走らせない。ユーザーから「デプロイして」「公開して」と明示的な指示があったときだけ実行する。
   ```sh
   gh workflow run deploy.yml
   ```
   デプロイ workflow は `on: workflow_dispatch` のみにする（push / PR トリガーを書かない）。
   Pages の Source を「Deploy from a branch」にすると push のたびに自動デプロイされるので「GitHub Actions」を使う。
   workflow がまだ無い段階で頼まれたら、先に workflow を作る issue を立てる。
   「マージしたからデプロイしておきます」はしない。

## 守ること

- `main` へ直接 push しない。
- remote は SSH を使う（`git@github.com:avocadoisi/open-workout-memo.git`）。https のままだとシェルからの push が認証で失敗する。
  ```sh
  git remote set-url origin git@github.com:avocadoisi/open-workout-memo.git
  ssh -T git@github.com   # 確認
  ```
- 依頼にない変更を混ぜない。気づいた点は issue だけ立てて報告する。
- マージ後に issue が閉じたか `gh issue view <番号>` で確認する。
- デプロイは指示待ち。無断でデプロイしない。
