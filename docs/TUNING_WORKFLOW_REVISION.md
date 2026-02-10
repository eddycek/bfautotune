# Revize tuningového workflow: Dvou-letový iterativní postup

> **Status**: Navrhováno
> **Datum**: 2026-02-10
> **Oblast**: Tuning Wizard, Flight Guide, Analysis Engine, IPC, Apply Flow

---

## 1. Proč potřebujeme tuto změnu

### 1.1 Problém: Filtry ovlivňují kvalitu PID dat

Aktuální wizard analyzuje filtry i PID ze stejného letu — z jednoho blackbox záznamu.
To znamená, že step response data pro PID analýzu jsou nahrána se starými (potenciálně
špatnými) filtry. Šumový gyro signál kontaminuje step response metriky:

- **Falešně vysoký overshoot** — šumové špičky kolem setpointu vypadají jako oscilace
- **Falešný ringing** — šum se interpretuje jako bounce-back, což vede ke zbytečnému zvýšení D
- **Nepřesný rise time** — šum maskuje skutečný náběh gyro signálu
- **Nepřesný settling time** — šum zpožďuje detekci ustálení (tolerance ±2%)

Po aplikování obou změn najednou nikdy nevalidujeme PID doporučení na čistém signálu.

### 1.2 Problém: Hover je nedostatečný pro analýzu filtrů

Aktuální flight guide žádá uživatele o hover (10–15s + 5–10s). `SegmentSelector` hledá
segmenty s throttle 15–75 % a gyro std < 50 °/s — tedy pouze klidné hovery.

Komunita (PIDtoolbox, Oscar Liang, UAV Tech, roninUAV) jednoznačně doporučuje **throttle
sweep** (pomalé zvýšení plynu od hoveru do 100 % za 5–10 s). Důvody:

- Šum motorů se mění s RPM. Hover zachytí jen jeden bod na křivce.
- Rezonance rámu se projeví jako konstantní frekvence přes celý rozsah plynu — z jednoho
  hoveru to nelze identifikovat.
- Komunita explicitně říká: *"Avoid random cruising or just hovering — these produce logs
  with very little meaningful information"* pro filter tuning.

### 1.3 Komunitní standard: Filtry první, PID druhé

Oscar Liang, PIDtoolbox i UAV Tech doporučují iterativní postup:

1. **Let 1**: Sběr dat pro filtry → analýza → aplikovat filtry → reboot
2. **Let 2**: Sběr dat pro PID (s čistými filtry) → analýza → aplikovat PID → reboot
3. **Volitelně let 3**: Ověření

Tento přístup je konvergentní: každý krok pracuje s daty, která reflektují předchozí
změny. Naproti tomu současný jednoletový přístup není konvergentní — PID analýza běží na
datech, která neodpovídají doporučeným filtrům.

---

## 2. Identifikované nedostatky (6 položek)

### N1 — Chybí throttle sweep pro analýzu filtrů [KRITICKÉ]

**Aktuální stav**: Flight guide žádá pouze hover. `SegmentSelector` filtruje jen klidné
segmenty (throttle 15–75 %, gyro std < 50 °/s).

**Problém**: FFT vidí šum jen při jedné úrovni plynu. `FilterRecommender` může doporučit
filtry, které jsou na jiných úrovních plynu příliš agresivní nebo příliš slabé.

**Řešení**: Přidat fázi throttle sweep do filter flight guide. Rozšířit `SegmentSelector`
o režim throttle-ramp, který nebude filtrovat jen klidné hovery, ale i plynulé náběhy plynu.

### N2 — Chybí doporučení logging rate a debug mode [KRITICKÉ]

**Aktuální stav**: Aplikace nikde nespecifikuje, jaký logging rate nebo debug mode použít.

**Problém**: Při 500 Hz logging rate je Nyquistův limit 250 Hz — FFT nevidí motor noise
(typicky 200–600 Hz). Bez `GYRO_SCALED` debug mode FFT analyzuje post-filter data, což
maří účel celé analýzy.

**Řešení**: Přidat pre-flight checklist s doporučením: logging rate 2 kHz, debug mode
`GYRO_SCALED`. Ideálně validovat tyto hodnoty z BBL headeru po parsování.

### N3 — Chybí varování o teplotě motorů [KRITICKÉ]

**Aktuální stav**: Po aplikování změn filtrů nebo PID není žádné upozornění.

**Problém**: Agresivnější filtry (vyšší cutoff) nebo vyšší PID gainy mohou způsobit
přehřívání motorů. Komunita doporučuje kontrolu teploty po každém tuning letu.

**Řešení**: Přidat safety warning do post-apply obrazovky a do flight guide dalšího cyklu.

### N4 — Chybí mix intenzity stick inputů [STŘEDNÍ]

**Aktuální stav**: Guide říká "stick fully left, center, fully right, center".

**Problém**: Plasmatree PID-Analyzer rozlišuje vstupy nad a pod 500 °/s. Brian White's
"basement tuning" používá mírné vstupy. Pouze full-stick snapy zachytí jen
high-authority response.

**Řešení**: Doporučit mix: "Některé snapy s polovičním výchylem, některé s plným".

### N5 — Chybí poznámka o rate profilu [STŘEDNÍ]

**Aktuální stav**: Guide nezmiňuje rate profil. `StepDetector` požaduje minimum 100 °/s
magnitude a 500 °/s/s derivaci.

**Problém**: Uživatel s velmi nízkým max rate (< 300 °/s) nebo agresivním RC smoothing
může produkovat weak step data, kde `StepDetector` buď zachytí málo stepů, nebo
zachytí zkreslené odpovědi.

**Řešení**: Přidat tip: "Použijte svůj běžný rate profil. Při max rate pod 300 °/s
mohou být step data nedostatečná."

### N6 — Feedforward interference ve step response [NÍZKÉ]

**Aktuální stav**: `StepMetrics` a `PIDRecommender` nerozlišují příspěvek feedforward
od P/D odezvy.

**Problém**: Feedforward zrychluje inicální response a může způsobit overshoot, který
`PIDRecommender` nesprávně přiřadí příliš vysokému P gainu.

**Řešení**: Přidat poznámku do PID flight guide: "Pro nejpřesnější výsledky zvažte dočasné
vypnutí feedforward před testovacím letem." Dlouhodobě: rozšířit `StepMetrics` o detekci
FF příspěvku z BBL headeru.

---

## 3. Implementační plán

### Přehled architektury změn

```
PŘED (aktuální):                    PO (nový):

1 let → 1 log → Wizard:            Let 1 → Log A → Filter Wizard:
  Flight Guide                        Filter Flight Guide
  Session Select                      Session Select
  Filter Analysis                     Filter Analysis
  PID Analysis                        Filter Summary + Apply
  Summary + Apply vše                 ↓ FC reboot

                                    Let 2 → Log B → PID Wizard:
                                      PID Flight Guide
                                      Session Select
                                      PID Analysis
                                      PID Summary + Apply
                                      ↓ FC reboot
```

---

### Krok 1: Nové typy a konstanty pro tuning mode

**Soubory k úpravě**:
- `src/renderer/hooks/useTuningWizard.ts`
- `src/shared/constants/flightGuide.ts`

**Změny**:

1.1. V `useTuningWizard.ts` rozšířit typ `WizardStep` a přidat nový typ `TuningMode`:

```typescript
export type TuningMode = 'filter' | 'pid' | 'full';

export type WizardStep = 'guide' | 'session' | 'filter' | 'pid' | 'summary';
// WizardStep zůstává stejný, ale wizard bude přeskakovat kroky
// podle zvoleného TuningMode
```

1.2. V `useTuningWizard.ts` přidat parametr `mode: TuningMode` do `useTuningWizard()`:
- Mode `'filter'`: kroky `guide → session → filter → summary`, PID krok se přeskočí
- Mode `'pid'`: kroky `guide → session → pid → summary`, filter krok se přeskočí
- Mode `'full'`: stávající chování (zpětná kompatibilita)

1.3. V `flightGuide.ts` rozdělit `FLIGHT_PHASES` na dva sady:

```typescript
export const FILTER_FLIGHT_PHASES: FlightPhase[] = [
  {
    title: 'Take off & Hover',
    duration: '10–15 sec',
    description: 'Hover steadily at mid-throttle. Stay as still as possible. This gives clean baseline noise data.',
  },
  {
    title: 'Throttle Sweep',
    duration: '2–3 times',
    description: 'Slowly increase throttle from hover to full power over 5–10 seconds, then reduce back. Repeat 2–3 times. This reveals how noise changes with motor speed.',
  },
  {
    title: 'Final Hover',
    duration: '5–10 sec',
    description: 'Hover again for additional data.',
  },
  {
    title: 'Land',
    duration: '',
    description: 'Done! Total flight: 30–45 seconds.',
  },
];

export const PID_FLIGHT_PHASES: FlightPhase[] = [
  {
    title: 'Take off & Hover',
    duration: '5 sec',
    description: 'Brief hover to stabilize before starting snaps.',
  },
  {
    title: 'Roll Snaps',
    duration: '5–8 times',
    description: 'Quick, sharp roll inputs — mix half-stick and full-stick. Stick left, center, right, center. Pause briefly between each.',
  },
  {
    title: 'Pitch Snaps',
    duration: '5–8 times',
    description: 'Same with pitch — forward, center, back, center. Quick and decisive. Mix intensities.',
  },
  {
    title: 'Yaw Snaps',
    duration: '3–5 times',
    description: 'Quick yaw movements left and right with brief pauses.',
  },
  {
    title: 'Land',
    duration: '',
    description: 'Done! Total flight: 20–40 seconds.',
  },
];
```

1.4. Rozdělit `FLIGHT_TIPS` na dvě sady:

```typescript
export const FILTER_FLIGHT_TIPS: string[] = [
  'Fly in calm weather — wind adds unwanted noise to the data',
  'Stay at 2–5 meters altitude',
  'Keep the drone as still as possible during hover phases',
  'Throttle sweeps should be slow and smooth — no jerky movements',
  'Make sure Blackbox logging is enabled with 2 kHz rate',
  'Set debug_mode = GYRO_SCALED in Betaflight for best results',
  'After landing, check motor temperatures — if too hot to touch, do not reduce filters further',
];

export const PID_FLIGHT_TIPS: string[] = [
  'Fly in calm weather — wind makes step response data noisy',
  'Stay at 2–5 meters altitude',
  'Mix half-stick and full-stick snaps for better coverage',
  "Don't do flips or rolls, just snaps",
  'Use your normal rate profile (min 300 °/s recommended)',
  'Make sure Blackbox logging is enabled with 2 kHz rate',
  'After landing, check motor temperatures',
];
```

1.5. Zachovat stávající `FLIGHT_PHASES` a `FLIGHT_TIPS` pro zpětnou kompatibilitu
s mode `'full'`.

---

### Krok 2: Úprava useTuningWizard hooku

**Soubory k úpravě**:
- `src/renderer/hooks/useTuningWizard.ts`

**Změny**:

2.1. Změnit signaturu:

```typescript
export function useTuningWizard(logId: string, mode: TuningMode = 'full'): UseTuningWizardReturn
```

2.2. Přidat `mode` do return interface:

```typescript
export interface UseTuningWizardReturn {
  mode: TuningMode;
  // ... existující fields
}
```

2.3. Upravit auto-advance logiku v `parseLog`:
- Při `mode === 'filter'`: po parsování přejít rovnou na `'filter'` (přeskočit PID)
- Při `mode === 'pid'`: po parsování přejít rovnou na `'pid'` (přeskočit filter)
- Při `mode === 'full'`: stávající chování

2.4. Upravit `confirmApply` aby posílal pouze relevantní doporučení:
- `mode === 'filter'`: poslat `pidRecommendations: []`
- `mode === 'pid'`: poslat `filterRecommendations: []`
- `mode === 'full'`: stávající chování

---

### Krok 3: Úprava TuningWizard komponenty

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/TuningWizard.tsx`

**Změny**:

3.1. Přidat `mode` prop:

```typescript
interface TuningWizardProps {
  logId: string;
  mode: TuningMode;
  onExit: () => void;
}
```

3.2. Předat `mode` do `useTuningWizard(logId, mode)`.

3.3. V `renderStep()` přeskočit kroky podle mode:
- `mode === 'filter'`: po `'filter'` kroku přejít rovnou na `'summary'`
- `mode === 'pid'`: po `'session'` kroku přejít rovnou na `'pid'`, po něm `'summary'`

---

### Krok 4: Úprava WizardProgress komponenty

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/WizardProgress.tsx`

**Změny**:

4.1. Přidat `mode` prop a dynamicky filtrovat STEPS:

```typescript
interface WizardProgressProps {
  currentStep: WizardStep;
  mode: TuningMode;
}

// Dynamické kroky podle mode:
// filter: Flight Guide → Session → Filters → Summary
// pid:    Flight Guide → Session → PIDs → Summary
// full:   Flight Guide → Session → Filters → PIDs → Summary
```

---

### Krok 5: Úprava FlightGuideContent komponenty

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/FlightGuideContent.tsx`

**Změny**:

5.1. Přidat `mode` prop:

```typescript
interface FlightGuideContentProps {
  mode?: TuningMode;  // default 'full' pro zpětnou kompatibilitu
}
```

5.2. Vybírat sadu fází a tipů podle mode:
- `'filter'` → `FILTER_FLIGHT_PHASES` + `FILTER_FLIGHT_TIPS`
- `'pid'` → `PID_FLIGHT_PHASES` + `PID_FLIGHT_TIPS`
- `'full'` → stávající `FLIGHT_PHASES` + `FLIGHT_TIPS`

---

### Krok 6: Úprava TestFlightGuideStep

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/TestFlightGuideStep.tsx`

**Změny**:

6.1. Přidat `mode` prop a předat do `FlightGuideContent`.

6.2. Upravit úvodní text podle mode:
- `'filter'`: "Follow this flight plan to collect noise data for filter tuning."
- `'pid'`: "Follow this flight plan to collect step response data for PID tuning.
  Your filters have been tuned — this flight will produce cleaner data."
- `'full'`: stávající text

---

### Krok 7: Úprava TuningSummaryStep

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/TuningSummaryStep.tsx`

**Změny**:

7.1. Přidat `mode` prop.

7.2. Upravit tlačítka podle mode:
- `mode === 'filter'`: tlačítko "Apply Filters" místo "Apply Changes".
  Po úspěchu: "Filters applied! Fly again and run the PID Wizard for optimal
  PID tuning."
- `mode === 'pid'`: tlačítko "Apply PIDs" místo "Apply Changes".
  Po úspěchu: "PIDs applied! Fly a verification flight to check the feel."
- `mode === 'full'`: stávající chování.

7.3. Zobrazovat jen relevantní sekci tabulky:
- `mode === 'filter'`: skrýt PID sekci (i kdyby existovaly PID výsledky)
- `mode === 'pid'`: skrýt filter sekci
- `mode === 'full'`: zobrazit obojí

---

### Krok 8: Vstupní bod — Tuning Mode Selector

**Nové soubory**:
- `src/renderer/components/TuningWizard/TuningModeSelector.tsx`
- `src/renderer/components/TuningWizard/TuningModeSelector.css`

**Změny**:

8.1. Nová komponenta `TuningModeSelector`, která se zobrazí před spuštěním
wizardu. Nabízí dvě hlavní cesty:

- **"Step-by-step (recommended)"**: Dvou-letový postup
  - "Step 1: Filter Tuning" → spustí wizard s `mode='filter'`
  - "Step 2: PID Tuning" → spustí wizard s `mode='pid'`
  - Krok 2 se odemkne až po dokončení kroku 1 (vizuálně šedivý s popisem
    "Fly again after applying filters")

- **"All-in-one"**: Jednoletový postup (stávající chování)
  - Spustí wizard s `mode='full'`
  - Poznámka: "Quicker but less accurate — best for experienced pilots"

8.2. Stav "step 1 done" se ukládá do session state (React state v rodičovské
komponentě, nikoli persistentně). Reset po uzavření modálního okna.

---

### Krok 9: Integrace TuningModeSelector

**Soubory k úpravě**:
- `src/renderer/components/BlackboxStatus.tsx` (nebo kde se wizard aktuálně spouští)

**Změny**:

9.1. Před spuštěním `TuningWizard` zobrazit `TuningModeSelector`.

9.2. Po výběru mode předat `mode` prop do `TuningWizard`.

9.3. Po dokončení filter wizard (mode='filter') odemknout PID wizard
(mode='pid') — čeká se na nový log z dalšího letu.

---

### Krok 10: Úprava TuningWorkflowModal

**Soubory k úpravě**:
- `src/renderer/components/TuningWorkflowModal/TuningWorkflowModal.tsx`
- `src/shared/constants/flightGuide.ts`

**Změny**:

10.1. Aktualizovat `TUNING_WORKFLOW` aby reflektoval dvou-letový postup:

```typescript
export const TUNING_WORKFLOW: WorkflowStep[] = [
  { title: 'Connect your drone', description: 'Plug in via USB and wait for connection.' },
  { title: 'Create a backup', description: 'Save a snapshot of your current settings.' },
  { title: 'Check Blackbox setup', description: 'Set logging rate to 2 kHz and debug_mode to GYRO_SCALED.' },
  { title: 'Erase Blackbox data', description: 'Clear old logs for a clean recording.' },
  { title: 'Fly: Filter test flight', description: 'Hover + throttle sweeps (~30 sec). Follow the filter flight guide.' },
  { title: 'Analyze & apply filters', description: 'Run the Filter Wizard. Apply recommended filter changes.' },
  { title: 'Erase Blackbox data again', description: 'Clear the filter flight log.' },
  { title: 'Fly: PID test flight', description: 'Stick snaps on all axes (~30 sec). Follow the PID flight guide.' },
  { title: 'Analyze & apply PIDs', description: 'Run the PID Wizard. Apply recommended PID changes.' },
  { title: 'Verify', description: 'Fly normally and check the feel. Repeat if needed.' },
];
```

10.2. V modálu zobrazit dva oddělené flight guides (filter + PID) s vizuálním
oddělením.

---

### Krok 11: Rozšíření SegmentSelector o throttle sweep režim

**Soubory k úpravě**:
- `src/main/analysis/SegmentSelector.ts`
- `src/main/analysis/constants.ts`

**Změny**:

11.1. Přidat novou funkci `findThrottleSweepSegments()`:

```typescript
export function findThrottleSweepSegments(flightData: BlackboxFlightData): FlightSegment[] {
  // Detekce segmentů kde throttle monotónně roste/klesá
  // přes alespoň 50% rozsahu (od hoveru do 90%+) za 3-15 sekund.
  // Tyto segmenty obsahují noise data přes celý rozsah RPM.
}
```

11.2. Přidat nové konstanty do `constants.ts`:

```typescript
/** Minimum throttle range covered by a sweep (0-1 scale) */
export const SWEEP_MIN_THROTTLE_RANGE = 0.4;

/** Minimum sweep duration in seconds */
export const SWEEP_MIN_DURATION_S = 2.0;

/** Maximum sweep duration in seconds */
export const SWEEP_MAX_DURATION_S = 15.0;

/** Maximum throttle regression residual for "monotonic" classification */
export const SWEEP_MAX_RESIDUAL = 0.15;
```

11.3. Upravit `FilterAnalyzer` (orchestrátor) aby:
- Nejprve hledal throttle sweep segmenty pomocí `findThrottleSweepSegments()`
- Pokud najde sweep → použije je (vyšší kvalita)
- Pokud nenajde sweep → fallback na `findSteadySegments()` (zpětná kompatibilita)
- Reportovat v `FilterAnalysisResult` jaký typ segmentů byl použit

---

### Krok 12: Validace BBL headeru (logging rate, debug mode)

**Soubory k úpravě**:
- `src/main/analysis/FilterAnalyzer.ts`
- `src/main/analysis/PIDAnalyzer.ts`
- `src/shared/types/analysis.types.ts`

**Změny**:

12.1. Přidat validaci po parsování BBL:
- Extrahovat `looptime` (→ logging rate) a `debug_mode` z BBL headeru
- Pokud logging rate < 2 kHz: přidat warning do výsledku
- Pokud debug_mode !== GYRO_SCALED: přidat warning do výsledku

12.2. Rozšířit `FilterAnalysisResult` a `PIDAnalysisResult` o pole warnings:

```typescript
export interface AnalysisWarning {
  code: 'low_logging_rate' | 'wrong_debug_mode' | 'no_sweep_segments' | 'few_steps' | 'hot_motors';
  message: string;
  severity: 'info' | 'warning' | 'error';
}

// Přidat do obou result typů:
warnings: AnalysisWarning[];
```

12.3. Zobrazit warnings v `FilterAnalysisStep` a `PIDAnalysisStep` nad výsledky.

---

### Krok 13: Safety warnings po aplikování změn

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/TuningSummaryStep.tsx`

**Změny**:

13.1. Po úspěšném apply (stav `applyState === 'done'`) přidat safety box:

```
⚠️ Safety Check
After your next flight, check motor temperatures immediately after landing.
If any motor is too hot to touch comfortably, restore the previous snapshot
and try less aggressive settings.
```

13.2. V `mode === 'filter'` přidat call-to-action pro další krok:

```
✅ Filters applied! Next steps:
1. Reconnect your drone after reboot
2. Erase Blackbox data
3. Fly the PID test flight (stick snaps)
4. Run the PID Wizard
```

---

### Krok 14: Úprava Apply handleru pro selektivní aplikaci

**Soubory k úpravě**:
- `src/main/ipc/handlers.ts`

**Změny**:

14.1. Aktuální handler `TUNING_APPLY_RECOMMENDATIONS` již podporuje prázdná
pole — pokud `input.pidRecommendations` je `[]`, PID stage se přeskočí, a naopak.
Ale validace `totalRecs === 0` blokuje případ kdy obojí je prázdné.

Toto je správné chování — žádná úprava handleru není nutná. Selektivní
aplikace funguje out-of-the-box, stačí poslat relevantní pole z klientské strany.

---

### Krok 15: Aktualizace testů

**Soubory k úpravě**:
- `src/renderer/components/TuningWizard/TuningWizard.test.tsx`
- `src/renderer/hooks/useTuningWizard.test.ts` (nový test soubor nebo rozšíření)
- `src/main/analysis/SegmentSelector.test.ts`
- `src/renderer/components/TuningWorkflowModal/TuningWorkflowModal.test.tsx`

**Nové testy**:

15.1. **useTuningWizard**:
- Test: `mode='filter'` přeskočí PID krok a jde rovnou na summary
- Test: `mode='pid'` přeskočí filter krok
- Test: `mode='full'` prochází všechny kroky (stávající)
- Test: `confirmApply` s `mode='filter'` posílá prázdné `pidRecommendations`
- Test: `confirmApply` s `mode='pid'` posílá prázdné `filterRecommendations`

15.2. **TuningWizard**:
- Test: s `mode='filter'` nezobrazí PID Analysis step
- Test: s `mode='pid'` nezobrazí Filter Analysis step
- Test: WizardProgress zobrazuje správné kroky podle mode

15.3. **FlightGuideContent**:
- Test: s `mode='filter'` zobrazí throttle sweep fáze
- Test: s `mode='pid'` zobrazí snap fáze
- Test: default mode zobrazí stávající fáze

15.4. **TuningModeSelector**:
- Test: klik na "Step-by-step" zobrazí dvě dlaždice (Filter, PID)
- Test: klik na "All-in-one" spustí wizard s mode='full'
- Test: PID dlaždice je disabled dokud se nedokončí filter krok

15.5. **SegmentSelector**:
- Test: `findThrottleSweepSegments()` najde lineární throttle ramp
- Test: `findThrottleSweepSegments()` ignoruje krátké rampy
- Test: `findThrottleSweepSegments()` ignoruje ne-monotónní data
- Test: fallback na `findSteadySegments()` když sweep segmenty chybí

15.6. **TuningWorkflowModal**:
- Test: zobrazuje aktualizované workflow kroky

15.7. **TuningSummaryStep**:
- Test: v `mode='filter'` zobrazí safety warning a next-step pokyny
- Test: v `mode='pid'` zobrazí jen PID výsledky

---

### Krok 16: Aktualizace CLAUDE.md a dokumentace

**Soubory k úpravě**:
- `CLAUDE.md` — sekce Tuning Wizard, Flight Guide, Architecture
- `ARCHITECTURE.md`
- `SPEC.md`

**Změny**:

16.1. Aktualizovat popisy Tuning Wizard o nový dvou-modový systém.

16.2. Dokumentovat nové konstanty v `constants.ts`.

16.3. Aktualizovat sekci "Analysis Charts" o nové warning elementy.

---

## 4. Pořadí implementace a závislosti

```
Krok 1  (typy + konstanty)           ← základ, žádné závislosti
  │
  ├── Krok 2  (useTuningWizard)      ← závisí na krok 1
  │     │
  │     ├── Krok 3  (TuningWizard)   ← závisí na krok 2
  │     ├── Krok 4  (WizardProgress) ← závisí na krok 2
  │     └── Krok 7  (Summary)        ← závisí na krok 2
  │
  ├── Krok 5  (FlightGuideContent)   ← závisí na krok 1
  │     │
  │     └── Krok 6  (GuideStep)      ← závisí na krok 5
  │
  ├── Krok 8  (ModeSelector)         ← závisí na krok 1
  │     │
  │     └── Krok 9  (Integrace)      ← závisí na krok 3, 8
  │
  ├── Krok 10 (WorkflowModal)        ← závisí na krok 1
  │
  ├── Krok 11 (SegmentSelector)      ← nezávislý (backend)
  │
  ├── Krok 12 (BBL validace)         ← nezávislý (backend)
  │
  └── Krok 13 (Safety warnings)      ← závisí na krok 7

Krok 14 (Apply handler)              ← žádné změny nutné
Krok 15 (Testy)                      ← po každém kroku průběžně
Krok 16 (Dokumentace)                ← na konci
```

**Doporučené pořadí implementace**:

1. **Vlna 1** (základ): Krok 1, 11, 12
2. **Vlna 2** (frontend jádro): Krok 2, 5
3. **Vlna 3** (UI komponenty): Krok 3, 4, 6, 7, 13
4. **Vlna 4** (integrace): Krok 8, 9, 10
5. **Vlna 5** (finalizace): Krok 15, 16

---

## 5. Rozsah změn — shrnutí

| Oblast | Nových souborů | Upravených souborů | Odhadovaný rozsah |
|--------|:-:|:-:|---|
| Typy a konstanty | 0 | 2 | Malý |
| useTuningWizard hook | 0 | 1 | Střední |
| Wizard UI komponenty | 2 | 6 | Střední |
| SegmentSelector (backend) | 0 | 2 | Střední |
| BBL validace (backend) | 0 | 3 | Malý |
| Workflow modal | 0 | 2 | Malý |
| Testy | 0–1 | 4–5 | Střední |
| Dokumentace | 0 | 3 | Malý |
| **Celkem** | **2–3** | **~20** | |

---

## 6. Zpětná kompatibilita

- Mode `'full'` zachovává kompletně stávající chování
- Stávající `FLIGHT_PHASES` a `FLIGHT_TIPS` exporty zůstávají beze změny
- IPC handler `TUNING_APPLY_RECOMMENDATIONS` nevyžaduje změny
- Uživatel si vždy může zvolit "All-in-one" cestu
- Žádné breaking changes v typech — nové fieldy jsou volitelné nebo přidané

---

## 7. Rizika a mitigace

| Riziko | Pravděpodobnost | Dopad | Mitigace |
|--------|:-:|:-:|---|
| Uživatel nerozumí dvou-letovému postupu | Střední | Střední | Jasné UI s vizuálním průvodcem, "All-in-one" jako fallback |
| Throttle sweep detekce má false positives | Nízká | Nízký | Fallback na hover segmenty, konzervativní prahy |
| Uživatelé s RPM filtrem nepotřebují throttle sweep | Nízká | Nízký | Detekce RPM filtru z BBL headeru, přizpůsobený advice |
| Testy nepokryjí nové edge cases | Střední | Střední | Průběžné psaní testů (krok 15 je distribuovaný) |
