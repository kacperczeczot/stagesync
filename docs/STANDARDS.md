[Strona główna](../README.md) > [Dokumentacja](README.md) > [Standardy](STANDARDS.md)

---

# Standardy Inżynieryjne Projektu: StageSync

Projekt funkcjonuje w oparciu o architekturę **Monorepo** ([`template-monorepo`](https://github.com/kacperczeczot/template-monorepo)) i przestrzega globalnych standardów centralnej Konstytucji **[`devex-standards`](https://github.com/kacperczeczot/devex-standards)**.

---

## 1. Zgodność ze Standardami Zewnętrznymi

| Standard | Implementacja w Projekcie | Specyfikacja |
| :--- | :--- | :--- |
| **Conventional Commits** | Commitlint + Husky; treść commitów w języku angielskim | [conventionalcommits.org](https://www.conventionalcommits.org/pl/v1.0.0/) |
| **Semantic Versioning** | SemVer (`MAJOR.MINOR.PATCH`) w root [`package.json`](../package.json) | [semver.org](https://semver.org/lang/pl/) |
| **Keep a Changelog** | [`CHANGELOG.md`](../CHANGELOG.md) wg specyfikacji 1.1.0 | [keepachangelog.com](https://keepachangelog.com/pl/1.1.0/) |
| **ADR** | Rejestr Decyzji w [`docs/architecture/adr/`](architecture/adr/README.md) | [adr.github.io](https://adr.github.io/) |
| **EditorConfig** | [`.editorconfig`](../.editorconfig) w root dla spójności IDE | [editorconfig.org](https://editorconfig.org/) |
| **TSDoc** | Publiczne API w `@stagesync/shared` | [tsdoc.org](https://tsdoc.org/) |
| **JSON:API** | **Nie** — [ADR 0006](architecture/adr/0006-no-json-api.md); kształt: [api/](architecture/api/README.md) | [jsonapi.org/format](https://jsonapi.org/format/) |

---

## 2. Coverage i Bramki Jakościowe (Codecov)

Bramki są **per warstwa** ([`codecov.yml`](../codecov.yml) flags) — **nie** gonimy ogólnego overall %.  
Pełna strategia testowa, architektura i progi modułowe: patrz **[TESTING.md](./TESTING.md)**.

| Flaga | Target (project) | Zakres |
| :--- | :--- | :--- |
| `shared` | ≥ 85% | `packages/shared` |
| `server` | ≥ 75% | `apps/server` |
| `web` | ≥ 85% | `apps/web/src/lib` + `transport` |
| `web-ui` | ≥ 50% | `apps/web/src/shells` |
| `ui` | ≥ 75% | `packages/ui` |

- `apps/web/src/shells/**` i `*.module.css` — powłoki UI weryfikowane przez Playwright E2E (`apps/web/e2e/`), nie liniowy Vitest line %.
- Overall / default Codecov status — **informational** only.

---

## 3. Źródło Prawdy (SSOT)
👉 **[devex-standards / Architecture Rules](https://github.com/kacperczeczot/devex-standards/blob/main/docs/architecture/RULES.md)**
👉 **[devex-standards / Tooling Rules](https://github.com/kacperczeczot/devex-standards/blob/main/docs/tooling/RULES.md)**
