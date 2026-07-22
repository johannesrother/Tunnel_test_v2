# Panic Journey

Statische Three.js- und WebXR-Demo für eine immersive Reise durch die Phasen einer Panikattacke.

## GitHub Pages

Die Dateien im Ordner als Repository veröffentlichen. Unter **Settings → Pages** die Quelle **Deploy from a branch** und den Ordner **/(root)** wählen.

WebXR benötigt HTTPS. GitHub Pages stellt HTTPS bereit.

Die komplette Anwendung einschließlich Three.js liegt gebündelt in `bundle.js`. GitHub Pages benötigt beim Start nur diese eine JavaScript-Datei.

Die visuelle Demo funktioniert auch beim direkten Öffnen der `index.html`. WebXR benötigt GitHub Pages oder einen anderen HTTPS-Server.

## Bedienung

- Ziehen: Blickrichtung
- Begin Journey: startet die fest gesetzte 60-Sekunden-Reise mit Sound
- Enter VR: immersive WebXR-Sitzung auf unterstützten Geräten

Die Bewegung, Geschwindigkeit und Übergänge laufen automatisch. In VR bleibt nur die Blickbewegung frei.

## Ablauf

- 0–8 Sekunden: Calm
- 8–18 Sekunden: Unease
- 18–29 Sekunden: Compression
- 29–40 Sekunden: Acceleration
- 40–50 Sekunden: Peak
- 50–55 Sekunden: Crawl
- 55–60 Sekunden: White Room mit Flatline
- 60 Sekunden: The End
