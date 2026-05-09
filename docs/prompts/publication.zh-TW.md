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

- 網站的調性，以及首頁／關於／聯絡／第一篇文章的文案。先給我四行精簡草稿（每頁一句）；我看了會回饋，你再調。
- 第一篇歡迎文章的封面圖 —— 如果沒有特別偏好，挑一張中性、符合調性的圖；要我提供連結時直接問。

**不要**在 install 階段建立 Cloudflare 資源，那是 [provision Skill](https://raw.githubusercontent.com/aotter/mantle/{template_ref}/skills/provision/SKILL.md) 的工作，會在我 review install 結果之後另外跑一次。provision 跑完你會把公開網址、Staff MCP 網址、User MCP 網址交回給我，之後新增／改稿／發佈都透過 Staff MCP 進行，不再透過這個聊天視窗。

install 結束時請扼要說明專案動了哪些東西，並給我一行 curl 指令確認本地 dev server 起得來。
