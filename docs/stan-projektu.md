# Challenge Manager — stan projektu, plan i oczekujące decyzje

*Stan na 22.10.2026. Szczegółowa specyfikacja techniczna (po angielsku): [sheet-driven-architecture.md](sheet-driven-architecture.md). Instrukcja uruchomienia i opis funkcji: [README](../README.md).*

## 1. Cel

Challenge Manager ma być **nakładką UI** na arkusz Google, który pozostaje **jedynym źródłem prawdy**:

- Arkusz STAGE ma 26 zakładek. 24 z nich to stałe dane (presety nagród, fal, aren, poziomów trudności itd.). Modyfikowane są tylko **`ChallengeSetupConfig`** i **`ChallengeCalendar`**.
- Dashboard ułatwia ustawianie challenge'ów (listy zamiast ręcznego wpisywania, walidacja, podgląd zmian) i wypychanie ich na STAGE.
- Wypychanie na STAGE robi istniejący pipeline w Jenkinsie z parametrami:

  | Parametr | Znaczenie |
  |---|---|
  | `SPREADSHEET_ID` | ID arkusza, z którego importer czyta dane |
  | `UTC_YEAR` | rok importowanego miesiąca (UTC) |
  | `UTC_MONTH` | importowany miesiąc (UTC) |
  | `IMPORTER_TYPE` | zawsze `challenge` |

## 2. Jak to wygląda teraz

### 2.1 W skrócie

Aplikacja działa w pełni lokalnie. **Nie jest podpięta do żadnego prawdziwego arkusza ani do Jenkinsa.** Cała logika docelowego przepływu (zapis do arkusza → import w Jenkinsie → wycofanie przy błędzie) jest zaimplementowana na atrapach (mockach), które da się podmienić na prawdziwe adaptery bez zmian w UI.

```
Przeglądarka — formularz, listy, paczki, kalendarz, podgląd, historia (szkice w localStorage)
    │  GET /api/state, GET /api/references, POST /api/preview, POST /api/deploy
    ▼
Serwer lokalny (server.mjs, 127.0.0.1) — walidacja, plan podglądu, wdrożenie
    ├─► MockRepository — plik .data/store.json zamiast arkusza
    └─► MockJenkins    — atrapa joba importu (jeden build na miesiąc UTC)
```

### 2.2 Skąd biorą się dane dzisiaj

| Dane | Gdzie są teraz | Docelowo |
|---|---|---|
| Wiersze `ChallengeSetupConfig`, kalendarz | `.data/store.json` (lokalny plik, powstał z danych testowych w `src/fixtures.js`) | zakładki `ChallengeSetupConfig` i `ChallengeCalendar` |
| Listy w formularzu (bossowie, WavePreset, nagrody, areny, DropTier, presety trudności, grafiki, ikony, opisy) | wpisane ręcznie w `src/fixtures.js` (wartości przekazane przez zespół) | wybrane kolumny z 24 stałych zakładek |
| Regression Pack (45 challenge'ów) | `src/pack-presets.js`, jednorazowa kopia z pliku xlsx regresji | do decyzji (zostaje w kodzie albo osobna zakładka) |
| Paczki i historia wdrożeń | `.data/store.json` | do decyzji (lokalnie albo zakładka) |
| Szkice w trakcie edycji | localStorage przeglądarki | bez zmian |
| `SPREADSHEET_ID` | zmienna środowiskowa `SPREADSHEET_ID`, domyślnie etykieta `mock-spreadsheet` | ID arkusza STAGE |

### 2.3 Co działa

- **Overview**: kafelki KPI, wykres wpisów kalendarza w miesiącach, wykorzystanie bossów, ostatnie wdrożenia, kalendarz miesiąca, tabela challenge'ów.
- **Edytor challenge'a** (38 kolumn `ChallengeSetupConfig`):
  - listy z wyszukiwarką i debouncingiem: BossID, ModeID, Arena, WavePreset, DropTier, RewardPreset, ChallengeDescription, EventGraphicURL, BadgeBackgroundURL, Immunity Icons (wybór wielu), DifficultyFactorPreset;
  - wartości domyślne: Start (UTC) = moment utworzenia, gracze 15/35/50, AttemptPrices `1,1,2,3,4`, Hard Limit Window 300;
  - DropTier i DifficultyFactorPreset dobierane automatycznie do przedziału poziomów;
  - tooltip z obsługiwanymi przedziałami (15-19 … 70-90).
- **Paczki**: zwykłe (wspólny szablon + lista bossów) oraz gotowe zestawy — **Regression Pack** (45 challenge'ów z arkusza regresji) i **RC Pack** (na razie pusty, przycisk nieaktywny).
- **Kalendarz**: dodawanie i przesuwanie wpisów w siatce dzień × przedział poziomów.
- **Usuwanie** challenge'ów i paczek z podglądem skutków.
- **Podgląd → plan → wdrożenie** (opis w 2.4), **historia wdrożeń** z zapisanymi zmianami i buildami importu.
- Polski i angielski, jasny i ciemny motyw, widok na telefonie.

### 2.4 Przepływ wdrożenia (zaimplementowany na mockach)

1. **Podgląd**: serwer waliduje dane względem katalogu list z repozytorium, liczy różnice i wystawia jednorazowy plan ważny 15 minut, powiązany z wersją danych.
2. **Wdrożenie** (tylko cel `stage`): serwer sprawdza, czy dane nie zmieniły się od podglądu, i ponownie waliduje.
3. **Zapis do arkusza**: plan zamienia się w listę konkretnych zmian (wiersze `ChallengeSetupConfig`, komórki `ChallengeCalendar`, rekordy paczek). Każda zmiana pamięta wartość, którą zastępuje. Jeśli którykolwiek cel zmienił się od podglądu (np. ktoś edytował arkusz ręcznie), **nic nie jest zapisywane**.
4. **Import**: dla każdego dotkniętego miesiąca UTC uruchamiany jest osobny build z parametrami `SPREADSHEET_ID`, `UTC_YEAR`, `UTC_MONTH`, `IMPORTER_TYPE=challenge`. Importowane są:
   - miesiące ze zmienioną komórką kalendarza,
   - bieżące i przyszłe miesiące, w których zaplanowano challenge ze zmienioną konfiguracją.
5. **Błąd importu**: zapisane wiersze i komórki są wycofywane, a miesiące zaimportowane wcześniej importowane są ponownie z przywróconego arkusza.
6. **Restart serwera w trakcie wdrożenia**: przy starcie serwer wycofuje zapisane zmiany i zapisuje w historii, które miesiące trzeba zaimportować ponownie.

### 2.5 Mapa kodu

| Plik | Rola |
|---|---|
| `server.mjs` | API, plany podglądu, wdrożenie (zapis → importy → wycofanie), odtwarzanie po restarcie |
| `src/repositories/config-repository.js` | interfejs repozytorium: `init`, `state`, `spreadsheetId`, `getReferences`, `applyChanges`, `saveJob` |
| `src/repositories/mock.js` | `MockRepository` — lokalny plik zamiast arkusza |
| `src/integrations/jenkins.js` | parametry importu i `MockJenkins` (atrapa joba) |
| `src/sheet-changes.js` | zamiana planu na konkretne zmiany wierszy/komórek, kontrola konfliktów, wycofanie, wyznaczanie miesięcy do importu |
| `src/references.js` | katalog list (bossowie, presety, gotowe paczki) zwracany przez `GET /api/references` |
| `src/domain.js`, `src/packs.js`, `src/deletion.js` | walidacja, mapowanie na kolumny arkusza, paczki, usuwanie (dostają katalog list jako parametr, nie czytają danych testowych) |
| `src/fixtures.js`, `src/pack-presets.js` | dane testowe i ręczna kopia list — zostaną zastąpione odczytem z arkusza |
| `src/app.js`, `src/styles.css`, `src/locales/pl.js` | interfejs |

### 2.6 Testy

- `npm test` — 48 testów: walidacja, mapowanie kolumn, paczki, usuwanie, zapis zmian, konflikty, wycofanie, wybór miesięcy, parametry importu, katalog list z repozytorium.
- `npm run test:browser` — 49 testów w Chrome (Playwright): pełne ścieżki w UI, w tym wdrożenie Regression Pack na mockach.

## 3. Co wiemy, a co jest założeniem

| Temat | Status | Źródło / uwagi |
|---|---|---|
| 38 kolumn `ChallengeSetupConfig`, nazwy i kolejność | ✅ potwierdzone | PDF arkusza z początku projektu i plik regresji xlsx (zgodność 1:1 dla 45 wierszy) |
| Pusta kolumna między `NpcLevelMultiplier` a `PlayersGroupPreset` | ⚠️ do wyjaśnienia | w pliku regresji jest kolumna bez nagłówka |
| Wartości list (grafiki, opisy, WavePreset, DropTier, areny, ikony, przedziały) | ✅ od zespołu | wklejone ręcznie; po podłączeniu będą czytane z arkusza |
| Modyfikowane są tylko `ChallengeSetupConfig` i `ChallengeCalendar` | ✅ potwierdzone | pozostałe 24 zakładki są stałe |
| Parametry joba Jenkins | ✅ potwierdzone | `SPREADSHEET_ID`, `UTC_YEAR`, `UTC_MONTH`, `IMPORTER_TYPE=challenge` |
| Kolejność: najpierw zapis do arkusza, potem import | ✅ wynika z pipeline'u | importer czyta arkusz |
| Układ `ChallengeCalendar` (miesiące, dni, przedziały, format komórki) | ❌ założenie | mock: siatka dzień × przedział, komórka `HH:mm:ChallengeID` rozdzielona ` \| ` |
| Nazwy zakładek i kolumn, z których czytać listy | ❌ założenie | `BossConfig`, `ArenaConfig`, `DropTierConfig`, `PlayerGroupPresetsConfig` w `references.js` to etykiety robocze |
| Format `UTC_MONTH` | ❌ założenie | mock wysyła dwie cyfry (`09`) |
| Reguły domyślnego DropTier / DifficultyFactorPreset dla przedziału | ⚠️ częściowo | 60-69 → `DC_Level69` od zespołu; pozostałe wywnioskowane |

## 4. Na co czekamy

### 4.1 Zgoda i dostępy

- [ ] Zgoda na podłączenie dashboardu do arkusza STAGE i joba w Jenkinsie.
- [ ] `SPREADSHEET_ID` arkusza STAGE.
- [ ] Konto serwisowe Google (albo decyzja o logowaniu OAuth użytkownika) z dostępem do arkusza: odczyt wszystkich zakładek, zapis tylko `ChallengeSetupConfig` i `ChallengeCalendar`.
- [ ] Adres joba w Jenkinsie i token API konta technicznego (uprawnienia tylko do tego joba).

### 4.2 Informacje o arkuszu

- [ ] **Mapowanie list** — dla każdego pola: zakładka i kolumna z kluczami (szablon do wypełnienia):

  | Pole w formularzu | Zakładka | Kolumna z kluczem | Dodatkowe kolumny do podglądu |
  |---|---|---|---|
  | BossID | ? | ? | nazwa wyświetlana |
  | Arena | ? | ? | |
  | WavePreset | WavePresetsConfig? | ? | |
  | RewardPreset | ChallengeRewardsConfig? | ? | |
  | DropTier | ? | ? | |
  | PlayersGroupPreset | ? | ? | |
  | DifficultyFactorPreset | ChallengeDifficultyFactorPresets? | ? | kolumny pokazywane w kafelkach |
  | EventGraphicURL / BadgeBackgroundURL | ? | ? | |
  | Immunity Icons | ? | ? | |
  | ChallengeDescription | ? | ? | |
  | Przedziały poziomów | ChallengeCalendar? | nagłówek? | |

- [ ] Pełny nagłówek `ChallengeSetupConfig` z arkusza STAGE (wyjaśnienie pustej kolumny).
- [ ] Układ `ChallengeCalendar` z kilkoma przykładowymi wierszami: jak zapisane są miesiące (osobna zakładka na miesiąc? kolumny rok/miesiąc?), dni, przedziały i format komórki.
- [ ] Najlepiej: eksport arkusza STAGE do .xlsx (mogą być dane przykładowe) — z niego powstanie dokładne mapowanie.

### 4.3 Decyzje zespołu

- [ ] Gdy import w Jenkinsie się nie uda: **wycofać zmiany w arkuszu** (obecne zachowanie) czy zostawić je i ponowić import?
- [ ] Format `UTC_MONTH` (`09` czy `9`) i czy buildy dla kilku miesięcy mogą iść równolegle.
- [ ] Czy ktoś edytuje `ChallengeSetupConfig`/`ChallengeCalendar` ręcznie w tym samym czasie (wpływa na obsługę konfliktów).
- [ ] Gdzie trzymać paczki, historię wdrożeń i gotowe zestawy (Regression/RC Pack): lokalnie w aplikacji czy w osobnych zakładkach arkusza.
- [ ] Gdzie będzie działał serwer: lokalnie u każdej osoby czy jako wspólna instancja (wtedy potrzebne logowanie i uprawnienia).
- [ ] Zawartość RC Pack.

## 5. TODO

### 5.1 Po otrzymaniu danych i dostępów (główna praca)

1. **`GoogleSheetsRepository`** (zamiast `MockRepository`):
   - odczyt list z 24 stałych zakładek (tylko wskazane kolumny), z pamięcią podręczną i przyciskiem „odśwież listy”;
   - odczyt `ChallengeSetupConfig` i `ChallengeCalendar` do stanu aplikacji;
   - zapis konkretnych wierszy i komórek jednym żądaniem (batch update), poprzedzony ponownym odczytem tych samych zakresów (kontrola konfliktów).
2. **Adapter Jenkinsa** (zamiast `MockJenkins`): uruchomienie joba z parametrami, odczyt numeru buildu z kolejki, odpytywanie o wynik, link do logu buildu w historii.
3. **Konfiguracja i sekrety** po stronie serwera (zmienne środowiskowe, np. ID arkusza, plik konta serwisowego, adres i token Jenkinsa) — nigdy w przeglądarce.
4. **Testy kontraktowe** adapterów na nagranych odpowiedziach arkusza i Jenkinsa (bez łączenia się z prawdziwymi usługami w CI).
5. Ustawienie właściwego formatu `UTC_MONTH` i wybranej strategii przy błędzie importu.

### 5.2 Możliwe już teraz, bez dostępów

- [ ] Walidacja referencji w podglądzie: oznaczanie wartości spoza list (np. stare `RuinedKeep`, `Standard3`) jako ostrzeżenie zamiast cichego przepuszczania.
- [ ] Czytelniejszy podgląd nowego wiersza (jedna etykieta „Nowy wiersz” zamiast „(new row)” przy każdej kolumnie).
- [ ] Przycisk „odśwież listy” z datą ostatniej synchronizacji (`syncedAt`).
- [ ] Wyszukiwanie w listach po słowach (np. „orc chieftain 70”) — było wdrożone i cofnięte, do ponownej decyzji.

### 5.3 Znane drobne problemy

- `CheckReg1` w Regression Pack ma WavePreset `OrcChieftain70_D55_v4` (wielkie „D”), a lista ma `OrcChieftain70_d55_v4`.
- Start ustawiony na „teraz” po minucie daje ostrzeżenie „start w przeszłości” (nie blokuje wdrożenia).
- Tab w otwartej liście przenosi fokus na pierwszą opcję zamiast do następnego pola.
- Lokalne dane testowe zawierają wartości spoza nowych list (areny, fale, nagrody, ikony) — są pokazywane, ale przy edycji trzeba wybrać wartość z listy.

### 5.4 Później

- Logowanie i uprawnienia, jeśli serwer ma być wspólny dla zespołu.
- Wspólny magazyn historii wdrożeń (audyt), jeśli kilka osób wdraża równolegle.

## 6. Jak to będzie działać docelowo

```
ARKUSZ STAGE — źródło prawdy, 26 zakładek
├─ 24 stałe zakładki (presety, areny, fale…)  → tylko odczyt wybranych kolumn (listy w UI)
└─ ChallengeSetupConfig, ChallengeCalendar    → odczyt + kontrolowany zapis
        ▲                          │
        │ zapis wierszy/komórek    │ listy, aktualne wiersze i komórki
        │                          ▼
Serwer Challenge Managera — katalog list, walidacja, podgląd, wdrożenie
                            (sekrety Google i Jenkins tylko tutaj)
        │
        │ jeden build na każdy dotknięty miesiąc UTC
        ▼
Jenkins — SPREADSHEET_ID, UTC_YEAR, UTC_MONTH, IMPORTER_TYPE=challenge  ──►  STAGE
```

Krok po kroku:

1. **Start serwera**: wczytuje listy z wybranych kolumn stałych zakładek i udostępnia je formularzowi. Zakładki są stałe, więc wystarczy odczyt przy starcie i ręczne odświeżenie.
2. **Edycja w UI**: użytkownik wybiera wartości z list. Szkice zostają w przeglądarce, dopóki nie zostaną wdrożone.
3. **Podgląd**: serwer czyta aktualne wiersze i komórki z `ChallengeSetupConfig`/`ChallengeCalendar`, waliduje dane względem list z arkusza i pokazuje dokładne zmiany (stara → nowa wartość).
4. **Push to STAGE**:
   1. ponowny odczyt tylko zmienianych zakresów — jeśli coś się zmieniło od podglądu, wdrożenie jest zatrzymane bez zapisu;
   2. zapis wierszy i komórek do arkusza;
   3. dla każdego dotkniętego miesiąca build w Jenkinsie z parametrami `SPREADSHEET_ID`, `UTC_YEAR`, `UTC_MONTH`, `IMPORTER_TYPE=challenge` i oczekiwanie na wynik;
   4. sukces → wpis w historii z numerami buildów; błąd → wycofanie zmian w arkuszu i ponowny import wcześniejszych miesięcy (albo ponowienie — wg decyzji z 4.3).
5. **Historia** pokazuje, kto i co wdrożył, które wiersze/komórki zmieniono oraz wszystkie buildy z parametrami.

Bez zmian pozostają: interfejs, walidacja, podgląd i bezpieczeństwo (tylko STAGE, jednorazowe plany, sekrety po stronie serwera). Podmieniane są wyłącznie dwa adaptery: `MockRepository` → `GoogleSheetsRepository` i `MockJenkins` → adapter Jenkinsa.
