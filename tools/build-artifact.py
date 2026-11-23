#!/usr/bin/env python3
"""Bundle the app into one HTML file for publishing as a claude.ai page.

    python3 tools/build-artifact.py            # writes dist/home-budget.html

On claude.ai the page keeps its data in the page's own shared database (see
ArtifactBackend in js/store.js), so Firebase and the service worker are left out.
The page is wrapped in <html>/<head>/<body> by claude.ai, so the output has none.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULES = ['utils.js', 'store.js', 'calc.js', 'charts.js', 'app.js']  # dependency order

IMPORT_RE = re.compile(r"^import\s[\s\S]*?from\s+'[^']+';[ \t]*\n", re.M)
EXPORT_RE = re.compile(r"^export (?=(const|let|function|async function|class) )", re.M)


def bundle_js():
    parts = ["const CONFIG = { firebase: null, householdId: 'home' };"]
    for name in MODULES:
        src = (ROOT / 'js' / name).read_text()
        src = IMPORT_RE.sub('', src)
        src = EXPORT_RE.sub('', src)
        if re.search(r"^\s*(import|export)\s", src, re.M):
            raise SystemExit(f'{name}: unhandled import/export left in bundle')
        parts.append(f'// ── {name} ──\n{src}')
    return '\n'.join(parts)


def body_markup():
    html = (ROOT / 'index.html').read_text()
    body = html[html.index('<body>') + len('<body>'):html.index('</body>')]
    return re.sub(r'\s*<script type="module" src="js/app.js"></script>', '', body).strip()


def main():
    css = (ROOT / 'css' / 'styles.css').read_text()
    out = (
        '<title>Home Budget</title>\n'
        '<meta name="theme-color" content="#2a78d6">\n'
        f'<style>\n{css}\n</style>\n'
        f'{body_markup()}\n'
        f'<script type="module">\n{bundle_js()}\n</script>\n'
    )
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    target = dist / 'home-budget.html'
    target.write_text(out)
    print(f'wrote {target.relative_to(ROOT)} ({len(out) // 1024} KB)')


if __name__ == '__main__':
    main()
