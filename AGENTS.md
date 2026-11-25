# Projektregeln: ioBroker.ochsner-roomterminal

Diese Regeln gelten für die Entwicklung des ioBroker-Adapters `ioBroker.ochsner-roomterminal` (TypeScript, jsonConfig, web2comm-Schnittstelle).

## 1. Admin-UI & Konfiguration (`jsonConfig`)

- Die Admin-Oberfläche wird ausschließlich über `admin/jsonConfig.json` gepflegt (`io-package.json`: `"adminUI": { "config": "json" }`). Kein neues HTML/React-Admin-UI hinzufügen.
- Alle Konfigurationsfelder in `admin/jsonConfig.json` müssen:
  - in `io-package.json` unter `native` mit sinnvollen Standardwerten definiert sein,
  - in `src/lib/adapter-config.d.ts` im `ioBroker.AdapterConfig`-Interface typisiert werden,
  - sensible Werte (z. B. Zugangsdaten/Passwörter) in `io-package.json` über `protectedNative` und `encryptedNative` absichern.
- Für Responsive-Layouts in `jsonConfig.json` immer Grid-Spalten (`xs`, `sm`, `md`, `lg`) und Validierungen (`min`, `max`, `validator`) konsistent verwenden.

## 2. Objekte & States (`setObjectNotExistsAsync` & `setStateChangedAsync`)

- **Objekte anlegen:** Dynamische Channels, Devices und States immer über `await this.setObjectNotExistsAsync(id, obj)` anlegen, damit benutzerdefinierte Anpassungen (z. B. Custom-Objekte, Namen, History/SQL-Einstellungen, Aliase) bei Adapter-Neustarts nicht überschrieben werden.
  - `extendObjectAsync` nur gezielt verwenden, wenn sich Metadaten (z. B. `states`-Mapping, `unit`, `min`/`max`) tatsächlich ändern müssen.
  - Jedes State-Objekt muss korrekte `common`-Felder besitzen: `name`, `type`, `role` (Standard-ioBroker-Rollen wie `value.temperature`, `indicator.connected`, `switch`, `level.*`, `text`), `read`, `write` sowie bei Bedarf `unit`, `min`, `max`, `states`.
- **State-Werte schreiben:** Zum Aktualisieren von Werten immer `await this.setStateChangedAsync(id, { val, ack: true })` (oder `await this.setStateChangedAsync(id, val, true)`) verwenden, statt `setStateAsync` aufzurufen. So werden unnötige DB-Schreibvorgänge und Event-Trigger bei unveränderten Werten vermieden.
- **Ack-Flag strikt beachten:**
  - Vom Gerät gelesene Werte werden immer mit `ack: true` geschrieben.
  - In `onStateChange(id, state)` nur auf unbestätigte Befehle (`state && !state.ack`) reagieren, um Endlosschleifen zu vermeiden. Nach erfolgreichem Schreiben an das Gerät den Wert mit `ack: true` bestätigen.
- **Verbindungsstatus:** `info.connection` zuverlässig pflegen (`setStateChangedAsync('info.connection', true/false, true)`).

## 3. Internationalisierung (`i18n`)

- `admin/jsonConfig.json` nutzt `"i18n": true`. Alle sichtbaren Labels, Hilfetexte (`help`), Tab-Namen und Tabellenspalten müssen über Übersetzungen gepflegt werden.
- Primäre Übersetzungsdateien liegen in `admin/i18n/<lang>/translations.json` (mindestens `en` und `de` sauber pflegen; weitere Sprachen konsistent halten).
- Für automatische Synchronisation und Übersetzung neuer Keys das Projekt-Skript `npm run translate` (`@iobroker/adapter-dev` / `translate-adapter`) verwenden.
- In `io-package.json` (`common.titleLang`, `common.desc`, `common.news`, `instanceObjects[].common.name`) mehrsprachige Objekte für alle unterstützten ioBroker-Sprachen (`en`, `de`, `ru`, `pt`, `nl`, `fr`, `it`, `es`, `pl`, `uk`, `zh-cn`) aktuell halten.
- Keine hartkodierten UI-Texte ohne Übersetzungsschlüssel einführen.

## 4. Adapter-Lebenszyklus & Code-Qualität

- **Timer & Ressourcen:** Alle `setTimeout`-/`setInterval`-Referenzen über `this.setTimeout` / `this.setInterval` (aus `@iobroker/adapter-core`) verwalten und in `onUnload(callback)` sauber mit `this.clearTimeout` / `this.clearInterval` aufräumen. `callback()` in `onUnload` muss unter allen Umständen aufgerufen werden.
- **TypeScript & Linting:**
  - Quellcode liegt in `src/`, kompiliert wird nach `build/` via `npm run build` (`build-adapter ts`).
  - Vor jedem Commit/Abschluss prüfen: `npm run check`, `npm run lint`, `npm run build` und `npm test`.
  - Code-Stil folgt `@iobroker/eslint-config` und `prettier.config.mjs` (Single Quotes, JSDoc empfohlen).
  - Keine generierten Dateien (`build/`, `admin/words.js`, `.dev-server/`) manuell editieren.

## 5. Lokale Entwicklung & Release

- **Lokaler Testbetrieb:** `@iobroker/dev-server` im Projektordner nutzen (`.dev-server/` ist in `.gitignore` ausgeschlossen):
  - `dev-server setup` – lokale Test-Instanz einrichten
  - `dev-server watch` – Adapter im Watch-Modus mit ioBroker-Admin starten (Standard-Port 8081)
  - `dev-server run` – lokale Test-Instanz starten
- **Releases:** Ausschließlich über `@alcalzone/release-script` (`npm run release`, `release-patch`, `release-minor`, `release-major`) erstellen.
