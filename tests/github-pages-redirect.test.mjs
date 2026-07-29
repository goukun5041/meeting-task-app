import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const productionUrl = 'https://meeting-task-app.netlify.app/'

describe('GitHub Pages redirect', () => {
  it('redirects the legacy Pages URL to Netlify while preserving query and hash', async () => {
    const html = await readFile(new URL('../github-pages/index.html', import.meta.url), 'utf8')

    expect(html).toContain(`<link rel="canonical" href="${productionUrl}">`)
    expect(html).toContain(`content="0; url=${productionUrl}"`)
    expect(html).toContain("target.search = window.location.search")
    expect(html).toContain("target.hash = window.location.hash")
    expect(html).toContain('window.location.replace(target.href)')
    expect(html).toContain(`href="${productionUrl}"`)
  })

  it('deploys only the static redirect artifact from main', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/deploy-pages-redirect.yml', import.meta.url),
      'utf8',
    )

    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v3')
    expect(workflow).toContain('path: ./github-pages')
    expect(workflow).toContain('uses: actions/deploy-pages@v4')
    expect(workflow).not.toContain('npm run build')
  })

  it('links the production Netlify app from the README', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')

    expect(readme).toContain(`[${productionUrl}](${productionUrl})`)
  })
})
