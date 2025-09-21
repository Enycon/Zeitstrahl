// js/main.js
import { loadEvents } from './data-loader.js';
import { initTimeline } from './timeline.js';

document.addEventListener('DOMContentLoaded', async function() {
    // --- GLOBALER APP-ZUSTAND ---
    // Lade die Daten asynchron, bevor die App initialisiert wird.
    const rawData = await loadEvents();
    // Konvertiere Datum-Strings in Date-Objekte für die D3-Timeline
    const appData = rawData.map(d => ({ ...d, date: new Date(d.start) }));
    const allKnownGroups = [...new Set(appData.map(d => d.group))];
    const timelineContainer = document.getElementById('d3-timeline-container');
    const controlsContainer = document.getElementById('timeline-controls');

    // --- HAUPT-RENDER-FUNKTION ---
    function renderApp(data) {
        // 1. Bereinige alte Elemente
        timelineContainer.innerHTML = '';
        controlsContainer.innerHTML = '';

        // 2. Initialisiere die Timeline mit den aktuellen Daten
        const { groupInfo, redraw } = initTimeline('#d3-timeline-container', data, allKnownGroups, createDetailsHandlers());
        
        // 3. Erstelle die Steuerelemente dynamisch
        const initialActiveLanes = setupControls(groupInfo, redraw);
        
        // 4. Führe den ersten Render-Vorgang mit dem initialen Zustand aus.
        redraw(initialActiveLanes);
        
        // 5. Initialisiere die Logik für das Workflow-Modal
        initWorkflowModal();
    }

    // --- DETAILS-FENSTER LOGIK ---
    function createDetailsHandlers() {
        const timelinesWrapper = document.getElementById('timelines-wrapper');
        const detailsPane = document.getElementById('details-pane');
        const detailsTitle = document.getElementById('details-title');
        const detailsDate = document.getElementById('details-date');
        const detailsText = document.getElementById('details-text');

        // Wandelt einfachen Markdown-Text in HTML um
        function simpleMarkdownToHtml(md) {
            let html = md
                // ### Überschriften
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                // *kursiv* oder _kursiv_
                .replace(/[\*_]([^\*_]+)[\*_]/g, '<em>$1</em>')
                .replace(/^\* (.*$)/gim, '<li>$1</li>'); // Listenpunkte

            return html
                // Absätze
                .replace(/\n\n/g, '</p><p>')
                // Einzelne Zeilenumbrüche
                .replace(/\n/g, '<br>')
                // Korrigiere Absätze, die durch die Ersetzungen entstehen könnten
                .replace(/<br><\/p>/g, '</p>')
                .replace(/<p><br>/g, '<p>');
        }

        return {
            show: (d) => {
                detailsTitle.innerText = d.content;
                detailsDate.innerText = d.date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
                detailsText.innerHTML = `<p>${simpleMarkdownToHtml(d.details)}</p>`;
                detailsPane.classList.add('visible');
                timelinesWrapper.classList.add('details-visible');
            },
            hide: () => {
                detailsPane.classList.remove('visible');
                timelinesWrapper.classList.remove('details-visible');
            }
        };
    }

    // --- STEUERELEMENTE-LOGIK ---
    function setupControls(groupInfo, redraw) {
        const activeLanes = [];
        const allCheckboxes = new Map();
        
        // Sortiere die Gruppen, sodass die bevorzugten am Anfang stehen
        const allGroups = [...new Set(groupInfo.keys())];
        const preferredOrder = ['AI', 'Kreativ-KI'];

        const orderedGroups = preferredOrder.filter(p => allGroups.includes(p));
        const remainingGroups = allGroups.filter(g => !preferredOrder.includes(g));
        // Die finale Reihenfolge für die Anzeige der Steuerelemente
        const groupsToRender = [...orderedGroups, ...remainingGroups];

        groupsToRender.forEach(name => {
            const info = groupInfo.get(name);
            const controlGroup = document.createElement('div');
            controlGroup.className = 'control-group';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `toggle-${name}`;
            checkbox.name = name;
            checkbox.checked = true;
            checkbox.style.borderColor = info.color;
            checkbox.style.color = info.color;

            const label = document.createElement('label');
            label.htmlFor = `toggle-${name}`;
            label.textContent = name.charAt(0).toUpperCase() + name.slice(1);

            controlGroup.appendChild(checkbox);
            controlGroup.appendChild(label);
            controlsContainer.appendChild(controlGroup);

            allCheckboxes.set(name, checkbox);

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    activeLanes.push(name);
                    if (activeLanes.length > 2) {
                        // Deaktiviere die älteste Spur, aber überlasse das Ausblenden der Timeline-Animation
                        const laneNameToDeactivate = activeLanes.shift();
                        allCheckboxes.get(laneNameToDeactivate).checked = false;
                    }
                } else {
                    // Entferne die Spur aus der aktiven Liste
                    activeLanes.splice(activeLanes.indexOf(name), 1);
                }
                
                // Zeichne die Timeline neu, um die Höhe anzupassen
                redraw(activeLanes);
            });
        });

        // --- NEU: Setze die Standard-Kategorien ---
        const preferredDefaults = ['AI', 'Kreativ-KI'];
        const availablePreferred = preferredDefaults.filter(p => allCheckboxes.has(p));

        // Fülle die aktiven Spuren zuerst mit den bevorzugten Kategorien
        availablePreferred.forEach(name => {
            if (activeLanes.length < 2) activeLanes.push(name);
        });

        // Fülle den Rest mit anderen verfügbaren Kategorien auf, falls die bevorzugten nicht ausreichen
        groupsToRender.forEach(name => {
            if (activeLanes.length < 2 && !activeLanes.includes(name)) {
                activeLanes.push(name);
            }
        });

        // Setze den 'checked'-Status für alle Checkboxen basierend auf der finalen Auswahl
        allCheckboxes.forEach((checkbox, name) => checkbox.checked = activeLanes.includes(name));

        return activeLanes;
    }

    // --- WORKFLOW MODAL LOGIK ---
    function initWorkflowModal() {
        // DOM-Elemente
        const modal = document.getElementById('workflow-modal');
        const openBtn = document.getElementById('show-workflow-btn');
        const closeBtn = document.getElementById('close-workflow-btn');
        const copyButton = document.getElementById('copy-workflow-btn');
        const backButton = document.querySelector('.workflow-back-btn');
    
        const selectionView = document.getElementById('workflow-selection');
        const displayView = document.getElementById('workflow-display');
        const workflowListContainer = document.getElementById('workflow-list');
        const workflowTitleEl = document.getElementById('workflow-title');
        const workflowContentEl = document.getElementById('workflow-content');
    
        let textToCopy = '';
    
        // Liste der verfügbaren Workflows
        const availableWorkflows = [
            { 
                id: 'generate_event', 
                title: 'Neues Ereignis generieren', 
                description: 'Erstellt ein neues Ereignis für die Timeline basierend auf einer Recherche.',
                file: 'workflows/generate_event.md' 
            }
            // Hier können zukünftige Workflows hinzugefügt werden
        ];
    
        // Funktion zum Anzeigen der Workflow-Auswahl
        function showSelectionView() {
            selectionView.style.display = 'block';
            displayView.style.display = 'none';
            
            workflowListContainer.innerHTML = ''; // Leeren für den Fall, dass es neu gerendert wird
    
            availableWorkflows.forEach(wf => {
                const button = document.createElement('button');
                button.className = 'workflow-select-btn';
                button.innerHTML = `<strong>${wf.title}</strong><p>${wf.description}</p>`;
                button.addEventListener('click', () => showDisplayView(wf));
                workflowListContainer.appendChild(button);
            });
        }
    
        // Funktion zum Anzeigen des ausgewählten Prompts
        async function showDisplayView(workflow) {
            selectionView.style.display = 'none';
            displayView.style.display = 'block';
    
            workflowTitleEl.textContent = workflow.title;
            workflowContentEl.textContent = 'Wird geladen...';
            textToCopy = '';
    
            try {
                const response = await fetch(workflow.file);
                if (!response.ok) throw new Error(`HTTP-Fehler! Status: ${response.status}`);
                
                const fullText = await response.text();
                // Extrahiere nur den Prompt-Teil
                const promptMarker = '---';
                const promptStartIndex = fullText.indexOf(promptMarker);
                textToCopy = (promptStartIndex !== -1) 
                    ? fullText.substring(promptStartIndex + promptMarker.length).trim() 
                    : fullText;
    
                workflowContentEl.textContent = textToCopy;
            } catch (error) {
                workflowContentEl.textContent = 'Fehler beim Laden des Workflows.';
                console.error(`Fehler beim Abrufen der Datei ${workflow.file}:`, error);
            }
        }
    
        // Event-Listener
        openBtn.addEventListener('click', () => {
            modal.classList.add('visible');
            showSelectionView(); // Starte immer mit der Auswahlansicht
        });
    
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('visible');
        });
    
        backButton.addEventListener('click', showSelectionView);
    
        modal.addEventListener('click', (event) => {
            if (event.target === modal) { // Schließt nur bei Klick auf den Hintergrund
                modal.classList.remove('visible');
            }
        });
    
        copyButton.addEventListener('click', () => {
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = copyButton.textContent;
                    copyButton.textContent = 'Kopiert!';
                    setTimeout(() => { copyButton.textContent = originalText; }, 2000);
                });
            }
        });
    }
    // --- ERSTER APP-START ---
    renderApp(appData);
});