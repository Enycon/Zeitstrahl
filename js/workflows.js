// js/workflows.js

document.addEventListener('DOMContentLoaded', async () => {
    const workflowContentEl = document.getElementById('workflow-content');
    const copyButton = document.getElementById('copy-workflow-btn');

    if (!workflowContentEl || !copyButton) {
        console.error('Benötigte Elemente (Container oder Button) nicht gefunden.');
        return;
    }

    let textToCopy = '';

    try {
        // Lade den Inhalt der Markdown-Datei
        const response = await fetch('workflows/generate_event.md');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const fullText = await response.text();
        
        // Extrahiere nur den Teil, der für die KI bestimmt ist (zwischen den '---' Markern)
        const promptMarker = '---';
        const promptStartIndex = fullText.indexOf(promptMarker);
        
        if (promptStartIndex !== -1) {
            // Nimm den gesamten Text nach dem ersten Marker
            textToCopy = fullText.substring(promptStartIndex + promptMarker.length).trim();
        } else {
            // Fallback: Zeige den ganzen Text, wenn die Marker nicht gefunden werden
            console.warn("Konnte den Prompt-Start-Marker '---' nicht finden. Zeige den gesamten Dateiinhalt an.");
            textToCopy = fullText;
        }

        workflowContentEl.textContent = textToCopy;

    } catch (error) {
        workflowContentEl.textContent = 'Fehler beim Laden des Workflows. Bitte die Konsole prüfen.';
        console.error('Fehler beim Abrufen der Workflow-Datei:', error);
    }

    // Event-Listener für den Kopier-Button
    copyButton.addEventListener('click', () => {
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = copyButton.textContent;
                copyButton.textContent = 'Kopiert!';
                setTimeout(() => { copyButton.textContent = originalText; }, 2000);
            }).catch(err => {
                console.error('Fehler beim Kopieren in die Zwischenablage:', err);
                alert('Kopieren fehlgeschlagen. Bitte manuell kopieren.');
            });
        }
    });
});