# Backend für Push-Nachrichten

Dieses Backend versendet Web-Push-Nachrichten für die GitHub-Pages-App.

## 1. Voraussetzungen

- Node.js 18 oder neuer
- Ein Hosting-Anbieter mit Node.js (z. B. Render, Railway oder eigener VPS)
- Eine dauerhaft erreichbare HTTPS-URL für das Backend

GitHub Pages selbst kann dieses Backend nicht ausführen.

## 2. Lokal starten

```bash
cd backend
npm install
cp .env.example .env
npx web-push generate-vapid-keys
```

Trage die ausgegebenen Schlüssel in `.env` ein. Setze außerdem einen langen zufälligen `ADMIN_TOKEN`, zum Beispiel:

```bash
openssl rand -hex 32
```

Dann starten:

```bash
npm start
```

Prüfen:

```bash
curl http://localhost:3000/health
```

## 3. Frontend konfigurieren

Die Frontend-Subscription muss an folgende URL gesendet werden:

```text
https://DEIN-BACKEND.example.com/api/subscribe
```

Der Request benötigt diese Struktur:

```json
{
  "userId": "Tino",
  "subscription": {
    "endpoint": "...",
    "keys": { "p256dh": "...", "auth": "..." }
  }
}
```

Der Public VAPID Key darf im Frontend stehen. Der Private VAPID Key und `ADMIN_TOKEN` dürfen niemals in `viewer.html` oder Git eingecheckt werden.

## 4. Manuell senden

```bash
curl -X POST https://DEIN-BACKEND.example.com/api/send-notification \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: DEIN_ADMIN_TOKEN' \
  -d '{"userId":"Tino","title":"Tipprunde","body":"Neue Nachricht für dich"}'
```

## 5. Gewinner melden

```bash
curl -X POST https://DEIN-BACKEND.example.com/api/check-winners \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: DEIN_ADMIN_TOKEN' \
  -d '{"winners":[{"userId":"Tino","betId":"md-1-1","betName":"Bayern gewinnt"}]}'
```

Wichtig: Der Endpoint verschickt nur an Gewinner, die ihm übergeben werden. Die eigentliche Gewinner-Erkennung sollte serverseitig erfolgen, sobald du eine vertrauenswürdige Ergebnisquelle und einen Cronjob/Event-Trigger hast. Eine Erkennung ausschließlich im Browser ist nicht zuverlässig, weil die Seite geschlossen sein kann und `data.json` öffentlich veränderbar ist.

## 6. Deployment

Lege `backend` als Root-Verzeichnis des Services fest. Build-Befehl: `npm install`. Start-Befehl: `npm start`. Setze alle Variablen aus `.env.example` als geheime Umgebungsvariablen beim Anbieter. `CORS_ORIGIN` muss auf die Domain deiner GitHub-Pages-App zeigen.

Die Datei `data/subscriptions.json` ist absichtlich aus Git ausgeschlossen. Für einen einzelnen kleinen Server ist sie ausreichend. Bei mehreren Instanzen oder automatischen Backups solltest du auf Postgres/Redis umsteigen.
