I want to ship a small website that I can update by talking to an AI agent. The site should be a publication — landing page, articles, an About page, a contact form. I'll keep adding posts over time; an MCP-capable agent will do the writing and publishing for me.

Use the [mantle install Skill]({skill_url}) to bootstrap a mantle consumer project in this empty directory. Do not interview me again for things you can read from the structured block below — those are settled.

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

Things you should still confirm with me before writing files:

- The brand voice / visual mood only, if it is not obvious from the fields above.
- Do not create fixture data, `initial-seed.json`, or a welcome post during install.

Do **not** create Cloudflare resources during install — that's the [provision Skill](https://raw.githubusercontent.com/aotter/mantle/{template_ref}/skills/provision/SKILL.md)'s job and runs as a separate step after I review the install. After provision finishes, you'll hand me back a public URL plus Staff/User MCP URLs. Then ask whether I want help creating the first pages/posts; if I approve, create them through Staff MCP/admin authoring, not by direct seed.

When you're done with install, summarize what changed in the project and give me one curl command to verify the local dev server boots.
