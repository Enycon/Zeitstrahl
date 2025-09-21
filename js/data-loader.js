// js/data-loader.js

/**
 * Lädt die Ereignisdaten basierend auf den Titeln im Manifest.
 * @returns {Promise<Array<Object>>} Ein Promise, das ein Array von Ereignisobjekten zurückgibt.
 */
export async function loadEvents() {
    try {
        const manifestResponse = await fetch('events/manifest.json');
        if (!manifestResponse.ok) throw new Error('Manifest-Datei konnte nicht geladen werden.');
        
        const eventTitles = await manifestResponse.json();

        const eventPromises = eventTitles.map(title =>
            fetch(`events/${encodeURIComponent(title)}.json`)
                .then(res => res.ok ? res.json() : Promise.reject(`Fehler beim Laden von: ${title}`))
        );

        return await Promise.all(eventPromises);

    } catch (error) {
        console.error("Fehler beim Laden der Timeline-Daten:", error);
        return []; // Leeres Array zurückgeben, um App-Absturz zu verhindern
    }
}