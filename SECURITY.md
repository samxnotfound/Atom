# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x (latest release) | Yes |
| Anything older | No — please update first |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's [Security Advisories](https://github.com/samxnotfound/atom/security/advisories/new). Include:

- The Atom version and your Windows version.
- What the issue allows an attacker to do.
- Steps to reproduce, or a proof of concept.

You can expect an initial response within a week. If the report is valid, a fix will be released as soon as practical and you'll be credited in the release notes unless you ask otherwise.

## What counts

Atom runs entirely on your machine, so the interesting surface is small but real:

- Escalation from a malicious image file placed in `%APPDATA%\Atom\standby\`.
- Path traversal or arbitrary file write through the image import, export, or backup commands.
- Webview escape or command injection through a crafted session title, category name, or imported JSON backup.
- Anything that causes a session, backup, or the database to be silently destroyed.

## What does not count

- The unsigned installer triggering SmartScreen. Code signing requires a paid certificate; this is documented in the README.
- Anyone with access to your unlocked Windows account reading `%APPDATA%\Atom\atom.db`. Atom does not encrypt local data at rest.
- Reports about a missing Content Security Policy unless you can demonstrate an actual exploit — the app loads no remote content.
