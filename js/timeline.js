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

	// Die globale Skala, die den gesamten Zeitraum aller Daten abdeckt.
	const globalTimeScale = d3.scaleTime()
		.domain(originalDomain)
		.range([margin.left, width - margin.right]);

	let currentScale = globalTimeScale; // Die aktuell verwendete Skala
	let focusedItemId = null;
    
	const keyFunc = d => d.date.toISOString() + d.content; // Eindeutiger Schlüssel ohne ID

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

	let currentActiveLanes = []; // NEU: Interner Zustand für die aktiven Spuren

	function drawTimeline(newActiveLanes) {
		// Wenn neue Spuren übergeben werden (z.B. durch Klick auf eine Checkbox),
		// aktualisiere den internen Zustand. Ansonsten (z.B. bei Zoom), verwende den letzten Zustand.
		if (newActiveLanes !== undefined) {
			currentActiveLanes = newActiveLanes;
		}

		const isZoomed = typeof currentScale.focus === 'function';

		// --- NEU: Domain dynamisch anpassen ---
		// Passe die Skala nur an, wenn nicht gezoomt ist.
		if (!isZoomed) {
			const visibleData = data.filter(d => currentActiveLanes.includes(d.group));
			const [minDate, maxDate] = d3.extent(visibleData, d => d.date);
	
			let newDomain;
			if (minDate && maxDate) {
				const timeSpan = maxDate.getTime() - minDate.getTime();
				// 5% Padding, aber mindestens 1 Jahr, falls die Spanne 0 ist (bei nur einem Event)
				const padding = timeSpan > 0 ? timeSpan * 0.05 : 1000 * 60 * 60 * 24 * 365;
		
				newDomain = [
					new Date(minDate.getTime() - padding),
					new Date(maxDate.getTime() + padding)
				];
			} else {
				// Fallback, wenn keine Events sichtbar sind: Nutze die globale Domain.
				newDomain = globalTimeScale.domain();
			}
			currentScale = globalTimeScale.copy().domain(newDomain);
		}

		// --- NEU: Dynamische Zuweisung basierend auf der Klick-Reihenfolge ---
		// Setze für alle Gruppen die Positionen zurück
		groupInfo.forEach(info => {
			info.isCurrentlyUp = false;
			info.isCurrentlyDown = false;
		});

		// Weise die Positionen basierend auf der Reihenfolge im `currentActiveLanes` Array zu.
		if (currentActiveLanes.length > 0) {
			const topLaneInfo = groupInfo.get(currentActiveLanes[0]);
			if (topLaneInfo) topLaneInfo.isCurrentlyUp = true;
		}
		if (currentActiveLanes.length > 1) {
			const bottomLaneInfo = groupInfo.get(currentActiveLanes[1]);
			if (bottomLaneInfo) bottomLaneInfo.isCurrentlyDown = true;
		}
		// --- NEUE, ROBUSTE HÖHENBERECHNUNG ---
		const laneOffset = 50; // Grundabstand von der Mittellinie
		const verticalPadding = 30; // Etwas mehr Platz, um Clipping der Boxen zu verhindern

		const laneHeight = 80; // Abstand zwischen den Zeitstrahl-Spuren
		const levelHeight = 40; // Vertikaler Abstand für jede Ausweich-Ebene
		let maxLevelUp = 0;
		let maxLevelDown = 0;

		// 1. Berechne für alle sichtbaren Gruppen die maximale Stapelhöhe
		groupInfo.forEach((info, name) => {
			// Berücksichtige nur die Spuren, die jetzt aktiv sind
			if (info.isCurrentlyUp || info.isCurrentlyDown) {
				const groupData = data.filter(d => d.group === name);
				const { maxLevel } = calculateLayout(groupData, currentScale);
				if (info.isCurrentlyUp) {
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
			// WICHTIG: Die Y-Position wird nur für sichtbare Lanes neu berechnet und der Index erhöht.
			// So wird sichergestellt, dass die Spuren korrekt auf die verfügbaren Slots verteilt werden.
			if (info.isCurrentlyUp || info.isCurrentlyDown) {
				if (info.isCurrentlyUp) {
					info.y = heightUp - (laneOffset + upIndex * laneHeight);
					upIndex++;
				} else {
					info.y = heightUp + (laneOffset + downIndex * laneHeight);
					downIndex++;
				}
			}
		});
		// --- ENDE HÖHENBERECHNUNG ---


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
				// Im Zoom-Modus für Neben-Ticks den Monat anzeigen, ansonsten immer das Jahr
				if (isZoomed && !majorTickSet.has(d.getTime())) {
					return d3.timeFormat("%b")(d); // %b = Monatsabkürzung, z.B. "Jan"
				}
				// In allen anderen Fällen das Jahr anzeigen
				return d3.timeFormat("%Y")(d);
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

		// --- 3. ACHSE NACHBEARBEITEN ---
		// Positioniere die horizontale Achsenlinie (domain) in der Mitte
		axisGroup.select(".domain")
			.transition().duration(animationDuration)
			.attr("transform", `translate(0, ${heightUp - margin.top})`);

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
		let lastLabelPosition = -Infinity;
		axisGroup.selectAll(".tick text").attr("opacity", function(d) {
			const currentPosition = currentScale(d);
			const minSpacing = isZoomed ? 40 : 50; // Mindestabstand zwischen Labels
			if (currentPosition - lastLabelPosition < minSpacing) {
				return 0; // Ausblenden, wenn zu nah am vorherigen Label
			}
			lastLabelPosition = currentPosition;
			return 1; // Einblenden
		});

		// Layout-Berechnung von der Zeichen-Funktion getrennt
		function calculateLayout(groupData, scale) {
			const itemPadding = 5;
			const textPadding = 20;
			let maxLevel = 0;

			groupData.forEach(d => {
				if (!d.width) {
					const text = svg.append("text").attr("class", "item-group-text-hidden").text(d.short_title || d.content);
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
			const isVisible = info.isCurrentlyUp || info.isCurrentlyDown;

			// Wenn die Gruppe nicht sichtbar ist, ist ihr Datensatz leer.
			// Das löst die .exit() Animation für alle ihre Elemente aus.
			const groupData = isVisible ? [...data
				.filter(d => d.group === groupName)
				.sort((a, b) => a.date - b.date)] : [];

			// --- 1. Linien zeichnen (in der unteren Ebene) ---
			const lines = info.lineGroup.selectAll("line.item-link")
				.data(groupData, keyFunc);

			// ENTER (für neue Elemente)
			const linesEnter = lines.enter().append("line")
				.attr("class", "item-link")
				.attr("x1", d => currentScale(d.date))
				.attr("x2", d => currentScale(d.date)) // Start- und End-X sind gleich
				.attr("y1", height + 100) // Startet weit unter dem sichtbaren Bereich
				.attr("y2", height + 100);

			// MERGE (für neue und bestehende Elemente)
			lines.merge(linesEnter).transition().duration(animationDuration)
				.attr("x1", d => currentScale(d.date))
				.attr("x2", d => currentScale(d.date))
				.attr("y1", heightUp) // Start an der Mittelachse
				.attr("y2", d => base_y + (info.isCurrentlyUp ? -d.level * levelHeight : d.level * levelHeight));

			// EXIT (für entfernte Elemente)
			lines.exit().transition().duration(animationDuration)
				.attr("y1", -100) // Fliegt nach oben raus
				.attr("y2", -100)
				.remove();

			// --- 2. Boxen zeichnen (in der oberen Ebene) ---
			const boxes = info.boxGroup.selectAll("g.item-box-group")
				.data(groupData, keyFunc);

			// ENTER
			const boxesEnter = boxes.enter().append("g")
				.attr("class", "item-box-group")
				.attr("transform", d => `translate(${currentScale(d.date)}, ${height + 100})`) // Startet weit unten
				.on("click", handleItemClick);

			boxesEnter.insert("rect", "text")
				.attr("x", d => -d.width / 2)
				.attr("y", info.isUp ? -20 : 0) // Benutze die originale isUp für die Box-Position
				.attr("width", d => d.width)
				.attr("height", 25)
				.attr("rx", 5)
				.style("fill", color);
			
			boxesEnter.append("text")
				.attr("y", info.isUp ? -2.5 : 17.5) // Benutze die originale isUp für die Text-Position
				.text(d => d.short_title || d.content);

			// MERGE
			boxes.merge(boxesEnter).transition().duration(animationDuration)
				.attr("transform", d => `translate(${currentScale(d.date)}, ${base_y + (info.isCurrentlyUp ? -d.level * levelHeight : d.level * levelHeight)})`);

			// EXIT
			boxes.exit().transition().duration(animationDuration)
				.attr("transform", function(d) {
					const currentTransform = d3.select(this).attr("transform");
					const x = currentTransform.match(/translate\(([^,]+),/)[1];
					return `translate(${x}, -100)`; // Behalte X-Position, fliege nach oben raus
				})
				.remove();
		}

		// Rufe drawItems für jede dynamisch gefundene Gruppe auf
		groupInfo.forEach((info, name) => {
			// WICHTIG: Rufe die Zeichenfunktion nur für die Spuren auf, die jetzt aktiv sind.
			// Die Exit-Animation wird innerhalb von drawItems für die nicht mehr aktiven Spuren gehandhabt.
			calculateLayout(data.filter(d => d.group === name), currentScale); // Layout für alle berechnen
			drawItems(info, name, info.y, info.color); // Zeichnen mit der berechneten Y-Position
		});
	}

	function handleItemClick(event, d, element) {
		event.stopPropagation();

		// Wenn auf das bereits fokussierte Element geklickt wird, schließe die Details.
		if (focusedItemId === keyFunc(d)) { // Und setze den Zoom zurück
			resetFocusAndDetails();
			return;
		}

		// --- DYNAMISCHER ZOOM basierend auf Nachbarn ---
		// Filtere die Daten, um nur die Nachbarn der gleichen Kategorie zu berücksichtigen
		const category = d.group;
		const categorySortedData = sortedData.filter(item => item.group === category);
		const currentIndexInCategory = categorySortedData.findIndex(item => keyFunc(item) === keyFunc(d));

		// --- NEUE ZOOM-LOGIK: Zeige immer ca. 5 Events an ---
		const itemsToShow = 5;
		const half = Math.floor(itemsToShow / 2);

		let startIndex = Math.max(0, currentIndexInCategory - half);
		let endIndex = Math.min(categorySortedData.length - 1, currentIndexInCategory + half);

		// Wenn wir am Anfang oder Ende sind, erweitere den Bereich auf der anderen Seite,
		// um möglichst auf 5 Events zu kommen.
		if (endIndex - startIndex + 1 < itemsToShow) {
			if (startIndex === 0) {
				endIndex = Math.min(categorySortedData.length - 1, itemsToShow - 1);
			} else if (endIndex === categorySortedData.length - 1) {
				startIndex = Math.max(0, categorySortedData.length - itemsToShow);
			}
		}

		const firstEventDate = categorySortedData[startIndex].date;
		const lastEventDate = categorySortedData[endIndex].date;

		const timeSpan = lastEventDate.getTime() - firstEventDate.getTime();
		const padding = timeSpan > 0 ? timeSpan * 0.15 : 1000 * 60 * 60 * 24 * 365 * 5; // 5 Jahre Puffer als Fallback
		const totalSpanWithPadding = timeSpan + padding * 2;

		// Erstelle die neue Domain, die EXAKT um das geklickte Datum zentriert ist.
		const centerDate = d.date;
		const domainStart = new Date(centerDate.getTime() - totalSpanWithPadding / 2);
		const domainEnd = new Date(centerDate.getTime() + totalSpanWithPadding / 2);
		// --- ENDE DYNAMISCHER ZOOM ---

		// 1. Erstelle die neue, gezoomte lineare Skala.
		const zoomedScale = d3.scaleTime()
			.domain([domainStart, domainEnd])
			.range(globalTimeScale.range());

		// 2. Erstelle die Fisheye-Skala, basierend auf der gezoomten Skala.
		currentScale = createFisheyeScale(zoomedScale).focus((globalTimeScale.range()[0] + globalTimeScale.range()[1]) / 2);

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
		focusedItemId = keyFunc(d);
	}

	function resetFocusAndDetails() {
		if (focusedItemId !== null) { // Setze den Zoom nur zurück, wenn auch gezoomt wurde
			currentScale = globalTimeScale; // Setze die Skala auf die globale Übersicht zurück
			drawTimeline(); // Zeichne neu mit dem gespeicherten Zustand der Spuren und der korrekten Skala

			// Verstecke die Details und entferne den Fokus
			detailsHandlers.hide();
			d3.selectAll(".item-box-group").classed("is-focused", false);
			d3.selectAll(".item-box-group rect").style("filter", null);
			focusedItemId = null;
		}
	}

	svg.on('click', resetFocusAndDetails);

	// Exponiere die Gruppen-Informationen und die redraw-Funktion
	return { groupInfo, redraw: drawTimeline };
}