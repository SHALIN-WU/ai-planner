# AI 旅遊行程小助手

用瀏覽器填目的地和偏好，後端呼叫 Google Gemini 產生行程。API 金鑰只放在伺服器讀得到的 `.env`，不會進到前端。

## 環境

需要 Node.js 18 以上。

## 設定

若還沒有 `.env`，先複製範本：

```powershell
Copy-Item .env.example .env
```

打開 `.env`，填上 [Google AI Studio](https://aistudio.google.com/) 的 API 金鑰：

```
GEMINI_API_KEY=你的金鑰
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.6-flash
```

已經有 `.env` 的話，只補上缺少的那幾行，不要覆蓋原本的 `GEMINI_API_KEY`。

`GEMINI_MODEL` 預設是 `gemini-3.8-flash`。這是目前 AI Studio 模型清單裡、免費額度可用的 Gemini Flash。主模型回 HTTP 503 時，該段行程會改用 `GEMINI_FALLBACK_MODEL` 再打一次；沒有這一行時，仍用主模型重試。若要更換：

1. 打開 [Google AI Studio](https://aistudio.google.com/)，在模型選單查看要使用的 Flash 模型。
2. 把畫面上的模型代碼（例如 `gemini-3.8-flash`）貼到 `.env` 的 `GEMINI_MODEL=` 後面。
3. 存檔後重新執行 `npm run dev`。只改 `.env` 不用重新 `npm run build`。

## 啟動

在專案資料夾執行：

```powershell
npm install
npm run build
npm run dev
```

`npm run build` 會把 `frontend/src` 編成瀏覽器載入的 `frontend/js`。接著用瀏覽器打開：

http://localhost:3000/ai-planner.html

請用這個網址。若直接用檔案總管打開 html，頁面呼叫不到 `/api/plan`。

這台電腦的 PowerShell 會擋下 `npm.ps1`，而且 `node` 不在 PATH。本機請改用下面這兩個指令，不要打 `npm`：

```powershell
& "C:\Users\user\AppData\Local\nodejs-portable\node-v24.22.1-win-x64\node.exe" .\node_modules\typescript\bin\tsc -p tsconfig.json
& "C:\Users\user\AppData\Local\nodejs-portable\node-v24.22.1-win-x64\node.exe" server\index.js
```

第一行就是 `tsc -p tsconfig.json`。`node_modules\.bin\tsc.cmd` 會被系統擋下，不要用它。

## 地圖路線

站與站之間的路線使用 [OSRM](https://project-osrm.org/) 公開示範伺服器 `https://router.project-osrm.org`。它不需要 API 金鑰，只提供步行和開車，而且有使用限制。瀏覽器會把查過的路線暫存在 localStorage，並把請求隔開。

正式上線請自架 OSRM，或改用付費路線服務。不要依賴這台公開示範伺服器。

## 確認 /api/plan

保持 `npm run dev` 執行中，另開一個終端機，在專案資料夾執行：

```powershell
curl.exe -s -X POST http://localhost:3000/api/plan -H "Content-Type: application/json" -d '{"destination":"Kyoto","startDate":"2026-11-10","endDate":"2026-11-10","travelers":2,"budget":{"amount":8000,"currency":"TWD"},"interests":[],"pace":"relaxed","note":""}'
```

成功時回應裡有 `plan`。這筆範例是同一天往返，所以 `plan.days` 應該正好 1 天，`date` 為 `2026-11-10`，而且當天有地點。請用 `curl.exe`，不要用 `curl`，因為 PowerShell 會把 `curl` 指到別的指令。

失敗時回應裡有 `error` 與 `code`：

- `quota`：免費額度用完，或短時間內請求太多次
- `network`：連不到 Gemini（例如 DNS 失敗、連線被拒或連線中斷）
- `timeout`：等待模型回覆超過時間。超過 2 天的行程會分成每段最多 2 天依序產生
- `config`：`.env` 的模型名稱或 API 金鑰無法使用
- `invalid`：模型回傳的行程格式不正確，或景點重複（該段會自動重試 1 次）
- `bad_request`：送出的條件缺少欄位或格式不對

頁面上的「產生行程」也是呼叫這支 API。成功後結果頁不會出現「示範資料」；失敗時可按「改用示範資料」看原本的東京範例行程。

## GitHub Pages 與 Cloudflare Worker

本機 `http://localhost:3000/ai-planner.html` 仍呼叫 Express 的 `/api/plan` 與 `/api/geocode`，不需要通行碼。GitHub Pages 上的頁面改呼叫 Cloudflare Worker。Gemini 金鑰與通行碼只用 `wrangler secret put` 放進 Cloudflare，不寫進檔案。

Pages 用 `.github/workflows/pages.yml` 把 `frontend/` 發佈出去。在儲存庫的 Pages 設定裡，來源選 **GitHub Actions**。

Worker 的每日上限是 `wrangler.toml` 的 `DAILY_LIMIT = "30"`，以台北日期計算。允許的瀏覽器來源寫在同一個檔案的 `ALLOWED_ORIGINS`，目前包含本機與 `https://shalin-wu.github.io`（只有網域，不含專案路徑）。

Pages 上的頁面呼叫 `https://ai-planner.shalin-wu.workers.dev`。這個網址寫在 `frontend/src/planner/remote.ts`，改完要再執行上面的 `tsc -p tsconfig.json`。通行碼存在這個瀏覽器的 `localStorage`（鍵名 `ai-planner-passcode`），可用畫面上的「清除通行碼」刪掉。

Wrangler 請用完整路徑的 `npx.cmd`，並加上系統憑證。不要打 `npx` 或 `npm`：

```powershell
$env:NODE_OPTIONS="--use-system-ca"
& "C:\Users\user\AppData\Local\nodejs-portable\node-v24.22.1-win-x64\npx.cmd" wrangler --version
```
