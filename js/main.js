// js/main.js
import { initTimeline } from './timeline.js';

document.addEventListener('DOMContentLoaded', function() {
    const timelinesWrapper = document.getElementById('timelines-wrapper');
    // --- DETAILS-FENSTER LOGIK ---
    const detailsPane = document.getElementById('details-pane');
    const detailsTitle = document.getElementById('details-title');
    const detailsDate = document.getElementById('details-date');
    const detailsText = document.getElementById('details-text');
    let currentItemId = null;

    const detailsHandlers = {
        show: (d) => {
            currentItemId = d.id;
            detailsTitle.innerText = d.content;
            detailsDate.innerText = d.date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
            detailsText.innerText = d.details;
            detailsPane.classList.add('visible');
            timelinesWrapper.classList.add('details-visible');
        },
        hide: () => {
            currentItemId = null;
            detailsPane.classList.remove('visible');
            timelinesWrapper.classList.remove('details-visible');
        }
    };

    // --- TIMELINE INITIALISIERUNG ---
    // Wir übergeben die Details-Handler an die Timeline, damit sie diese aufrufen kann.
    // Die Funktion gibt die D3-Gruppen zurück, damit wir sie hier steuern können.
    const { scienceGroup, aiGroup } = initTimeline('#d3-timeline-container', detailsHandlers);

    // --- CHECKBOX-LOGIK ---
    const toggleScience = document.getElementById('toggle-science');
    const toggleAi = document.getElementById('toggle-ai');

    function handleToggle() {
        scienceGroup.style("display", toggleScience.checked ? "inline" : "none");
        aiGroup.style("display", toggleAi.checked ? "inline" : "none");
    }

    toggleScience.addEventListener('change', handleToggle);
    toggleAi.addEventListener('change', handleToggle);
});