var d3; // Minor workaround to avoid error messages in editors

// Waiting until document has loaded
window.onload = async () => {

  // Load json
  const rawData = await fetch('data/football.json')
    .then(response => response.json());

  // Extract actual array
  const data = rawData.nodes;

  console.log(data);

  // Create PCP SVG
  const width = 1000;
  const height = 400;

  const margin = {
    top: 30,
    right: 30,
    bottom: 30,
    left: 50
  };

  const pcpSvg = d3.select("#pcp-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("border", "1px solid black");

  const pcpGroup = pcpSvg.append("g")
    .attr(
      "transform",
      `translate(${margin.left}, ${margin.top})`
    );

  const dimensions = [
    "appearance",
    "mins_played",
    "pass_accurate",
    "touches",
    "goals"
  ];

  const xScale = d3.scalePoint()
    .domain(dimensions)
    .range([0, width - margin.left - margin.right]);

  const yScales = {};

  dimensions.forEach(dim => {

    yScales[dim] = d3.scaleLinear()
      .domain(
        d3.extent(data, d => d[dim])
      )
      .range([height - margin.top - margin.bottom, 0]);

  });

  const activeBrushes = {};

  dimensions.forEach(dim => {

    const axis = d3.axisLeft(yScales[dim]);

    const axisGroup = pcpGroup.append("g")
      .attr(
        "transform",
        `translate(${xScale(dim)}, 0)`
      )
      .call(axis);

    // axis label
    pcpGroup.append("text")
      .attr("x", xScale(dim))
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .text(dim);

    // Create brush
    const brush = d3.brushY()
      .extent([
        [-10, 0],
        [10, height - margin.top - margin.bottom]
      ])
      .on("brush end", brushed);

    // Add brush to axis
    axisGroup.append("g")
      .attr("class", "brush")
      .datum(dim)
      .call(brush)
      .on("contextmenu", function (event) {

        event.preventDefault();

        d3.select(this).call(
          brush.move,
          null
        );
      });

  });

  function path(d) {

    const points = dimensions.map(dim => {

      const value = +d[dim];
      // Skip invalid values
      if (
        value === undefined ||
        value === null ||
        isNaN(value)
      ) {
        return null;
      }

      return [
        xScale(dim),
        yScales[dim](value)
      ];
    });

    // Remove invalid points
    const validPoints = points.filter(p => p !== null);

    return d3.line()(validPoints);
  }

  function brushed(event) {

    // Reset active brushes
    Object.keys(activeBrushes).forEach(key => {
      delete activeBrushes[key];
    });

    // Find active brush selections
    pcpGroup.selectAll(".brush")
      .each(function (dim) {

        const selection = d3.brushSelection(this);

        if (selection) {

          activeBrushes[dim] = selection;
        }
      });

    // Filter selected players
    const hasActiveBrushes =
      Object.keys(activeBrushes).length > 0;
    const selectedPlayers = data.filter(d => {

      return dimensions.every(dim => {

        // Ignore non-brushed axes
        if (!activeBrushes[dim]) {
          return true;
        }

        const [y0, y1] = activeBrushes[dim];

        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);

        const value = yScales[dim](d[dim]);

        return value >= minY && value <= maxY;
      });
    });

    window.dispatchEvent(
      new CustomEvent("pcp-brush", {
        detail: {
          players: selectedPlayers,
          hasActiveBrushes: hasActiveBrushes
        }
      })
    );

    // Highlight selected lines
    playerLines
      .style("stroke", d => {

        if (!hasActiveBrushes) {
          return "steelblue";
        }

        return selectedPlayers.includes(d)
          ? "purple"
          : "lightblue";
      })
      .style("opacity", d => {

        if (!hasActiveBrushes) {
          return 0.4;
        }

        return selectedPlayers.includes(d)
          ? 0.9
          : 0.25;
      });

    console.log(selectedPlayers);
  }

  const playerLines = pcpGroup.selectAll(".player-line")
    .data(data)
    .enter()
    .append("path")
    .attr("class", "player-line")
    .attr("d", path)
    .style("fill", "none")
    .style("stroke", "steelblue")
    .style("stroke-width", 1)
    .style("opacity", 0.4)
    .style("pointer-events", "none");

  // Create SPLOM SVG

  const splomSvg = d3.select("#splom-container")
    .append("svg")
    .attr("width", 900)
    .attr("height", 900)
    .style("border", "1px solid black");

  // =========================
  // SPLOM CONFIG
  // =========================

  const splomDimensions = [
    "appearance",
    "mins_played",
    "touches",
    "pass_accurate"
  ];

  const cellSize = 180;
  const padding = 30;

  // =========================
  // SCALES
  // =========================

  const splomScales = {};

  splomDimensions.forEach(dim => {

    splomScales[dim] = d3.scaleLinear()
      .domain(
        d3.extent(data, d => +d[dim])
      )
      .range([
        padding,
        cellSize - padding
      ]);

  });

  // =========================
  // GENERATE MATRIX PAIRS
  // =========================

  const pairs = [];

  splomDimensions.forEach(yDim => {

    splomDimensions.forEach(xDim => {

      pairs.push({
        x: xDim,
        y: yDim
      });

    });

  });

  // =========================
  // CREATE CELLS
  // =========================

  const n = splomDimensions.length;

  const cell = splomSvg.selectAll(".cell")
    .data(pairs)
    .enter()
    .append("g")
    .attr("class", "cell")
    .attr("transform", d => {

      const x =
        splomDimensions.indexOf(d.x) * cellSize;

      // INVERT MATRIX DIAGONAL
      const y =
        (n - 1 - splomDimensions.indexOf(d.y))
        * cellSize;

      return `translate(${x + 50}, ${y + 50})`;
    });

  // =========================
  // CELL BORDERS
  // =========================

  cell.append("rect")
    .attr("width", cellSize)
    .attr("height", cellSize)
    .style("fill", "none")
    .style("stroke", "#ccc");

  // =========================
  // DRAW DOTS
  // =========================

  cell.each(function (pair) {

    const group = d3.select(this);


    // X axis
    group.append("g")
      .attr(
        "transform",
        `translate(0, ${cellSize - padding})`
      )
      .call(
        d3.axisBottom(splomScales[pair.x])
          .ticks(4)
      );

    // Y axis
    group.append("g")
      .attr(
        "transform",
        `translate(${padding}, 0)`
      )
      .call(
        d3.axisLeft(splomScales[pair.y])
          .ticks(4)
      );

    group.selectAll(".splom-dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "splom-dot")
      .attr("cx", d =>
        splomScales[pair.x](+d[pair.x])
      )
      .attr("cy", d =>

        // invert diagonal direction
        cellSize -
        splomScales[pair.y](+d[pair.y])

      )
      .attr("r", 2.5)
      .style("fill", "steelblue")
      .style("opacity", 0.7);

  });

  // =========================
  // LABELS
  // =========================

  cell.append("text")
    .attr("x", 8)
    .attr("y", 15)
    .style("font-size", "12px")
    .text(d => `${d.x}`);

  // =========================
  // LINKED BRUSHING LISTENER
  // =========================
  window.addEventListener(
    "pcp-brush",
    (event) => {

      const selectedPlayers =
        event.detail.players;

      const hasActiveBrushes =
        event.detail.hasActiveBrushes;

      const selectedIds = new Set(
        selectedPlayers.map(d => d.id)
      );

      splomSvg.selectAll(".splom-dot")
        .transition()
        .duration(200)
        .style("fill", d => {

          if (!hasActiveBrushes) {
            return "steelblue";
          }

          return selectedIds.has(d.id)
            ? "purple"
            : "lightblue";
        })
        .style("opacity", d => {

          if (!hasActiveBrushes) {
            return 0.7;
          }

          return selectedIds.has(d.id)
            ? 1
            : 0.15;
        });

    }
  );
};