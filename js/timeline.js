// js/timeline.js
import { breakthroughData } from './data.js';
import { createFisheyeScale } from './fisheye.js';

export function initTimeline(containerSelector, detailsHandlers) {
	// --- KONFIGURATION ---
	const container = d3.select(containerSelector);
	const width = container.node().getBoundingClientRect().width;
	const height = 350;
	const margin = { top: 20, right: 40, bottom: 20, left: 40 };

	const svg = container.append("svg")
		.attr("width", width)
		.attr("height", height);

	// Sortiere die Daten einmalig nach Datum für die Nachbarsuche beim Zoomen
	const sortedData = [...breakthroughData].sort((a, b) => a.date - b.date);

	const originalDomain = d3.extent(sortedData, d => d.date);

	// Die Skala wird nur einmal initialisiert und nicht mehr verändert (kein Zoom/Pan).
	const timeScale = d3.scaleTime()
		.domain(originalDomain)
		.range([margin.left, width - margin.right]);

	let linearBaseScale = timeScale; // Hält die aktuelle lineare Skala (ohne Fisheye)
	let currentScale = timeScale; // Die aktuell verwendete Skala (kann linear oder fisheye sein)
	let focusedItemId = null;

	// Gruppen für die verschiedenen Elemente
	const axisGroup = svg.append("g").attr("class", "timeline-axis");
	const scienceGroup = svg.append("g").attr("class", "science-items");
	const aiGroup = svg.append("g").attr("class", "ai-items");

	function drawTimeline() {
		const isZoomed = typeof currentScale.focus === 'function';

		// --- 1. TICKS VORBEREITEN (NEUE, KLARE LOGIK) ---
		let majorTicks, minorTicks;

		if (isZoomed) {
			majorTicks = currentScale.ticks(d3.timeYear.every(1));   // Jahre sind Haupt-Ticks
			minorTicks = currentScale.ticks(d3.timeMonth.every(1)); // Monate sind Neben-Ticks
		} else {
			majorTicks = currentScale.ticks(d3.timeYear.every(5));   // 5-Jahres-Schritte sind Haupt-Ticks
			minorTicks = currentScale.ticks(d3.timeYear.every(1));   // Jedes Jahr ist ein Neben-Tick
		}
		const majorTickSet = new Set(majorTicks.map(d => d.getTime()));
		
		// Kombiniere alle Ticks zu einer einzigen, sortierten Liste
		const allTimestamps = new Set([...majorTicks.map(d => d.getTime()), ...minorTicks.map(d => d.getTime())]);
		const allTicks = Array.from(allTimestamps).map(ts => new Date(ts)).sort((a, b) => a - b);

		// --- 2. ACHSE ERSTELLEN UND ZEICHNEN ---
		const xAxis = d3.axisBottom(currentScale)
			.tickValues(allTicks) // Verwende die komplette, kombinierte Tick-Liste
			.tickFormat(d => {
				// Zeige nur Labels für Haupt-Ticks an
				return majorTickSet.has(d.getTime()) ? d3.timeFormat("%Y")(d) : "";
			})
			.tickSize(height - margin.top - margin.bottom);

		axisGroup
			.attr("transform", `translate(0, ${margin.top})`)
			.transition().duration(750)
			.call(xAxis); // Lässt D3 die Achse inkl. aller Attribute animieren
		
		// Überschreibe die "y"-Animation der Labels mit einer sofortigen Transition.
		// Das stoppt den "Einflug"-Effekt, ohne die horizontale Bewegung zu stören.
		axisGroup.selectAll(".tick text")
			.transition().duration(0)
			.attr("y", height / 2 - margin.top - 10);

		axisGroup.select(".domain").remove();

		// --- 3. ACHSE NACHBEARBEITEN ---
		// Passe die Länge der Tick-Linien an, um eine visuelle Hierarchie zu schaffen.
		axisGroup.selectAll(".tick")
			.select("line")
			.transition().duration(750)
			.attr("y1", d => {
				// Lange Linie für Haupt-Ticks, kurze für Neben-Ticks
				return majorTickSet.has(d.getTime()) ? 0 : height / 2 - 40;
			})
			.attr("y2", d => {
				return majorTickSet.has(d.getTime()) ? height - margin.top - margin.bottom : height / 2 + 20;
			})
			.attr("stroke", "#555");

		// --- 4. TICKS PERFORMAT AUSDÜNNEN (VISUELL) ---
		if (isZoomed) {
			let lastPixelPos = -Infinity;
			axisGroup.selectAll(".tick").each(function(d) {
				const tickElement = d3.select(this);
				const pixelPos = currentScale(d);
				const isMajor = majorTickSet.has(d.getTime());
				const minSpacing = isMajor ? 60 : 25;

				tickElement.attr("opacity", (pixelPos - lastPixelPos >= minSpacing) ? 1 : 0);
				if (pixelPos - lastPixelPos >= minSpacing) lastPixelPos = pixelPos;
			});
		}

		function drawItems(selection, groupName, base_y, color) {
			const itemPadding = 5; // Horizontaler Abstand zwischen Elementen
			const levelHeight = 40; // Vertikaler Abstand für jede Ausweich-Ebene
			const textPadding = 20; // Horizontaler Innenabstand (links + rechts) für den Text im Rechteck

			// Filtere und sortiere die Daten für die Layout-Berechnung
			const groupData = breakthroughData
				.filter(d => d.group === groupName)
				.sort((a, b) => a.date - b.date);
			
			// Berechne für jedes Element eine "Ebene", um Überlappungen zu vermeiden
			const levelEndPositions = []; // Speichert die End-Position (x + width) für jede Ebene
			groupData.forEach(d => {
				// Berechne die Breite, falls sie noch nicht existiert (wichtig für den ersten Durchlauf)
				if (!d.width) {
					// Temporäres Text-Element zum Messen erstellen (wird nicht gerendert)
					const text = svg.append("text").attr("class", "item-group-text-hidden").text(d.content);
					d.width = text.node().getBBox().width + textPadding;
					text.remove();
				}
				const x = currentScale(d.date);
				let level = 0;
				while (levelEndPositions[level] && x - d.width / 2 < levelEndPositions[level] + itemPadding) {
					level++;
				}
				d.level = level; // Speichere die Ebene im Datenobjekt
				levelEndPositions[level] = x + d.width / 2;
			});

			const items = selection.selectAll("g.item-group")
				.data(groupData, d => d.id);

			const itemEnter = items.enter().append("g")
				.attr("class", "item-group")
				.attr("transform", d => `translate(${currentScale(d.date)}, ${base_y + (base_y < height / 2 ? -d.level * levelHeight : d.level * levelHeight)})`)
				.on("click", handleItemClick);

			itemEnter.append("text")
				.attr("y", base_y < height / 2 ? -2.5 : 17.5)
				.text(d => d.content);
			
			itemEnter.append("line")
				.attr("class", "item-link")
				.attr("y1", base_y < height / 2 ? 25 : -25)
				.attr("y2", 0);

			// Füge das Rechteck HINTER dem Text ein (DOM-Reihenfolge) und nutze die berechnete Breite
			itemEnter.insert("rect", "text")
				.attr("x", d => -d.width / 2)
				.attr("y", base_y < height / 2 ? -20 : 0)
				.attr("width", d => d.width)
				.attr("height", 25)
				.attr("rx", 5)
				.style("fill", color);

			items.merge(itemEnter)
				.transition().duration(750)
				.attr("transform", d => `translate(${currentScale(d.date)}, ${base_y + (base_y < height / 2 ? -d.level * levelHeight : d.level * levelHeight)})`);

			items.exit().remove();
		}

		drawItems(scienceGroup, 'science', height / 2 - 50, "var(--science-color)");
		drawItems(aiGroup, 'ai', height / 2 + 50, "var(--ai-color)");
	}

	function handleItemClick(event, d, element) {
		event.stopPropagation();

		// Wenn auf das bereits fokussierte Element geklickt wird, schließe die Details.
		if (focusedItemId === d.id) { // Und setze den Zoom zurück
			resetFocusAndDetails();
			return;
		}

		// --- DYNAMISCHER ZOOM basierend auf Nachbarn ---
		// Filtere die Daten, um nur die Nachbarn der gleichen Kategorie zu berücksichtigen
		const category = d.group;
		const categorySortedData = sortedData.filter(item => item.group === category);
		const currentIndexInCategory = categorySortedData.findIndex(item => item.id === d.id);

		const prevItem = currentIndexInCategory > 0 ? categorySortedData[currentIndexInCategory - 1] : null;
		const nextItem = currentIndexInCategory < categorySortedData.length - 1 ? categorySortedData[currentIndexInCategory + 1] : null;

		// Bestimme die äußeren Grenzen für den Zoom (idealerweise die übernächsten Nachbarn)
		let neighborStartDate, neighborEndDate;

		// Start-Datum bestimmen (übernächster, dann direkter Nachbar, dann Timeline-Anfang)
		if (currentIndexInCategory > 1) {
			neighborStartDate = categorySortedData[currentIndexInCategory - 2].date;
		} else if (prevItem) {
			neighborStartDate = prevItem.date;
		} else {
			neighborStartDate = originalDomain[0];
		}

		// End-Datum bestimmen (übernächster, dann direkter Nachbar, dann Timeline-Ende)
		if (currentIndexInCategory < categorySortedData.length - 2) {
			neighborEndDate = categorySortedData[currentIndexInCategory + 2].date;
		} else if (nextItem) {
			neighborEndDate = nextItem.date;
		} else {
			neighborEndDate = originalDomain[1];
		}

		// Berechne die gesamte Zeitspanne, die wir anzeigen wollen.
		const timeSpan = neighborEndDate.getTime() - neighborStartDate.getTime();
		const padding = timeSpan > 0 ? timeSpan * 0.25 : 1000 * 60 * 60 * 24 * 365 * 10; // 10 Jahre Puffer, falls kein Abstand
		const totalSpanWithPadding = timeSpan + padding * 2;

		// Erstelle die neue Domain, die EXAKT um das geklickte Datum zentriert ist.
		const centerDate = d.date;
		const domainStart = new Date(centerDate.getTime() - totalSpanWithPadding / 2);
		const domainEnd = new Date(centerDate.getTime() + totalSpanWithPadding / 2);
		// --- ENDE DYNAMISCHER ZOOM ---

		// 1. Erstelle die neue, gezoomte lineare Skala.
		const zoomedScale = d3.scaleTime()
			.domain([domainStart, domainEnd])
			.range(timeScale.range());

		// 2. Erstelle die Fisheye-Skala, basierend auf der gezoomten Skala.
		linearBaseScale = zoomedScale; // Speichere die gezoomte lineare Skala für die Ticks
		currentScale = createFisheyeScale(zoomedScale).focus((timeScale.range()[0] + timeScale.range()[1]) / 2);

		// 3. Zeichne die Timeline mit der neuen, verzerrten Skala neu.
		drawTimeline();

		// 4. Zeige Details für das neue Element an
		detailsHandlers.show(d);

		// 5. Setze den visuellen Fokus
		d3.selectAll(".item-group").classed("is-focused", false);
		d3.select(event.currentTarget).classed("is-focused", true);
		focusedItemId = d.id;
	}

	function resetFocusAndDetails() {
		if (focusedItemId !== null) {
			// Setze die Skala auf den Ursprung zurück
			linearBaseScale = timeScale;
			currentScale = timeScale;
			drawTimeline();

			// Verstecke die Details und entferne den Fokus
			detailsHandlers.hide();
			d3.selectAll(".item-group").classed("is-focused", false);
			focusedItemId = null;
		}
	}

	svg.on('click', resetFocusAndDetails);

	// Initialisierung
	drawTimeline();

	// Exponiere die Gruppen, damit sie von außen gesteuert werden können (z.B. für Toggles)
	return { scienceGroup, aiGroup };
}