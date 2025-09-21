// Wir warten, bis die Webseite vollständig geladen ist, bevor wir unser Skript ausführen.
document.addEventListener('DOMContentLoaded', function() {
    // --- DATEN ---
    const breakthroughData = [
        { id: 1, group: 'science', content: 'DNA-Doppelhelix', start: '1953-02-28', details: 'Watson und Crick beschreiben die Struktur der DNA, was die Grundlage für die moderne Genetik und Biotechnologie legt.' },
        { id: 2, group: 'ai', content: 'Dartmouth Workshop', start: '1956-07-01', details: 'Ein Sommer-Workshop am Dartmouth College, der als Geburtsstunde der Künstlichen Intelligenz als Forschungsfeld gilt.' },
        { id: 3, group: 'ai', content: 'Deep Blue besiegt Kasparov', start: '1997-05-11', details: 'Der IBM-Supercomputer Deep Blue besiegt den amtierenden Schachweltmeister Garri Kasparov in einem Match.' },
        { id: 4, group: 'science', content: 'Menschliches Genom sequenziert', start: '2003-04-14', details: 'Das Human Genome Project schließt die Sequenzierung des menschlichen Genoms ab, ein Meilenstein für die Medizin.' },
        { id: 5, group: 'ai', content: 'AlexNet gewinnt ImageNet', start: '2012-09-30', details: 'Ein neuronales Netz namens AlexNet gewinnt den ImageNet-Wettbewerb mit einer signifikant niedrigeren Fehlerrate und löst die Deep-Learning-Revolution aus.' },
        { id: 6, group: 'science', content: 'CRISPR-Cas9 als Gen-Werkzeug', start: '2012-06-28', details: 'Charpentier und Doudna veröffentlichen ihre Entdeckung, wie CRISPR-Cas9 zur gezielten Genom-Editierung verwendet werden kann. KI-Modelle helfen heute bei der Optimierung von CRISPR-Anwendungen.' },
        { id: 7, group: 'ai', content: 'AlphaGo besiegt Lee Sedol', start: '2016-03-15', details: 'Googles AlphaGo besiegt den Weltmeister Lee Sedol im Go, einem Spiel, das als weitaus komplexer als Schach gilt.' },
        { id: 8, group: 'science', content: 'Erstes Bild eines Schwarzen Lochs', start: '2019-04-10', details: 'Das Event Horizon Telescope-Projekt veröffentlicht das erste direkte Bild eines Schwarzen Lochs. KI-Algorithmen waren entscheidend, um die Daten von Teleskopen weltweit zu einem Bild zusammenzufügen.' },
        { id: 9, group: 'ai', content: 'Veröffentlichung von GPT-3', start: '2020-06-11', details: 'OpenAI veröffentlicht GPT-3, eines der bis dahin größten und fähigsten Sprachmodelle, das die Tür für eine neue Generation von KI-Anwendungen öffnet.' },
        { id: 10, group: 'ai', content: 'Veröffentlichung von ChatGPT', start: '2022-11-30', details: 'OpenAI veröffentlicht ChatGPT, ein Modell, das die öffentliche Wahrnehmung von KI nachhaltig verändert und einen globalen Hype auslöst.' },
    ].map(d => ({ ...d, date: new Date(d.start) })); // Konvertiere Datum-Strings in Date-Objekte

    // --- KONFIGURATION ---
    const container = d3.select("#d3-timeline-container");
    const width = container.node().getBoundingClientRect().width;
    const height = 350;
    const margin = { top: 20, right: 40, bottom: 20, left: 40 };

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    const originalDomain = d3.extent(breakthroughData, d => d.date);

    const timeScale = d3.scaleTime()
        .domain(originalDomain)
        .range([margin.left, width - margin.right]);

    let currentScale = timeScale;
    let focusedItemId = null;

    // Manuelle, robuste Fisheye-Implementierung
    function createFisheyeScale(baseScale) {
        const distortion = 12; // Stärke der Verzerrung (nochmals erhöht)
        const radius = 300;   // Radius des Fokusbereichs (vergrößert auf ca. 60-70% der Breite)
        let focus = width / 2;

        function scale(x) {
            const linear_x = baseScale(x);
            const dx = linear_x - focus;
            const dd = Math.abs(dx);

            if (dd >= radius) return linear_x;

            // Robuste und bewährte Formel für den Fisheye-Effekt
            const new_dx = Math.sign(dx) * dd * (distortion + 1) / (distortion * (dd / radius) + 1);
            return focus + new_dx;
        }

        // Die "scale" Funktion muss sich wie eine echte D3-Skala verhalten.
        // Wir kopieren die notwendigen Methoden von der Basis-Skala.
        scale.domain = function(_) { return arguments.length ? (baseScale.domain(_), scale) : baseScale.domain(); };
        scale.range = function(_) { return arguments.length ? (baseScale.range(_), scale) : baseScale.range(); };
        scale.copy = function() { return createFisheyeScale(baseScale.copy()); };
        scale.ticks = function(count) { return baseScale.ticks(count); };
        scale.tickFormat = function(count, specifier) { return baseScale.tickFormat(count, specifier); };

        scale.focus = function(_) {
            if (!arguments.length) return focus;
            focus = +_;
            return scale;
        };

        return scale;
    }

    // Gruppen für die verschiedenen Elemente
    const axisGroup = svg.append("g").attr("class", "timeline-axis");
    const scienceGroup = svg.append("g").attr("class", "science-items");
    const aiGroup = svg.append("g").attr("class", "ai-items");

    function drawTimeline() {
        // Achse zeichnen
        const xAxis = d3.axisBottom(currentScale).ticks(width / 100).tickSize(height - margin.top - margin.bottom);
        axisGroup
            .attr("transform", `translate(0, ${margin.top})`)
            .transition().duration(750)
            .call(xAxis)
            .selectAll("text")
            .attr("y", height / 2 - margin.top - 10);

        axisGroup.select(".domain").remove(); // Hauptachse entfernen, Ticks dienen als Linien

        // Funktion zum Zeichnen der Items für eine Gruppe
        function drawItems(selection, groupName, yPosition, color) {
            const items = selection.selectAll("g.item-group")
                .data(breakthroughData.filter(d => d.group === groupName), d => d.id);

            // Enter
            const itemEnter = items.enter().append("g")
                .attr("class", "item-group")
                .attr("transform", d => `translate(${currentScale(d.date)}, ${yPosition})`)
                .on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut)
                .on("click", handleItemClick);

            itemEnter.append("line")
                .attr("class", "item-link")
                .attr("y1", yPosition === height / 2 - 50 ? 25 : -25)
                .attr("y2", 0);

            const rects = itemEnter.append("rect")
                .attr("x", -50)
                .attr("y", yPosition === height / 2 - 50 ? -20 : 0)
                .attr("width", 100)
                .attr("height", 25)
                .attr("rx", 5)
                .style("fill", color);

            itemEnter.append("text")
                .attr("y", yPosition === height / 2 - 50 ? -2.5 : 17.5)
                .text(d => d.content);

            // Update
            items.merge(itemEnter)
                .transition().duration(750)
                .attr("transform", d => `translate(${currentScale(d.date)}, ${yPosition})`);

            // Exit
            items.exit().remove();
        }

        drawItems(scienceGroup, 'science', height / 2 - 50, "var(--science-color)");
        drawItems(aiGroup, 'ai', height / 2 + 50, "var(--ai-color)");
    }

    // --- INITIALISIERUNG ---
    drawTimeline();

    // --- INTERAKTIVITÄT ---
    const toggleScience = document.getElementById('toggle-science');
    const toggleAi = document.getElementById('toggle-ai');
    function handleToggle() {
        scienceGroup.style("display", toggleScience.checked ? "inline" : "none");
        aiGroup.style("display", toggleAi.checked ? "inline" : "none");
    }
    toggleScience.addEventListener('change', handleToggle);
    toggleAi.addEventListener('change', handleToggle);

    const detailsPane = document.getElementById('details-pane');
    const detailsTitle = document.getElementById('details-title');
    const detailsDate = document.getElementById('details-date');
    const detailsText = document.getElementById('details-text');
    let currentItemId = null;

    function handleMouseOver(event, d) {
        if (d.id === currentItemId) return;
        currentItemId = d.id;
        detailsTitle.innerText = d.content;
        detailsDate.innerText = d.date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
        detailsText.innerText = d.details;
        detailsPane.classList.add('visible');
    }

    function handleMouseOut(event, d) {
        if (d.id === currentItemId) {
            currentItemId = null;
            detailsPane.classList.remove('visible');
        }
    }

    function handleItemClick(event, d) {
        // Verhindert, dass der Klick zum SVG "durchgereicht" wird und den Reset auslöst
        event.stopPropagation();

        // 1. Erstelle eine temporäre, lineare Skala, die auf das Ereignis zentriert und gezoomt ist.
        //    Dies dient dazu, die detaillierteren Achsen-Ticks zu generieren.
        const zoomTimeSpan = 1000 * 60 * 60 * 24 * 365 * 15; // 15-Jahres-Fenster für mehr Details
        const centerDate = d.date;
        const zoomedScale = d3.scaleTime()
            .domain([new Date(centerDate.getTime() - zoomTimeSpan / 2), new Date(centerDate.getTime() + zoomTimeSpan / 2)])
            .range(timeScale.range());

        // 2. Erstelle die Fisheye-Skala. Sie basiert auf der GEZOOMTEN Skala, um die Details zu bekommen.
        const fisheyeScale = createFisheyeScale(zoomedScale);
        fisheyeScale.focus(zoomedScale(centerDate)); // Setze den Fokus genau auf das Ereignis
        currentScale = fisheyeScale;

        // 3. Zeichne die Timeline mit der neuen, verzerrten Skala neu
        drawTimeline();

        // 4. Setze visuellen Fokus
        d3.selectAll(".item-group").classed("is-focused", false);
        d3.select(this).classed("is-focused", true);
        focusedItemId = d.id;
        document.body.classList.add('is-zoomed');
    }

    // Klick auf den SVG-Hintergrund, um den Zoom zurückzusetzen
    svg.on('click', () => {
        // Führe den Reset nur aus, wenn wir uns im Zoom-Modus befinden
        if (document.body.classList.contains('is-zoomed')) {
            // Setze die Domain und die Skala auf den Ursprung zurück
            timeScale.domain(originalDomain);
            currentScale = timeScale;
            drawTimeline();

            // Entferne Fokus
            d3.selectAll(".item-group").classed("is-focused", false);
            focusedItemId = null;
            document.body.classList.remove('is-zoomed');
        }
    });
});