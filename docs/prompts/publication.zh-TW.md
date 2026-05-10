我想開一個小網站，未來透過 AI agent 跟它對話更新內容。網站類型是 publication —— 包含首頁、文章、關於頁、聯絡表單。文章我會持續加，由支援 MCP 的 agent 幫我寫稿、發佈。

請按照 [mantle install Skill]({skill_url}) 在這個空目錄裡 bootstrap 一個 mantle 專案。底下這段結構化內容已經設定完，請直接讀，不要再用同樣的問題訪談我一次。

```yaml
mantle_request:
  mantle_version: "{mantle_version}"
  template_ref: "{template_ref}"
  skill_url: "{skill_url}"
  starter: "publication"
  github_username: "{github_username}"
  locales: {locales}
  project_name: "{project_name}"
  brand: "{brand}"
  description: "{description}"
  origin: "https://example.com"
```

寫檔案前還是要跟我確認幾件事：

- 網站的語氣／視覺調性；如果上面的欄位已經足夠判斷，就簡短確認即可。
- install 階段不要建立 fixture data、`initial-seed.json` 或 welcome post。

**不要**在 install 階段建立 Cloudflare 資源，那是 [provision Skill](https://raw.githubusercontent.com/aotter/mantle/{template_ref}/skills/provision/SKILL.md) 的工作，會在我 review install 結果之後另外跑一次。provision 跑完你會把公開網址、Staff MCP 網址、User MCP 網址交回給我。接著再問我要不要你幫我建立第一批頁面／文章；如果我同意，請透過 Staff MCP/admin authoring 建立，不要直接 seed。

install 結束時請扼要說明專案動了哪些東西，並給我一行 curl 指令確認本地 dev server 起得來。
