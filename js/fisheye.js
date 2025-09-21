// js/fisheye.js
// Überarbeitete, robuste Fisheye-Implementierung
export function createFisheyeScale(baseScale) {
    let distortion = 20; // Erhöht für eine stärkere Verzerrung im Zentrum
    let focusPoint = 0;

    function fisheye(scale) {
        const range = scale.range();
        const scaleWidth = range[1] - range[0];
        const radius = scaleWidth * 0.7; // Verzerrt einen sehr großen Bereich

        function rescale(x) {
            const linear_x = scale(x);
            const dx = linear_x - focusPoint;
            const dd = Math.abs(dx);

            if (dd >= radius) return linear_x;

            const new_dx = Math.sign(dx) * dd * (distortion + 1) / (distortion * (dd / radius) + 1);
            return focusPoint + new_dx;
        }

        // Die neue Skala muss sich wie eine echte D3-Skala verhalten
        rescale.domain = scale.domain;
        rescale.range = scale.range;
        rescale.ticks = scale.ticks;
        rescale.tickFormat = scale.tickFormat;
        rescale.copy = () => fisheye(scale.copy());
        rescale.focus = function(p) {
            if (!arguments.length) return focusPoint;
            focusPoint = p;
            return rescale;
        };

        return rescale;
    }

    return fisheye(baseScale);
}