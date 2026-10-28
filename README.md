# 挙上log

筋トレと体重の記録を、サーバーなしで完結させる個人用アプリ。
**https://avocadoisi.github.io/open-workout-memo/**

## コンセプト

「開いて、書いて、閉じる」。アカウントもサーバーも同期もない。
データはブラウザの IndexedDB に置き、静的サイトとして配信する。所有はエクスポートで担保する。

- 記録は 1 セット = 1 レコード（日付 / 種目 / 重量 kg / 回数 / メモ）
- 推定 1RM は Brzycki `weight * 36 / (37 + reps)`。10 回超は参考値と注記
- 種目・部位は UI から追加。削除はアーカイブ（過去の記録は残す）
- 体重などの指標は筋トレと別トラック（単位は重さ / 長さ）。保存は kg / cm 固定
- エクスポートは JSON（インポートで復元）と画像
- やらないこと: ログイン、複数端末同期、サーバー処理、SNS 連携

## 画面

下タブで切り替える。記録（`#/record`）/ 履歴（`#/history`、月カレンダー）/ グラフ（`#/chart`）/ データ（`#/data`）。

## データモデル

```js
exercise:   { id, name, bodyPart, archived }        // 初期は Big3
workoutSet: { id, date, exerciseId, weight, reps, memo }  // date は 'YYYY-MM-DD'、weight は kg
metricDef:  { id, name, unit: 'weight' | 'length' }
metricLog:  { id, date, metricDefId, value }
// export/import: { schemaVersion: 1, exportedAt, exercises, workoutSets, metricDefs, metricLogs }
```

インポートは全置換（確認あり、未知の `schemaVersion` は拒否）。

## 構成

Vanilla JS、ビルドなし、npm 依存なし（画像化のみ html2canvas を CDN から読む）。
`index.html` / `app.js`（ハッシュルーティング）/ `ui.js` / `db.js` / `views/*.js`（各画面）/ `styles.css`。
各 view は `export const view = { id, label, mount(container) }` を出す。
配色は gruvbox light。色は `styles.css` の `--gb-*` にだけ書き、画面側は参照する。

## テストデータ

`sample/test-data.json` を「データ → インポート（全置換）」で読むと、3ヶ月・週2回・300セットの記録が入る（体重・ウエストも）。
インポートは全置換なので、既存データは先にエクスポートすること。

## 開発

ローカルは `python3 -m http.server 8000` → http://localhost:8000/（`file://` では ESM が動かない）。

変更は issue → ブランチ → PR → マージ（`.pi/skills/issue-pr-flow/SKILL.md`）。

デプロイは自動化しない。指示があったときだけ `gh workflow run deploy.yml` を実行する
（マージのたびに CI を走らせないため。Pages の Source は「GitHub Actions」）。
