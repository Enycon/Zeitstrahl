// js/timeline.js
import { createFisheyeScale } from './fisheye.js';

export function initTimeline(containerSelector, data, allGroupNames, detailsHandlers) {
	// --- DYNAMISCHE KONFIGURATION basierend auf Daten ---
	// 1. Alle einzigartigen Gruppen aus den Daten extrahieren
	const groupNames = allGroupNames;
	
	// 2. Berechne die benötigte Höhe dynamisch
	const laneOffset = 50; // Grundabstand von der Mittellinie
	const laneHeight = 80; // Abstand zwischen den Zeitstrahl-Spuren
	const verticalPadding = 60; // Zusätzlicher Platz oben und unten
	const maxOffsetFromCenter = laneOffset + Math.floor((groupNames.length - 1) / 2) * laneHeight;
	const height = (maxOffsetFromCenter + verticalPadding) * 2;

	// --- KONFIGURATION ---
	const container = d3.select(containerSelector);
	const width = container.node().getBoundingClientRect().width;
	const margin = { top: 20, right: 40, bottom: 20, left: 40 };
	const animationDuration = 1200; // Zentrale Animationsdauer in ms

	const svg = container.append("svg")
		.attr("width", width)
		.attr("height", height);

	// Feste Gruppe für die Achse - wird zuerst gezeichnet (im Hintergrund)
	const axisGroup = svg.append("g").attr("class", "timeline-axis");

	// Erstelle globale Ebenen, um die Render-Reihenfolge zu steuern
	// (Linien unten, Boxen oben)
	const lineLayer = svg.append("g").attr("class", "layer-lines");
	const boxLayer = svg.append("g").attr("class", "layer-boxes");

	// Sortiere die Daten einmalig nach Datum für die Nachbarsuche beim Zoomen
	const sortedData = [...data].sort((a, b) => a.date - b.date);

	// --- NEU: Domain mit dynamischem Padding ---
	let originalDomain;
	const [minDate, maxDate] = d3.extent(sortedData, d => d.date);

	if (minDate && maxDate) {
		const timeSpan = maxDate.getTime() - minDate.getTime();
		// 5% Padding, aber mindestens 1 Jahr, falls die Spanne 0 ist (bei nur einem Event)
		const padding = timeSpan > 0 ? timeSpan * 0.05 : 1000 * 60 * 60 * 24 * 365;

		originalDomain = [
			new Date(minDate.getTime() - padding),
			new Date(maxDate.getTime() + padding)
		];
	} else {
		// Fallback, falls keine Daten vorhanden sind: Zeige die letzten 10 Jahre an.
		const now = new Date();
		originalDomain = [d3.timeYear.offset(now, -10), now];
	}

	// Die Skala wird nur einmal initialisiert und nicht mehr verändert (kein Zoom/Pan).
	const timeScale = d3.scaleTime()
		.domain(originalDomain)
		.range([margin.left, width - margin.right]);

	let linearBaseScale = timeScale; // Hält die aktuelle lineare Skala (ohne Fisheye)
	let currentScale = timeScale; // Die aktuell verwendete Skala (kann linear oder fisheye sein)
	let focusedItemId = null;

	// --- DYNAMISCHE GRUPPEN-VERWALTUNG ---
	// Eine Farbskala erstellen, die jeder Gruppe automatisch eine Farbe zuweist
	const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

	// Informationen und SVG-Elemente für jede Gruppe speichern
	const groupInfo = new Map();
	groupNames.forEach((name, i) => {
		groupInfo.set(name, {
			name: name,
			isUp: i % 2 === 0, // Speichern, ob die Lane oben oder unten ist
			color: colorScale(name),
			lineGroup: lineLayer.append("g").attr("class", `timeline-group-lines timeline-group-${name}`),
			boxGroup: boxLayer.append("g").attr("class", `timeline-group-boxes timeline-group-${name}`)
		});
	});

	function drawTimeline() {
		// --- NEUE, ROBUSTE HÖHENBERECHNUNG ---
		const laneOffset = 50; // Grundabstand von der Mittellinie
		const laneHeight = 80; // Abstand zwischen den Zeitstrahl-Spuren
		const levelHeight = 40; // Vertikaler Abstand für jede Ausweich-Ebene
		const verticalPadding = 30; // Etwas mehr Platz, um Clipping der Boxen zu verhindern

		let maxLevelUp = 0;
		let maxLevelDown = 0;

		// 1. Berechne für alle sichtbaren Gruppen die maximale Stapelhöhe
		groupInfo.forEach((info, name) => {
			if (info.boxGroup.style("display") !== "none") {
				const groupData = data.filter(d => d.group === name);
				const { maxLevel } = calculateLayout(groupData, currentScale);
				if (info.isUp) {
					maxLevelUp = Math.max(maxLevelUp, maxLevel);
				} else {
					maxLevelDown = Math.max(maxLevelDown, maxLevel);
				}
			}
		});

		// 2. Berechne die finale Höhe der SVG basierend auf der Stapelung
		const heightUp = laneOffset + maxLevelUp * levelHeight + verticalPadding;
		const heightDown = laneOffset + maxLevelDown * levelHeight + verticalPadding;
		const height = heightUp + heightDown;
		svg.transition().duration(animationDuration).attr("height", height);

		// 3. Berechne die Y-Positionen der Lanes neu, basierend auf der finalen Höhe
		let upIndex = 0;
		let downIndex = 0;
		groupInfo.forEach(info => {
			if (info.isUp) {
				// Setze die Y-Position der Lane sofort, ohne Transition.
				// Die Animation wird von den Items selbst übernommen.
				info.y = heightUp - (laneOffset + upIndex * laneHeight);
				upIndex++;
			} else {
				info.y = heightUp + (laneOffset + downIndex * laneHeight); // Sofort setzen
				downIndex++;
			}
		});
		// --- ENDE HÖHENBERECHNUNG ---


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
				// Für Haupt-Ticks immer das Jahr anzeigen
				if (majorTickSet.has(d.getTime())) {
					return d3.timeFormat("%Y")(d);
				}
				// Im Zoom-Modus für Neben-Ticks den Monat anzeigen
				if (isZoomed) {
					return d3.timeFormat("%b")(d); // %b = Monatsabkürzung, z.B. "Jan"
				}
				// Ansonsten kein Label für Neben-Ticks
				return "";
			})
			.tickSize(height - margin.top - margin.bottom);

		axisGroup
			.attr("transform", `translate(0, ${margin.top})`)
			.transition().duration(animationDuration)
			.call(xAxis); // Lässt D3 die Achse inkl. aller Attribute animieren
		
		// Überschreibe die "y"-Animation der Labels mit einer sofortigen Transition.
		// Das stoppt den "Einflug"-Effekt, ohne die horizontale Bewegung zu stören.
		axisGroup.selectAll(".tick text")
			.transition().duration(animationDuration)
			.attr("y", heightUp - margin.top - 10);

		axisGroup.select(".domain").remove();

		// --- 3. ACHSE NACHBEARBEITEN ---
		// Passe die Länge der Tick-Linien an, um eine visuelle Hierarchie zu schaffen.
		axisGroup.selectAll(".tick")
			.select("line")
			.transition().duration(animationDuration)
			.attr("y1", d => {
				// Lange Linie für Haupt-Ticks, kurze für Neben-Ticks
				return majorTickSet.has(d.getTime()) ? 0 : heightUp - 40;
			})
			.attr("y2", d => {
				return majorTickSet.has(d.getTime()) ? height - margin.top - margin.bottom : heightUp + 20;
			})
			.attr("stroke", "#555");

		// --- 4. TICKS PERFORMAT AUSDÜNNEN (VISUELL) ---
		if (isZoomed) {
			let lastPixelPos = -Infinity;
			axisGroup.selectAll(".tick").each(function(d) {
				const tickElement = d3.select(this);
				const pixelPos = currentScale(d);
				const isMajor = majorTickSet.has(d.getTime());
				const minSpacing = isMajor ? 60 : 35; // Etwas mehr Platz für Monats-Labels

				tickElement.attr("opacity", (pixelPos - lastPixelPos >= minSpacing) ? 1 : 0);
				if (pixelPos - lastPixelPos >= minSpacing) lastPixelPos = pixelPos;
			});
		}

		// Layout-Berechnung von der Zeichen-Funktion getrennt
		function calculateLayout(groupData, scale) {
			const itemPadding = 5;
			const textPadding = 20;
			let maxLevel = 0;

			groupData.forEach(d => {
				if (!d.width) {
					const text = svg.append("text").attr("class", "item-group-text-hidden").text(d.content);
					d.width = text.node().getBBox().width + textPadding;
					text.remove();
				}
			});

			const levelEndPositions = [];
			groupData.sort((a, b) => a.date - b.date).forEach(d => {
				const x = scale(d.date);
				let level = 0;
				while (levelEndPositions[level] && x - d.width / 2 < levelEndPositions[level] + itemPadding) {
					level++;
				}
				d.level = level;
				levelEndPositions[level] = x + d.width / 2;
				maxLevel = Math.max(maxLevel, level);
			});
			return { maxLevel };
		}

		function drawItems(info, groupName, base_y, color) {
			const levelHeight = 40; // Vertikaler Abstand für jede Ausweich-Ebene

			const groupData = data
				.filter(d => d.group === groupName)
				.sort((a, b) => a.date - b.date);

			// --- 1. Linien zeichnen (in der unteren Ebene) ---
			const lines = info.lineGroup.selectAll("line.item-link")
				.data(groupData, d => d.id);

			const linesEnter = lines.enter().append("line")
				.attr("class", "item-link")
				.attr("x1", d => currentScale(d.date))
				.attr("x2", d => currentScale(d.date))
				.attr("y1", heightUp) // Start an der Mittelachse
				.attr("y2", d => base_y + (info.isUp ? -d.level * levelHeight + 5 : d.level * levelHeight)); // Ende am Rand der Box

			lines.merge(linesEnter).transition().duration(animationDuration)
				.attr("x1", d => currentScale(d.date))
				.attr("x2", d => currentScale(d.date))
				.attr("y1", heightUp)
				.attr("y2", d => base_y + (info.isUp ? -d.level * levelHeight + 5 : d.level * levelHeight));

			lines.exit().remove();

			// --- 2. Boxen zeichnen (in der oberen Ebene) ---
			const boxes = info.boxGroup.selectAll("g.item-box-group")
				.data(groupData, d => d.id);

			const boxesEnter = boxes.enter().append("g")
				.attr("class", "item-box-group")
				.attr("transform", d => `translate(${currentScale(d.date)}, ${base_y + (info.isUp ? -d.level * levelHeight : d.level * levelHeight)})`)
				.on("click", handleItemClick);

			boxesEnter.insert("rect", "text")
				.attr("x", d => -d.width / 2)
				.attr("y", info.isUp ? -20 : 0)
				.attr("width", d => d.width)
				.attr("height", 25)
				.attr("rx", 5)
				.style("fill", color);
			
			boxesEnter.append("text")
				.attr("y", info.isUp ? -2.5 : 17.5)
				.text(d => d.content);

			boxes.merge(boxesEnter).transition().duration(animationDuration)
				.attr("transform", d => `translate(${currentScale(d.date)}, ${base_y + (info.isUp ? -d.level * levelHeight : d.level * levelHeight)})`);

			boxes.exit().remove();
		}

		// Rufe drawItems für jede dynamisch gefundene Gruppe auf
		groupInfo.forEach((info, name) => {
			if (info.boxGroup.style("display") !== "none") {
				drawItems(info, name, info.y, info.color);
			}
		});
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
		const info = groupInfo.get(d.group);
		d3.selectAll(".item-box-group").classed("is-focused", false);
		d3.selectAll(".item-box-group rect").style("filter", null); // Reset aller Filter
		d3.select(event.currentTarget).classed("is-focused", true);
		d3.select(event.currentTarget).select("rect").style("filter", `drop-shadow(0 0 6px ${info.color})`);
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
			d3.selectAll(".item-box-group").classed("is-focused", false);
			d3.selectAll(".item-box-group rect").style("filter", null);
			focusedItemId = null;
		}
	}

	svg.on('click', resetFocusAndDetails);

	// Initialisierung
	drawTimeline();

	// Exponiere die Gruppen-Informationen, damit sie von außen gesteuert werden können
	return { groupInfo, redraw: drawTimeline };
}