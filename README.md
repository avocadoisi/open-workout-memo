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
- 演出より速度。画面切替や配色変更のフェードはしない。動きは操作の手応え（押した・保存できた）にだけ使い、待たせない
- やらないこと: ログイン、複数端末同期、サーバー処理、SNS 連携

## 画面

ホーム（`#/`）にプレビュー付きのタイルが並び、押すと全画面で開く。開いた画面のヘッダーには「最小化」があり、ホームに戻る。記録（`#/record`）/ 履歴（`#/history`、カレンダー・種目ごと・部位ごと）/ グラフ（`#/chart`、1RM とボリュームの推移。タップで拡大し、ピンチ / ホイールで時間軸を伸縮）/ データ（`#/data`、エクスポート / インポート / 全削除）/ コンセプト（`#/about`、タイトル横の「?」）/ 設定（`#/settings`、ヘッダーの歯車。配色とタイトル）。この2つはタイルには並べない。

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

Vanilla JS、ビルドなし、npm 依存なし（画像化の html2canvas、グラフの Chart.js、見出しフォントの Dela Gothic One だけ CDN から読む）。
`index.html` / `app.js`（ハッシュルーティング）/ `dom.js` / `db.js` / `prefs.js` / `training.js` / `views/*.js`（各画面）/ `styles.css`。
各 view は `export const view = { id, label, mount(container) }` を出す。
配色はヘッダーの丸3つで切り替える（gruvbox light / catppuccin latte / tokyonight night）。色は `styles.css` の `--gb-*` にだけ書き、画面側は参照する。

`manifest.json` / `sw.js` で PWA にしてある。一度開けば機内モードでも記録・履歴・グラフが開く（手元のファイルは network-first、CDN はキャッシュ優先なので、版数を手で上げなくても更新は届く）。

## テストデータ

「データ → インポート」で読むと、記録の入った状態を試せる。

- `sample/test-data.json` — 3ヶ月・週2回・300セット（体重・ウエストも）
- `sample/test-data-3years.json` — 3年・週2回・3,630セット（体重 192件）。動作の重さを見るとき用

インポートは全置換なので、既存データは先にエクスポートすること。
試したあとはデータ画面の一番下の「全削除」で戻せる（タイトルを入力すると消え、次に開くと Big3 と体重だけの初期状態になる）。

## 開発

ローカルは `python3 -m http.server 8000` → http://localhost:8000/（`file://` では ESM が動かない）。
テストは `node --test`（`training.test.mjs`、依存なし）。
PWA の挙動（オフライン）は https か localhost でしか試せない。

変更は issue → ブランチ → PR → マージ（global の `dev-workflow` skill）。

## デプロイ

マージではデプロイしない。指示があったときだけ `gh workflow run deploy.yml` を実行する
（マージのたびに CI を走らせないため。Pages の Source は「GitHub Actions」）。
