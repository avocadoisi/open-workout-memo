# 挙上log（open-workout-memo）

筋トレと体重の記録を、サーバーなしで完結させる個人用アプリ。

**https://avocadoisi.github.io/open-workout-memo/**
（公開は手動。`gh workflow run deploy.yml` を叩いたときだけビルドが走る）

## コンセプト

「記録したいときに開いて、書いて、閉じる」。アカウントもサーバーも同期もなし。
データはブラウザの IndexedDB に置き、静的サイトとして配信する。
データの所有はエクスポートで担保する（特定のサービスに閉じ込めない）。

- 配信: 静的サイト（GitHub Pages 等）。サーバー処理なし
- 保存: IndexedDB（端末・ブラウザ単位）
- 認証: なし。ログイン不要
- エクスポート: 可能（JSON、トレ内容の画像）。JSON はインポートで復元できる
- 実装: Vanilla JS。ビルドなし、npm 依存なし（画像化のみ html2canvas を CDN から読む）

## 筋トレの要件

- 種目は最初は Big3 のみ（スクワット / ベンチプレス / デッドリフト）
- 部位・種目の追加が簡単にできる（UI から、コード変更なしで）
- 1回の記録: 日付 / 種目 / 重量 / 回数 / メモ（**1セット = 1レコード**、セット間で重量が違ってよい）
- RM 換算（推定 1RM を表示）: Brzycki 式 `weight * 36 / (37 + reps)`。10回超は誤差が大きいので参考値と注記する
- カレンダーベースで過去のトレを参照できる

## 体重・その他の記録（筋トレとは別トラック）

- 体重を日付ごとに記録できる
- 体重以外の指標も追加できる（指標ごとに単位を「重さ / 長さ」から選ぶ）
- 筋トレの記録とは混ぜない（別ストア・別画面）
- 保存単位は kg / cm 固定。lb・inch は表示のときだけ変換する

## やらないこと

- ログイン、複数端末同期、サーバーサイド
- ソーシャル機能、第三者 API 連携

## 既知の制約

- データはブラウザに紐づく。キャッシュ削除や端末変更で消える → エクスポートで担保する
- 秘密情報ではないが、端末を共有する場合はブラウザのプロファイル分離に依存する

## データモデル

```js
// IndexedDB
exercise:     { id, name, bodyPart, archived: false }     // bodyPart は自由文字列。Big3 を初期投入
workoutSet:   { id, date, exerciseId, weight, reps, memo } // 1セット=1レコード。weight は kg
metricDef:    { id, name, unit: 'weight' | 'length' }      // 体重は unit: 'weight'
metricLog:    { id, date, metricDefId, value }             // value は kg または cm
```

export JSON の形:

```js
{ schemaVersion: 1, exportedAt, exercises, workoutSets, metricDefs, metricLogs }
```

- `date` はローカル日付の文字列 `YYYY-MM-DD`（タイムゾーンで日付がずれないように）
- `id` は `crypto.randomUUID()`
- 種目・指標の削除は `archived: true`。過去の記録は残す
- インポートは全置換（確認ダイアログを出す）。`schemaVersion` が未知なら拒否する
- DB のマイグレーションは IndexedDB の `version` と `onupgradeneeded` で行う

## 決定事項

| 論点 | 決定 |
|---|---|
| セットの粒度 | 1セット = 1レコード |
| インポート | あり（JSON 全置換） |
| 画像化 | html2canvas を CDN 読み込み。ビルド無しを維持 |
| 1RM | Brzycki |
| 単位 | 保存 kg/cm、表示のみ変換 |
| 種目・部位 | 部位は自由文字列、削除はアーカイブ |
| PWA / Service Worker | 2版目（初版はオンライン前提） |
| ライセンス | MIT |

## テストデータ

`sample/test-data.json` を「データ → インポート（全置換）」で読み込むと、動作確認用の記録が入る。
2026-08-04〜10-30 の 3ヶ月・週2回（26回）・300セット。1回あたり3種目（スクワット／ベンチプレス／デッドリフト）を3〜5セット、週ごとに重量が上がる。体重・ウエストの指標も同期間分入っている。
（インポートは全置換なので、既存データは消える。先にエクスポートすること）

## 画面

下タブで切り替える。1画面1目的で、情報を詰め込まない。

| 画面 | 置くもの |
|---|---|
| 記録（`#/record`） | セット入力、当日の記録一覧、1RM、画像保存 |
| 履歴（`#/history`） | 月カレンダー、日別の記録、種目フィルタ、ボリューム |
| グラフ（`#/chart`） | 1RM 推移、ボリューム推移、指標（体重など）の推移 |
| データ（`#/data`） | 種目管理、指標管理、エクスポート / インポート |

## ファイル構成

```
index.html       # 骨組み（header / main / nav、html2canvas の CDN 読み込み）
app.js           # ナビ生成とハッシュルーティング（#/record など）
ui.js            # 共通（byId / el / setStatus / estimate1RM / bestSet …）
db.js            # IndexedDB（getAll / put / remove / exportAll / replaceAll）
views/record.js  # 記録
views/history.js # 履歴
views/chart.js   # グラフ（canvas 手書き、ライブラリなし）
views/data.js    # データ
styles.css       # 共通スタイル（画面固有の CSS は各 view 内の <style> に閉じる）
```

各 view は `export const view = { id, label, mount(container) }` を出す。

## 開発

変更は issue → ブランチ → PR → マージの順で行う（`.pi/skills/issue-pr-flow/SKILL.md`）。

## デプロイ

デプロイは自動化しない。**ユーザーの指示があったときだけ**手動で実行する。

- マージ（main への push）ではデプロイ用の pipeline を走らせない
- GitHub Pages の Source は「GitHub Actions」にし、その workflow は `on: workflow_dispatch` のみ
  （「Deploy from a branch」にすると push のたびに自動デプロイされるので使わない）
- 実行: `gh workflow run deploy.yml`
- URL: https://avocadoisi.github.io/open-workout-memo/

理由: マージのたびに CI/デプロイを走らせるとコストがかかるため。記録アプリなので即時反映の必要もない。
