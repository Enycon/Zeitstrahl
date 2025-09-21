// js/main.js
import { breakthroughData } from './data.js';
import { initTimeline } from './timeline.js';

document.addEventListener('DOMContentLoaded', function() {
    // --- GLOBALER APP-ZUSTAND ---
    let appData = [...breakthroughData];
    let allKnownGroups = [...new Set(appData.map(d => d.group))];
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
        setupControls(groupInfo, redraw);
    }

    // --- DETAILS-FENSTER LOGIK ---
    function createDetailsHandlers() {
        const timelinesWrapper = document.getElementById('timelines-wrapper');
        const detailsPane = document.getElementById('details-pane');
        const detailsTitle = document.getElementById('details-title');
        const detailsDate = document.getElementById('details-date');
        const detailsText = document.getElementById('details-text');

        return {
            show: (d) => {
                detailsTitle.innerText = d.content;
                detailsDate.innerText = d.date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
                detailsText.innerText = d.details;
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
        const groupsToRender = [...new Set(groupInfo.keys())];

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

            if (activeLanes.length < 2) {
                activeLanes.push(name);
            } else {
                checkbox.checked = false;
                info.boxGroup.style("display", "none");
                info.lineGroup.style("display", "none");
            }

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    activeLanes.push(name);
                    info.boxGroup.style("display", "inline");
                    info.lineGroup.style("display", "inline");
                    if (activeLanes.length > 2) {
                        const laneToDeactivate = activeLanes.shift();
                        allCheckboxes.get(laneToDeactivate).checked = false;
                        const groupToDeactivate = groupInfo.get(laneToDeactivate);
                        groupToDeactivate.boxGroup.style("display", "none");
                        groupToDeactivate.lineGroup.style("display", "none");
                    }
                } else {
                    activeLanes.splice(activeLanes.indexOf(name), 1);
                    info.boxGroup.style("display", "none");
                    info.lineGroup.style("display", "none");
                }

                // Zeichne die Timeline neu, um die Höhe anzupassen
                redraw();
            });
        });
    }

    // --- KATEGORIE-MANAGEMENT-MODAL ---
    const manageModal = document.getElementById('manage-categories-modal');
    const manageBtn = document.getElementById('manage-btn');
    const closeBtn = manageModal.querySelector('.modal-close-btn');
    const categoryListContainer = document.getElementById('category-list-container');
    const addCategoryForm = document.getElementById('add-category-form');

    function populateCategoryManager() {
        categoryListContainer.innerHTML = '';
        allKnownGroups.forEach(group => {
            const item = document.createElement('div');
            item.className = 'category-list-item';
            item.innerHTML = `<span>${group}</span>`;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'category-delete-btn';
            deleteBtn.textContent = 'Löschen';
            deleteBtn.onclick = () => handleDeleteCategory(group);

            item.appendChild(deleteBtn);
            categoryListContainer.appendChild(item);
        });
    }

    function handleDeleteCategory(groupToDelete) {
        if (confirm(`Möchtest du die Kategorie "${groupToDelete}" und alle zugehörigen Ereignisse wirklich löschen?`)) {
            // Filtere die Daten und die bekannten Gruppen
            appData = appData.filter(event => event.group !== groupToDelete);
            allKnownGroups = allKnownGroups.filter(g => g !== groupToDelete);
            
            // Zeichne die App neu und aktualisiere das Management-Fenster
            renderApp(appData);
            populateCategoryManager();
        }
    }

    manageBtn.addEventListener('click', () => {
        populateCategoryManager();
        manageModal.classList.remove('is-hidden');
    });

    closeBtn.addEventListener('click', () => manageModal.classList.add('is-hidden'));
    manageModal.addEventListener('click', (e) => {
        if (e.target === manageModal) {
            manageModal.classList.add('is-hidden');
        }
    });

    addCategoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newCategoryName = new FormData(addCategoryForm).get('newCategoryName').toLowerCase().trim();

        if (newCategoryName && !allKnownGroups.includes(newCategoryName)) {
            allKnownGroups.push(newCategoryName);
            // Zeichne die App neu und aktualisiere das Management-Fenster
            renderApp(appData);
            populateCategoryManager();
            addCategoryForm.reset();
        } else {
            alert("Dieser Kategoriename existiert bereits oder ist ungültig.");
        }
    });


    // --- ERSTER APP-START ---
    renderApp(appData);
});