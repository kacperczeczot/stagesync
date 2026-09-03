---
name: Reguły Projektowe StageSync Monorepo
description: Główna konstytucja inżynieryjna, architektoniczna i standardy UI dla StageSync Monorepo.
---

# StageSync v5 — Skonsolidowane Reguły Projektowe

Niniejszy plik stanowi **KANONICZNE ŹRÓDŁO PRAWDY (SSOT)** dla rozwoju StageSync — dotyczy ludzi oraz agentów AI (Antigravity).

---

## 🚫 Twarde Zakazy

- **Zakaz Stubów:** Nie wolno dodawać „atrap” funkcji (np. `disabled` przyciski na zapas). Jeśli funkcja nie jest gotowa, nie powinno być jej w UI.
- **Zakaz Tailwind CSS:** Kategoryczny zakaz stosowania Tailwind CSS. Należy używać wyłącznie **CSS Modules** (`*.module.css`) i tokenów `--ss-*`.
- **Zakaz Inline-Styles:** Wyjątkiem są wyłącznie wartości ściśle dynamiczne (np. pozycjonowanie playhead w %).
- **Zakaz Kopiowania Chrome z Legacy:** Nie kopiuj HTML/CSS z v4 1:1. Używaj wyłącznie `@stagesync/ui` + tokeny `--ss-*`.
- **Zakaz Żargonu w Changelog:** W `CHANGELOG.md` zakaz używania statusów operacyjnych typu „G1-G10”, „claim green”, „residual”.
- **Zakaz Samodzielnych Redesignów:** Każda nietrywialna zmiana UI (kolory, IA) wymaga pisemnego uzasadnienia lub prośby PO.
- **Zakaz Nowych Plików w Root:** Nie dodawaj plików w katalogu głównym bez zgody (zgodnie z Kanonem Monorepo DevEx).
- **Właściciel GitHub:** Kanoniczny owner GitHub to **`kacperczeczot`**.

---

## 🏛️ Architektura i SSOT

- **Autorytet Serwera (`apps/server`):** Odpowiada za transport, stan projektu i precyzyjny timing.
- **Playhead Klienta (`apps/web`):** Wygładzanie pozycji odbywa się wyłącznie między tickami serwera. Klient nie posiada własnego zegara muzycznego.
- **Czysty Czas (`@stagesync/shared`):** Funkcje czasowe muszą być czyste (bez `Date.now()`). Kanon: integer **ticks** + stałe **PPQ**.
- **Granice Monorepo:**
  - `apps/server`: API, persystencja, transport.
  - `apps/web`: UI, aplikacja webowa.
  - `apps/desktop`: Kontener Tauri.
  - `packages/shared`: Logika domenowa, czysty czas, schematy Zod (bez zależności od DOM/FS).
  - `packages/ui`: Design system, czyste komponenty bez logiki biznesowej.
  - `data/`: Runtime (projekty, logi).

---

## 💻 Standardy Kodu

- **TypeScript & Zod:** Walidacja na krawędziach (HTTP, IPC, pliki). Strategia: **Fail Fast**.
- **Trunk-based Development:** Domyślnie pracuj na `main`.
- **CSS & UI Density:**
  - Siatka przestrzenna **4pt/8pt** (zmienne `--ss-space-*`).
  - Jednostki `rem` zaokrąglane do siatki 4px/8px.
  - Tokeny kolorów, typografii i odstępów wyłącznie ze zmiennych `--ss-*`.
  - Minimalna strefa dotykowa: 36x36px (desktop), 44x44px (mobile/PWA).
- **APCA & Ergonomia:** Zakaz czystego białego tekstu na czarnym tle (używaj `--ss-color-text`).

---

## 📚 Dokumentacja i Proces

- **Changelog (Keep a Changelog):** Wpisy tylko dla zmian widocznych dla użytkownika. Format: H3 (Dodano/Zmieniono/Naprawiono) + H4 z emoji (np. `#### ⏱️ Timeline & DAW`).
- **TODO Hygiene:** Plik [`docs/TODO.md`](../../docs/TODO.md) zawiera tylko aktywne zadania. Zakaz trzymania zrealizowanych `[x]`.
- **Rejestr Decyzji:** `docs/architecture/adr/`.
- **Standardy Globalne:** Centralna Konstytucja [`devex-standards`](https://github.com/kacperczeczot/devex-standards).
