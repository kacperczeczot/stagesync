[Strona główna](../README.md) > [Dokumentacja](README.md) > [Standardy](STANDARDS.md)

---

# Standardy Inżynieryjne Projektu: StageSync

Projekt funkcjonuje w oparciu o architekturę **Monorepo** ([`template-monorepo`](https://github.com/kacperczeczot/template-monorepo)) i przestrzega globalnych standardów centralnej Konstytucji **[`devex-standards`](https://github.com/kacperczeczot/devex-standards)**.

---

## 1. Zgodność ze Standardami Zewnętrznymi

| Standard | Implementacja w Projekcie | Oficjalna Specyfikacja |
| :--- | :--- | :--- |
| **Conventional Commits** | Commitlint + Husky; treść commitów w języku angielskim | [conventionalcommits.org](https://www.conventionalcommits.org/pl/v1.0.0/) |
| **Semantic Versioning** | SemVer (`MAJOR.MINOR.PATCH`) w root [`package.json`](../package.json) | [semver.org](https://semver.org/lang/pl/) |
| **Keep a Changelog** | [`CHANGELOG.md`](../CHANGELOG.md) wg specyfikacji 1.1.0 | [keepachangelog.com](https://keepachangelog.com/pl/1.1.0/) |
| **ADR** | Rejestr Decyzji w [`docs/architecture/adr/`](architecture/adr/README.md) | [adr.github.io](https://adr.github.io/) |
| **EditorConfig** | [`.editorconfig`](../.editorconfig) w root dla spójności IDE | [editorconfig.org](https://editorconfig.org/) |
| **Strategia Testowa** | Szczegółowe progi pokrycia i reguły w [`docs/standards/TESTING.md`](standards/TESTING.md) | — |

---

## 2. Bramki Jakościowe i Walidacja

- **Weryfikacja typowania całego Monorepo:**
  ```bash
  pnpm run check-types
  ```
- **Uruchomienie pełnego pakietu testów jednostkowych i integracyjnych:**
  ```bash
  pnpm run test
  ```

---

## 3. Źródło Prawdy (SSOT)
👉 **[devex-standards / Architecture Rules](https://github.com/kacperczeczot/devex-standards/blob/main/docs/architecture/RULES.md)**
👉 **[devex-standards / Tooling Rules](https://github.com/kacperczeczot/devex-standards/blob/main/docs/tooling/RULES.md)**
