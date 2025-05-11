document.addEventListener('DOMContentLoaded', () => {
    const chartContainer = document.getElementById('chart-container');
    const svg = d3.select("#chart");
    const buttons = document.getElementById('buttons');
    const undoButton = document.getElementById('undo');
    const resetButton = document.getElementById('reset');
    const riskAssessmentDiv = document.createElement('div');
    riskAssessmentDiv.id = 'risk-assessment';
    chartContainer.parentNode.insertBefore(riskAssessmentDiv, buttons);

    // Clock element
    const clockDiv = document.createElement('div');
    clockDiv.id = 'clock';
    clockDiv.style.textAlign = 'left';
    clockDiv.style.fontSize = '0.8em';
    clockDiv.style.color = '#c9d1d9';
    clockDiv.style.position = 'absolute';
    clockDiv.style.top = '10px';
    clockDiv.style.left = '10px';
    chartContainer.style.position = 'relative'; // Ensure chart container is positioned
    chartContainer.appendChild(clockDiv); // Append clock directly to chartContainer

    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockDiv.textContent = `${hours}:${minutes}:${seconds}`;
    }
    updateClock();
    setInterval(updateClock, 1000);

    let width = chartContainer.offsetWidth;
    let height = chartContainer.offsetHeight;
    let margin = { top: 20, right: 70, bottom: 30, left: 40 };
    let innerWidth = width - margin.left - margin.right;
    let innerHeight = height - margin.top - margin.bottom;

    let data = [];
    let accumulatedValue = 0;
    let candles = [];
    let forecastCandle = null;
    let consecutiveRedCandles = 0;
    let supports = [];
    let resistances = [];

    // Scales
    const xScale = d3.scaleLinear().range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().range([height - margin.bottom, margin.top]);

    // EMA parameters
    const emaShortPeriod = 5;
    const emaLongPeriod = 3;

    // Function to calculate EMA
    function calculateEMA(data, period) {
        const ema = [];
        let multiplier = 2 / (period + 1);

        // Calculate the initial SMA as the seed for EMA
        let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        ema.push(sma);

        // Calculate EMA for the rest of the data
        for (let i = period; i < data.length; i++) {
            ema[i - period + 1] = (data[i] - ema[i - period]) * multiplier + ema[i - period];
        }

        // Pad the beginning of the EMA array with null values to match data length
        const padding = new Array(period - 1).fill(null);
        return padding.concat(ema);
    }

    // Calculate EMAs
    let emaShort = calculateEMA(data, emaShortPeriod);
    let emaLong = calculateEMA(data, emaLongPeriod);

    function calculateSupportResistance() {
        const lookbackPeriod = 5;
        let newSupports = [];
        let newResistances = [];

        for (let i = lookbackPeriod; i < data.length - lookbackPeriod; i++) {
            let isSupport = true;
            let isResistance = true;

            for (let j = i - lookbackPeriod; j <= i + lookbackPeriod; j++) {
                if (data[i] > data[j]) {
                    isSupport = false;
                }
                if (data[i] < data[j]) {
                    isResistance = false;
                }
            }

            if (isSupport) {
                newSupports.push({ index: i, value: data[i] });
            }
            if (isResistance) {
                newResistances.push({ index: i, value: data[i] });
            }
        }

        // Filter existing supports and resistances to remove broken levels
        supports = supports.filter(s => data[s.index] <= s.value);
        resistances = resistances.filter(r => data[r.index] >= r.value);

        // Add the new supports and resistances, avoiding duplicates
        newSupports.forEach(newS => {
            if (!supports.some(s => s.index === newS.index && s.value === newS.value)) {
                supports.push(newS);
            }
        });

        newResistances.forEach(newR => {
            if (!resistances.some(r => r.index === newR.index && r.value === newR.value)) {
                resistances.push(newR);
            }
        });
    }

    function analyzeCandleStrength() {
        if (candles.length < 2) return 0;

        const currentCandle = candles[candles.length - 1];
        const previousCandle = candles[candles.length - 2];

        const currentChange = currentCandle.close - currentCandle.open;
        const previousChange = previousCandle.close - previousCandle.open;

        let strength = 0;

        // Larger candles indicate stronger momentum
        strength += (currentChange > 0 ? 1 : -1) * Math.abs(currentChange);
        strength -= (previousChange > 0 ? 1 : -1) * Math.abs(previousChange);

        return strength;
    }

    function assessRisk() {
        let risk = 0;

        // Check for consecutive red candles
        if (consecutiveRedCandles >= 3) {
            risk += 25;
        }

        // Distance from support and resistance
        supports.forEach(s => {
            if (accumulatedValue < s.value) {
                risk += 10;
            }
        });

        resistances.forEach(r => {
            if (accumulatedValue > r.value) {
                risk += 10;
            }
        });

        // Candle strength
        const candleStrength = analyzeCandleStrength();
        if (candleStrength < -1) {
            risk += 15;
        }

        return Math.min(risk, 100);
    }

    function generateForecast() {
        if (data.length >= 10) {
            // Check for consecutive red candles
            consecutiveRedCandles = candles.slice(-4).every(candle => candle.close < candle.open) ? 4 : 0;

            if (consecutiveRedCandles >= 4) {
                forecastCandle = null;
                return;
            }

            calculateSupportResistance();
            const candleStrength = analyzeCandleStrength();

            // Simplified forecasting logic
            let forecastChange = 0;

            // Trend following
            let lastValues = data.slice(-5);
            forecastChange += (lastValues.reduce((a, b) => a + b, 0) / lastValues.length) - accumulatedValue;

            // Adjust based on S/R
            supports.forEach(s => {
                if (accumulatedValue > s.value) forecastChange += 0.05;
                else forecastChange -= 0.05;
            });

            resistances.forEach(r => {
                if (accumulatedValue < r.value) forecastChange -= 0.05;
                else forecastChange += 0.05;
            });

            // Adjust for candle strength
            forecastChange += candleStrength * 0.025;

            // Adjust based on EMA crossing
            const emaCross = detectEmaCross();
            if (emaCross) {
                if (emaCross.type === 'up') {
                    forecastChange -= 0.1; // Expect downward movement
                } else {
                    forecastChange += 0.1; // Expect upward movement
                }
            }

            const forecastOpen = accumulatedValue;
            const forecastClose = accumulatedValue + forecastChange;
            const isBullish = forecastClose >= forecastOpen;

            forecastCandle = {
                open: forecastOpen,
                close: forecastClose,
                color: isBullish ? "rgba(0, 255, 0, 0.2)" : "rgba(255, 0, 0, 0.2)"
            };

            // Hide forecast candle during a bearish trend
            if (candles.length > 1 && candles[candles.length - 1].close < candles[candles.length - 1].open) {
                forecastCandle = null;
                return;
            }

            const riskPercentage = assessRisk();
            const accuracyPercentage = Math.max(50, 85 - riskPercentage);
        } else {
            forecastCandle = null;
        }
    }

    svg.on("mousedown", (event) => {
    });

    svg.on("mouseup", () => {
    });

    svg.on("mouseleave", () => {
    });

    svg.on("mousemove", (event) => {
    });

    svg.on("touchstart", (event) => {
        event.preventDefault();
    });

    svg.on("touchend", () => {
    });

    svg.on("touchcancel", () => {
    });

    svg.on("touchmove", (event) => {
        event.preventDefault();
    });

    function updateChart() {
        // Determine trend and apply class to chart container
        const chartContainer = document.getElementById('chart-container');
        if (candles.length > 1) {
            const lastCandle = candles[candles.length - 1];
            const previousCandle = candles[candles.length - 2];

            if (lastCandle.close > lastCandle.open) {
                chartContainer.classList.remove('trend-down');
                chartContainer.classList.add('trend-up');
            } else if (lastCandle.close < lastCandle.open) {
                chartContainer.classList.remove('trend-up');
                chartContainer.classList.add('trend-down');
            }
        } else {
            chartContainer.classList.remove('trend-up', 'trend-down');
        }

        // Update scales
        xScale.domain([0, data.length + (forecastCandle ? 1 : 0)]);
        yScale.domain(d3.extent([0, ...data]));

        // Clear chart
        svg.selectAll("*").remove();

        // Axes
        svg.append("g")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .style("color", "#6c757d")
            .style("opacity", 0)
            .call(d3.axisBottom(xScale).ticks(3));

        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .style("color", "#6c757d")
            .style("opacity", 0)
            .call(d3.axisLeft(yScale).ticks(3));

        // Draw support lines
        svg.selectAll(".support-line")
            .data(supports)
            .enter().append("line")
            .attr("class", "support-line")
            .attr("x1", margin.left)
            .attr("y1", d => yScale(d.value))
            .attr("x2", width - margin.right - 70)
            .attr("y2", d => yScale(d.value))
            .attr("stroke", "rgba(0,255,0,0.5)")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "5,5");

        // Draw resistance lines
        svg.selectAll(".resistance-line")
            .data(resistances)
            .enter().append("line")
            .attr("class", "resistance-line")
            .attr("x1", margin.left)
            .attr("y1", d => yScale(d.value))
            .attr("x2", width - margin.right - 70)
            .attr("y2", d => yScale(d.value))
            .attr("stroke", "rgba(255,0,0,0.5)")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "5,5");

        // Draw candles
        svg.selectAll("rect.candle")
            .data(candles)
            .enter().append("rect")
            .attr("class", "candle")
            .attr("x", (d, i) => xScale(i + 0.15))
            .attr("width", innerWidth / (data.length + 1) * 0.7)
            .attr("height", d => Math.abs(yScale(d.open) - yScale(d.close)))
            .attr("y", d => yScale(Math.max(d.open, d.close)))
            .attr("fill", d => (d.close >= d.open ? "#28a745" : "#dc3545"));

        // Draw forecast candle
        if (forecastCandle) {
            svg.append("rect")
                .attr("class", "forecast-candle")
                .attr("x", xScale(data.length + 0.15))
                .attr("y", yScale(Math.max(forecastCandle.open, forecastCandle.close)))
                .attr("width", innerWidth / (data.length + 2) * 0.7)
                .attr("height", Math.abs(yScale(forecastCandle.open) - yScale(forecastCandle.close)))
                .attr("fill", forecastCandle.color)
                .attr("opacity", 1);
        }

        // Draw EMA short
        svg.append("path")
            .datum(emaShort.map((value, index) => ({ index: index, value: value })).filter(d => d.value !== null))
            .attr("fill", "none")
            .attr("stroke", "yellow")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.8)
            .attr("d", d3.line()
                .x(d => xScale(d.index))
                .y(d => yScale(d.value))
                .curve(d3.curveMonotoneX));

        // Draw EMA long
        svg.append("path")
            .datum(emaLong.map((value, index) => ({ index: index, value: value })).filter(d => d.value !== null))
            .attr("fill", "none")
            .attr("stroke", "blue")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.8)
            .attr("class", "neon-blue")
            .attr("d", d3.line()
                .x(d => xScale(d.index))
                .y(d => yScale(d.value))
                .curve(d3.curveMonotoneX));

        // Draw dotted line
        svg.append("line")
            .attr("x1", margin.left)
            .attr("y1", yScale(accumulatedValue))
            .attr("x2", width - margin.right - 70)
            .attr("y2", yScale(accumulatedValue))
            .attr("stroke", "#fff")
            .attr("stroke-dasharray", "3,3")
            .attr("opacity", 0.6);

        // Detect and display EMA cross
        const emaCross = detectEmaCross();
        if (emaCross) {
            let x = xScale(data.length - 1);
            let y = yScale(emaCross.value);

            createEmaCrossEffect(x, y, emaCross.type);

            // Updated messages with emojis
            let trendMessage = '';
            if (emaCross.type === 'up') {
                trendMessage = '<span class="neon-text" style="--neon-color: red;">ðŸš¨ Â¡Alerta! ðŸ“‰ Â¡PrecauciÃ³n!</span>';
            } else { // emaCross.type === 'down'
                trendMessage = '<span class="neon-text" style="--neon-color: lime;">ðŸ‘ Â¡Zona para operar! ðŸ“ˆ Confirma movimientos con los graficos </span>';
            }
            riskAssessmentDiv.innerHTML = trendMessage;
        } else {
             // Optionally clear the message when no cross is detected
             // riskAssessmentDiv.innerHTML = '';
        }
    }

    function detectEmaCross() {
        if (emaShort.length < emaShortPeriod || emaLong.length < emaLongPeriod) return null;

        const lastShort = emaShort[emaShort.length - 1];
        const prevShort = emaShort[emaShort.length - 2];
        const lastLong = emaLong[emaLong.length - 1];
        const prevLong = emaLong[emaLong.length - 2];

        if (prevShort === null || prevLong === null) return null;
        if (lastShort === null || lastLong === null) return null;

        const isCrossingUp = prevShort < prevLong && lastShort > lastLong;
        const isCrossingDown = prevShort > prevLong && lastShort < lastLong;

        if (isCrossingUp) {
            return { type: 'up', value: lastShort };
        } else if (isCrossingDown) {
            return { type: 'down', value: lastShort };
        }

        return null;
    }

    function createEmaCrossEffect(x, y, type) {
        const effect = document.createElement('div');
        effect.classList.add('ema-cross-effect');
        effect.style.left = `${x}px`;
        effect.style.top = `${y}px`;
        effect.style.position = 'absolute';

        chartContainer.appendChild(effect);

        // Remove the effect after the animation completes
        setTimeout(() => {
            effect.remove();
        }, 700);

        riskAssessmentDiv.dataset.trend = type;
    }

    buttons.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON' && event.target.id !== 'undo' && event.target.id !== 'reset') {
            const value = parseFloat(event.target.dataset.value);
            const miniValue = parseFloat(event.target.dataset.miniValue);
            if (!isNaN(value)) {
                const open = accumulatedValue;
                accumulatedValue += value;
                data.push(accumulatedValue);

                candles.push({ open: open, close: accumulatedValue });
                calculateSupportResistance();

                forecastCandle = null;
                if (data.length >= 10) {
                    generateForecast();
                }

                emaShort = calculateEMA(data, emaShortPeriod);
                emaLong = calculateEMA(data, emaLongPeriod);

                if (data.length > 30) {
                    data.shift();
                    candles.shift();
                    calculateSupportResistance();
                }

                updateChart();
                if (!isNaN(miniValue)) {
                    addMiniChartData(miniValue);
                }
            }
        }
    });

    undoButton.addEventListener('click', () => {
        if (data.length > 0) {
            data.pop();
            candles.pop();
            accumulatedValue = data.length > 0 ? data[data.length - 1] : 0;

            calculateSupportResistance();

            forecastCandle = null;
            if (data.length >= 10) {
                generateForecast();
            }

            emaShort = calculateEMA(data, emaShortPeriod);
            emaLong = calculateEMA(data, emaLongPeriod);

            if (data.length > 25) {
                data.shift();
                candles.shift();
                calculateSupportResistance();
            }
            updateChart();
            removeMiniChartData();
        }
    });

    resetButton.addEventListener('click', () => {
        data = [];
        consecutiveRedCandles = 0;
        accumulatedValue = 0;
        candles = [];
        forecastCandle = null;
        supports = [];
        resistances = [];
        riskAssessmentDiv.textContent = '';
        riskAssessmentDiv.dataset.trend = '';
        riskAssessmentDiv.dataset.stage = '';

        emaShort = calculateEMA(data, emaShortPeriod);
        emaLong = calculateEMA(data, emaLongPeriod);
        updateChart();
        resetMiniChart();
    });

    function resizeChart() {
        width = chartContainer.offsetWidth;
        height = chartContainer.offsetHeight;
        innerWidth = width - margin.left - margin.right;
        innerHeight = height - margin.top - margin.bottom;

        xScale.range([margin.left, width - margin.right]);
        yScale.range([height - margin.bottom, margin.top]);

        updateChart();
    }

    window.addEventListener('resize', resizeChart);

    updateChart();
});