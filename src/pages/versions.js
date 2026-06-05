import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import manifest from '@site/versioning/manifest.json';

// Manifest is oldest-first; show newest first.
const ALL_VERSIONS = (manifest.versions || []).slice().reverse();

export default function Versions() {
  const {siteConfig} = useDocusaurusContext();
  const {
    docsArchiveUrl = '',
    buildAllVersions = false,
    builtReleasedVersions = [],
    currentDocsPath = '/docs/',
  } = siteConfig.customFields || {};

  const builtSet = new Set(builtReleasedVersions);
  const archive = String(docsArchiveUrl).replace(/\/$/, '');

  // Same-origin link if this version is rendered in this build; otherwise the
  // static archive (or a same-origin /docs/<v>/ rewrite when no archive URL set).
  const urlFor = (version) =>
    buildAllVersions || builtSet.has(version)
      ? `/docs/${version}/`
      : `${archive}/docs/${version}/`;

  const latest = ALL_VERSIONS[0] && ALL_VERSIONS[0].version;

  return (
    <Layout
      title="Documentation versions"
      description="Browse LiteLLM documentation for every released pip version.">
      <main className="container margin-vert--lg">
        <h1>LiteLLM documentation versions</h1>
        <p>
          Each version below matches a published <code>litellm</code> pip
          release. Check your installed version with{' '}
          <code>litellm --version</code> (or <code>pip show litellm</code>) and
          open the matching docs.
        </p>

        <h2>Current</h2>
        <table>
          <tbody>
            <tr>
              <th>main 🚧</th>
              <td>in development (tracks the latest commit)</td>
              <td>
                <Link to={currentDocsPath}>Documentation</Link>
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Released versions ({ALL_VERSIONS.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Released (PyPI)</th>
              <th>Docs</th>
            </tr>
          </thead>
          <tbody>
            {ALL_VERSIONS.map((v) => (
              <tr key={v.version}>
                <th>
                  {v.version}
                  {v.version === latest && (
                    <span className="badge badge--primary" style={{marginLeft: 8}}>
                      latest
                    </span>
                  )}
                </th>
                <td>{(v.pypi_published || '').slice(0, 10)}</td>
                <td>
                  {/* external/archive links use a plain anchor to avoid SPA routing */}
                  {urlFor(v.version).startsWith('http') ? (
                    <a href={urlFor(v.version)}>Documentation</a>
                  ) : (
                    <Link to={urlFor(v.version)}>Documentation</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{marginTop: '2rem'}}>
          <small>
            Historical versions are reconstructed from the documentation as it
            existed when each release was published, and are served from a static
            archive built by CI. See{' '}
            <a href="https://github.com/BerriAI/litellm-docs/blob/main/versioning/README.md">
              versioning/README.md
            </a>{' '}
            for the methodology and its caveats.
          </small>
        </p>
      </main>
    </Layout>
  );
}
