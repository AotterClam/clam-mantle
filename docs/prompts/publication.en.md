I want to ship a small website that I can update by talking to an AI agent. The site should be a publication — landing page, articles, an About page, a contact form. I'll keep adding posts over time; an MCP-capable agent will do the writing and publishing for me.

Use the [clam-cms install Skill]({skill_url}) to bootstrap a clam-cms consumer project in this empty directory. Do not interview me again for things you can read from the structured block below — those are settled.

```yaml
clam_cms_request:
  clam_cms_version: "{clam_cms_version}"
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

Things you should still confirm with me before writing files:

- The brand voice and home / about / contact / first-post copy. Draft a compact preview first (one line of brand intro per page); I'll react and you can adjust.
- Cover image for the welcome post — pick a neutral image that fits the mood, or ask me for a URL.

Do **not** create Cloudflare resources during install — that's the [provision Skill](https://raw.githubusercontent.com/AotterClam/clam-cms/{template_ref}/skills/provision/SKILL.md)'s job and runs as a separate step after I review the install. After provision finishes, you'll hand me back a public URL and an MCP URL; from then on, content operations happen through MCP, not through this chat.

When you're done with install, summarize what changed in the project and give me one curl command to verify the local dev server boots.
