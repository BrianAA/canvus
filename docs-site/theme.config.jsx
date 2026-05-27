export default {
  logo: (
    <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
      <span style={{ 
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Canvus
      </span>
      <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: '0.5rem' }}>SDK Docs</span>
    </span>
  ),
  project: {
    link: 'https://github.com/balfaro01/canvus',
  },
  docsRepositoryBase: 'https://github.com/balfaro01/canvus/tree/main/docs-site',
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Canvus SDK — A headless, framework-agnostic TypeScript SDK for building visual layout editing workspaces." />
      <meta name="og:title" content="Canvus SDK Documentation" />
      <meta name="og:description" content="Build visual HTML editors, CMS page-builders, and A/B testing tools with web-native performance." />
      <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎨</text></svg>" />
    </>
  ),
  footer: {
    content: (
      <span>
        MIT {new Date().getFullYear()} ©{' '}
        <a href="https://github.com/balfaro01/canvus" target="_blank" rel="noopener noreferrer">
          Canvus SDK
        </a>
      </span>
    ),
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  editLink: {
    content: 'Edit this page on GitHub →',
  },
  feedback: {
    content: null,
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Canvus SDK',
    }
  },
}
