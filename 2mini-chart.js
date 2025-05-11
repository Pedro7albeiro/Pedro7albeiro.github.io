document.addEventListener('DOMContentLoaded', () => {
    const miniChartContainer = document.getElementById('mini-chart-container');
    const miniSvg = d3.select("#mini-chart");

    let miniWidth = miniChartContainer.offsetWidth;
    let miniHeight = miniChartContainer.offsetHeight;
    let miniMargin = { top: 10, right: 10, bottom: 20, left: 30 };
    let miniInnerWidth = miniWidth - miniMargin.left - miniMargin.right;
    let miniInnerHeight = miniHeight - miniMargin.top - miniMargin.bottom;

    const miniXScale = d3.scaleLinear().range([miniMargin.left, miniWidth - miniMargin.right]);
    const miniYScale = d3.scaleLinear().range([miniHeight - miniMargin.bottom, miniMargin.top]);

    // Mini chart data - moved from script.js
    let miniData = [];
    let miniAccumulatedValue = 0;

    function updateMiniChart() { // Modified to use internal miniData
        miniSvg.selectAll("*").remove();

        if (!miniData || miniData.length === 0) {
            return; // Exit if miniData is empty or not defined
        }

        // Update scales
        miniXScale.domain([0, miniData.length -1 ]); // Adjusted domain to reflect data indices
        miniYScale.domain(d3.extent([0, ...miniData]));

        // Draw line
        miniSvg.append("path")
            .datum(miniData)
            .attr("fill", "none")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .attr("d", d3.line()
                .x((d, i) => miniXScale(i))
                .y(d => miniYScale(d))
                .curve(d3.curveLinear));

        // Draw horizontal line at current level
        if (miniData.length > 0) {
            const lastValue = miniData[miniData.length - 1];
            miniSvg.append("line")
                .attr("x1", miniMargin.left)
                .attr("x2", miniWidth - miniMargin.right)
                .attr("y1", miniYScale(lastValue))
                .attr("y2", miniYScale(lastValue))
                .attr("stroke", "white")
                .attr("stroke-width", 1)
                .attr("opacity", 0.5)
                .attr("stroke-dasharray", "3,3"); // Optional: dashed line for better visibility
        }

        // Draw points
        miniSvg.selectAll("circle")
            .data(miniData)
            .enter().append("circle")
            .attr("cx", (d, i) => miniXScale(i))
            .attr("cy", d => miniYScale(d))
            .attr("r", 2)
            .attr("fill", "#fff");
    }

    // New function to add data and update the mini chart
    function addMiniChartData(value) {
        miniAccumulatedValue += value;
        miniData.push(miniAccumulatedValue);
        if (miniData.length > 30) {
            miniData.shift(); // Keep only the last 30 points for mini chart
        }
        updateMiniChart();
    }

    // New function to remove data from mini chart
    function removeMiniChartData() {
        if (miniData.length > 0) {
            miniData.pop();
            miniAccumulatedValue = miniData.length > 0 ? miniData[miniData.length - 1] : 0;
            updateMiniChart();
        }
    }

    // Expose addMiniChartData and updateMiniChart to the main script.js
    window.addMiniChartData = addMiniChartData;
    window.resetMiniChart = () => { // Expose reset function
        miniData = [];
        miniAccumulatedValue = 0;
        updateMiniChart();
    };
    window.removeMiniChartData = removeMiniChartData; // Expose removeMiniChartData


    // Initial draw with empty data - now calls updateMiniChart directly as miniData is initialized here
    updateMiniChart();
});