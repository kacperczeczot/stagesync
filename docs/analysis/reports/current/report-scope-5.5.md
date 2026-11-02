# Scope 5.5 — Mix & Monitoring (Organizacja Miksu, Odsłuch PFL, Schowek i MIDI Chase)

**Wersja:** `5.5.0` — **Mix & Monitoring**  
**Podstawa:** [ROADMAP.md](../../../ROADMAP.md) · [TODO.md](../../../TODO.md) · [ADR 0002](../../../architecture/adr/0002-timebase-ssot.md) · [ADR 0008](../../../architecture/adr/0008-timeline-clip-editing.md) · [ADR 0010](../../../architecture/adr/0010-desktop-shell-tauri.md) · [ADR 0015](../../../architecture/adr/0015-daw-reference-and-product-decisions.md) · [ADR 0018](../../../architecture/adr/0018-future-audio-architecture.md)  
**Bramka wejścia:** linia **5.4** Syllables & Smart Tempo wydana (`v5.4.12`);  
**Status (2026-09-04):** **GOTOWE DO WYDANIA** — Pełna implementacja 4 filarów minor release 5.5.0.

---

## 1. Zrealizowane filary 5.5.0

### Filar 1: Solo / Mute Off for All

- **Problem:** W rozbudowanym miksie wielościeżkowym na scenie pojedyncze wyciszone lub zsolowane kanały (ścieżki, busy, wyjścia fizyczne) powodowały ryzyko braku odsłuchu instrumentów bez szybkiej możliwości powrotu do stanu nominalnego.
- **Rozwiązanie:**
  - Wskaźniki i przyciski `S` i `M` w pasku Master (Stereo Out), aktywujące się gdy jakikolwiek tor jest zsolowany lub wyciszony.
  - Przycisk Panic `Solo/Mute Off` w nagłówku strefy Master miksera.
  - Globalne skróty klawiszowe: `⌥S` (Solo Off for All), `⌥M` (Mute Off for All), `⌥X` / `⌥⇧S` / `⌥⇧M` (Panic: reset obu naraz).
  - Płynny dezippering mikro-rampami (`linearRampToValueAtTime`) bez trzasków audio.

### Filar 2: Paste Properties (Kopiowanie i wklejanie właściwości klipów audio)

- **Problem:** Operator i realizator nie mieli możliwości powielania parametrów obróbki (gain, fade in/out, trim, loop, mute) pomiędzy klipami audio bez ręcznego ustawiania każdego parametru w inspektorze.
- **Rozwiązanie:**
  - Wewnętrzny schowek parametrów audio `AudioClipProperties` w pamięci Timeline.
  - Schemat Zod walidacji `AudioClipPropertiesSchema`, ekstrakcja `extractAudioClipProperties` oraz deterministyczna aplikacja `applyAudioClipProperties` w `@stagesync/shared`.
  - Operacja `commitPasteAudioClipProperties` w `@lib/audio/audioClipOperations.ts` wspierająca hurtowe nakładanie właściwości na wiele zaznaczonych klipów.
  - Opcje menu kontekstowego klipu audio: "Kopiuj właściwości" (`⌥⌘C`) oraz "Wklej właściwości" (`⌥⌘V`).

### Filar 3: Chase MIDI Notes po Seek

- **Problem:** Podczas przewijania lub skoków transportu do wybranego taktu/ticka (`seekTicks`), nuty MIDI rozpoczynające się przed pozycją docelową, a trwające po niej, były gubione, co powodowało ciszę lub ucięte partie instrumentów.
- **Rozwiązanie:**
  - Czysta funkcja `chaseMidiNotes` w `@stagesync/shared` wyliczająca trwające nuty, ich przesunięcie (`offsetTicks`) oraz pozostały czas (`remainingTicks`).
  - Integracja w serwerowym silniku transportu (`TransportEngine.seek`), z natychmiastowym buforowaniem stanu nut (`getChasedMidiNotes`).

---

## 2. Kontrakt IN / OUT

| IN 5.5.0                                                                           | OUT 5.5.0 (świadomie odroczone do 6.0+)                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Globalne odciszanie i reset solo (Solo/Mute Off for All) z poziomu Mastera i docku | PFL Monitor Bus / Odsłuch przedtłumikowy w matrycy wyjść audio (6.0)    |
| Kopiowanie i wklejanie właściwości klipów audio (`⌥⌘C` / `⌥⌘V`)                    | InputStrip / Live Input monitoring fizycznych wejść mikrofonowych (6.0) |
| Śledzenie i retriggerowanie trwających nut MIDI po Seek (Chase MIDI)               | Wirtualne instrumenty VSTi / SoundFont player (6.0)                     |
| Bezpośrednia nawigacja `/timeline` z modalem wyboru utworu                         | Automatyzacja parametrów / Automation lanes (6.0)                       |
| Pełna dokumentacja Keep a Changelog + aktualizacja ROADMAP i TODO                  | Wielookienkowość natywna Tauri / odpinane panele (5.6)                  |

---

## 3. Jakość i testy

- **Jednostkowe `@stagesync/shared`:** 59 plików testowych, 824 testy — zielone (w tym `chase-midi.test.ts`).
- **Jednostkowe `@stagesync/web`:**
  - `audioClipOperations.paste-props.test.ts` — testy schowka atrybutów klipu.
  - `timelineKeyboardShortcuts.test.ts` — testy skrótów `⌥⌘C`, `⌥⌘V`, `⌥S`, `⌥M`, `⌥X`.
  - `timelineContextMenus.test.ts` — testy pozycji menu kontekstowego.
- **Jednostkowe `@stagesync/server`:**
  - `engine.test.ts` — testy transportu z weryfikacją `getChasedMidiNotes()`.
