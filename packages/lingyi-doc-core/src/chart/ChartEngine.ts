import type { ChartData, ChartConfig, ChartSeries } from './types';

export class ChartEngine {
  private padding = { top: 40, right: 30, bottom: 50, left: 60 };
  private legendHeight = 25;

  render(svgElement: SVGElement, data: ChartData, config: ChartConfig, width: number, height: number): void {
    // Clear previous content
    while (svgElement.firstChild) {
      svgElement.removeChild(svgElement.firstChild);
    }

    const ns = 'http://www.w3.org/2000/svg';

    // Background
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    bg.setAttribute('rx', '4');
    svgElement.appendChild(bg);

    // Border
    if (config.showBorder) {
      const border = document.createElementNS(ns, 'rect');
      border.setAttribute('x', '1');
      border.setAttribute('y', '1');
      border.setAttribute('width', String(width - 2));
      border.setAttribute('height', String(height - 2));
      border.setAttribute('fill', 'none');
      border.setAttribute('stroke', '#d0d0d0');
      border.setAttribute('stroke-width', '1');
      border.setAttribute('rx', '3');
      svgElement.appendChild(border);
    }

    // Title
    if (config.title) {
      const title = document.createElementNS(ns, 'text');
      title.setAttribute('x', String(width / 2));
      title.setAttribute('y', '24');
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('font-size', '14');
      title.setAttribute('font-weight', 'bold');
      title.setAttribute('fill', '#333');
      title.textContent = config.title;
      svgElement.appendChild(title);
    }

    // Legend
    if (config.showLegend && data.series.length > 1) {
      this.drawLegend(svgElement, data.series, width);
      this.padding.top += this.legendHeight;
    }

    // Draw chart based on type
    switch (config.type) {
      case 'bar':
        this.drawBarChart(svgElement, data, config, width, height);
        break;
      case 'horizontalBar':
        this.drawHorizontalBarChart(svgElement, data, config, width, height);
        break;
      case 'line':
        this.drawLineChart(svgElement, data, config, width, height);
        break;
      case 'pie':
        this.drawPieChart(svgElement, data, config, width, height);
        break;
    }
  }

  // ==================== Legend ====================

  private drawLegend(svg: SVGElement, series: ChartSeries[], totalWidth: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const itemWidth = 120;
    const startX = (totalWidth - Math.min(series.length, 5) * itemWidth) / 2;
    const y = this.padding.top - 5;

    series.forEach((s, i) => {
      if (i >= 5) return; // Max 5 legend items in one row
      const x = startX + i * itemWidth;
      const color = s.color || '#4285F4';

      // Color box
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '12');
      rect.setAttribute('height', '12');
      rect.setAttribute('fill', color);
      rect.setAttribute('rx', '2');
      svg.appendChild(rect);

      // Label
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x + 16));
      text.setAttribute('y', String(y + 10));
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#555');
      text.textContent = s.name.length > 10 ? s.name.slice(0, 10) + '..' : s.name;
      svg.appendChild(text);
    });
  }

  // ==================== Bar Chart ====================

  private drawBarChart(svg: SVGElement, data: ChartData, config: ChartConfig, _w: number, _h: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const colors = config.colors;
    const { chartW, chartH } = this.getChartArea(_w, _h);
    const chartX = this.padding.left;
    const chartY = this.padding.top;

    const series = data.series;
    const categories = data.categories;
    const allValues = series.flatMap(s => s.data);
    const maxVal = Math.max(...allValues, 1);

    const isStacked = config.variant === 'stacked';

    if (isStacked) {
      this.drawBarChartStacked(svg, data, config, chartW, chartH, chartX, chartY, maxVal, categories, colors);
    } else {
      this.drawBarChartGrouped(svg, data, config, chartW, chartH, chartX, chartY, maxVal, categories, colors);
    }

    // Y-axis
    this.drawYAxis(svg, chartX, chartY, chartH, maxVal);
    // X-axis labels
    this.drawXAxisLabels(svg, chartX, chartY + chartH, chartW, categories, config);
    // Axis lines
    this.drawAxes(svg, chartX, chartY, chartW, chartH);
  }

  private drawBarChartGrouped(svg: SVGElement, data: ChartData, config: ChartConfig, chartW: number, chartH: number, chartX: number, chartY: number, maxVal: number, categories: string[], colors: string[]): void {
    const ns = 'http://www.w3.org/2000/svg';
    const series = data.series;
    const categoryCount = categories.length;
    const groupWidth = chartW / (categoryCount || 1);
    const barGap = groupWidth * 0.15;
    const barWidth = (groupWidth - barGap * 2) / (series.length || 1);

    series.forEach((s, si) => {
      const color = s.color || colors[si % colors.length] || '#4285F4';
      s.data.forEach((val, ci) => {
        const barH = (val / maxVal) * chartH;
        const x = chartX + ci * groupWidth + barGap + si * barWidth;
        const y = chartY + chartH - barH;

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(barWidth));
        rect.setAttribute('height', String(barH));
        rect.setAttribute('fill', color);
        rect.setAttribute('rx', '2');
        svg.appendChild(rect);

        // Data labels
        if (config.showDataLabels && barH > 15) {
          const label = document.createElementNS(ns, 'text');
          label.setAttribute('x', String(x + barWidth / 2));
          label.setAttribute('y', String(y + barH / 2 + 4));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('font-size', '10');
          label.setAttribute('fill', '#fff');
          label.textContent = String(val);
          svg.appendChild(label);
        }
      });
    });
  }

  private drawBarChartStacked(svg: SVGElement, data: ChartData, config: ChartConfig, chartW: number, chartH: number, chartX: number, chartY: number, maxVal: number, categories: string[], colors: string[]): void {
    const ns = 'http://www.w3.org/2000/svg';
    const series = data.series;
    const categoryCount = categories.length;
    const groupWidth = chartW / (categoryCount || 1);
    const barWidth = groupWidth * 0.6;
    const barGap = (groupWidth - barWidth) / 2;

    // Compute stacked totals per category
    const totals: number[] = new Array(categoryCount).fill(0);
    series.forEach(s => s.data.forEach((val, ci) => { totals[ci] += val; }));
    const totalMax = Math.max(...totals, 1);

    categories.forEach((_, ci) => {
      let accumulatedY = chartY + chartH;
      series.forEach((s, si) => {
        const val = s.data[ci] || 0;
        const barH = (val / totalMax) * chartH;
        const color = s.color || colors[si % colors.length] || '#4285F4';
        const x = chartX + ci * groupWidth + barGap;
        accumulatedY -= barH;

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(accumulatedY));
        rect.setAttribute('width', String(barWidth));
        rect.setAttribute('height', String(Math.max(barH, 0)));
        rect.setAttribute('fill', color);
        svg.appendChild(rect);

        if (config.showDataLabels && barH > 15) {
          const lbl = document.createElementNS(ns, 'text');
          lbl.setAttribute('x', String(x + barWidth / 2));
          lbl.setAttribute('y', String(accumulatedY + barH / 2 + 4));
          lbl.setAttribute('text-anchor', 'middle');
          lbl.setAttribute('font-size', '9');
          lbl.setAttribute('fill', '#fff');
          lbl.textContent = String(val);
          svg.appendChild(lbl);
        }
      });
    });
  }

  // ==================== Horizontal Bar Chart ====================

  private drawHorizontalBarChart(svg: SVGElement, data: ChartData, config: ChartConfig, _w: number, _h: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const colors = config.colors;
    const { chartW, chartH } = this.getChartArea(_w, _h);
    const chartX = this.padding.left;
    const chartY = this.padding.top;

    const series = data.series;
    const categories = data.categories;
    const allValues = series.flatMap(s => s.data);
    const maxVal = Math.max(...allValues, 1);

    const barCount = categories.length;
    const groupHeight = chartH / (barCount || 1);
    const barH = (groupHeight * 0.7) / (series.length || 1);
    const barGap = groupHeight * 0.15;

    series.forEach((s, si) => {
      const color = s.color || colors[si % colors.length] || '#4285F4';
      s.data.forEach((val, ci) => {
        const barW = (val / maxVal) * chartW;
        const x = chartX;
        const y = chartY + ci * groupHeight + barGap + si * barH;

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(barW));
        rect.setAttribute('height', String(barH));
        rect.setAttribute('fill', color);
        rect.setAttribute('rx', '2');
        svg.appendChild(rect);

        if (config.showDataLabels && barW > 25) {
          const lbl = document.createElementNS(ns, 'text');
          lbl.setAttribute('x', String(x + barW - 4));
          lbl.setAttribute('y', String(y + barH / 2 + 4));
          lbl.setAttribute('text-anchor', 'end');
          lbl.setAttribute('font-size', '10');
          lbl.setAttribute('fill', '#fff');
          lbl.textContent = String(val);
          svg.appendChild(lbl);
        }
      });
    });

    // Category labels on left
    categories.forEach((cat, ci) => {
      const y = chartY + ci * groupHeight + groupHeight / 2 + 4;
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(chartX - 8));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#555');
      text.textContent = cat.length > 8 ? cat.slice(0, 8) + '..' : cat;
      svg.appendChild(text);
    });

    // Baseline
    const baseLine = document.createElementNS(ns, 'line');
    baseLine.setAttribute('x1', String(chartX));
    baseLine.setAttribute('y1', String(chartY));
    baseLine.setAttribute('x2', String(chartX));
    baseLine.setAttribute('y2', String(chartY + chartH));
    baseLine.setAttribute('stroke', '#ddd');
    baseLine.setAttribute('stroke-width', '1');
    svg.appendChild(baseLine);
  }

  // ==================== Line Chart ====================

  private drawLineChart(svg: SVGElement, data: ChartData, config: ChartConfig, _w: number, _h: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const colors = config.colors;
    const { chartW, chartH } = this.getChartArea(_w, _h);
    const chartX = this.padding.left;
    const chartY = this.padding.top;

    const series = data.series;
    const categories = data.categories;
    const allValues = series.flatMap(s => s.data);
    const maxVal = Math.max(...allValues, 1);

    const pointCount = categories.length;
    const xStep = pointCount > 1 ? chartW / (pointCount - 1) : chartW / 2;

    // Grid lines
    if (config.showGridLines !== false) {
      this.drawYGridLines(svg, chartX, chartY, chartW, chartH, maxVal);
    }

    series.forEach((s, si) => {
      const color = s.color || colors[si % colors.length] || '#4285F4';
      const points = s.data.map((val, ci) => ({
        x: chartX + ci * xStep,
        y: chartY + chartH - (val / maxVal) * chartH,
        val,
      }));

      // Line path
      if (points.length > 1) {
        let pathD = `M${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          pathD += ` L${points[i].x},${points[i].y}`;
        }

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);

        // Area fill
        const areaPath = document.createElementNS(ns, 'path');
        let areaD = `M${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          areaD += ` L${points[i].x},${points[i].y}`;
        }
        areaD += ` L${points[points.length - 1].x},${chartY + chartH} L${points[0].x},${chartY + chartH} Z`;
        areaPath.setAttribute('d', areaD);
        areaPath.setAttribute('fill', color);
        areaPath.setAttribute('fill-opacity', '0.1');
        svg.appendChild(areaPath);
      }

      // Data points and labels
      points.forEach((p, i) => {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', String(p.x));
        circle.setAttribute('cy', String(p.y));
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#fff');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);

        if (config.showDataLabels) {
          const lbl = document.createElementNS(ns, 'text');
          lbl.setAttribute('x', String(p.x));
          lbl.setAttribute('y', String(p.y - 10));
          lbl.setAttribute('text-anchor', 'middle');
          lbl.setAttribute('font-size', '10');
          lbl.setAttribute('fill', '#333');
          lbl.textContent = String(p.val);
          svg.appendChild(lbl);
        }
      });
    });

    // Y-axis
    this.drawYAxis(svg, chartX, chartY, chartH, maxVal);
    // X-axis labels
    this.drawXAxisLabels(svg, chartX, chartY + chartH, chartW, categories, config);
    // Axis lines
    this.drawAxes(svg, chartX, chartY, chartW, chartH);
  }

  // ==================== Pie Chart ====================

  private drawPieChart(svg: SVGElement, data: ChartData, config: ChartConfig, _w: number, _h: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const colors = config.colors;
    const series = data.series;
    const categories = data.categories;

    // Use first series for pie chart
    const values = series[0]?.data || [];
    const total = values.reduce((sum, v) => sum + v, 0);
    if (total === 0) return;

    const centerX = _w / 2;
    const centerY = this.padding.top + (_h - this.padding.top) / 2;
    const radius = Math.min(_w / 2 - 40, (_h - this.padding.top) / 2 - 30);

    const innerRadius = config.variant === 'donut' ? radius * (config.donutRatio || 0.55) : 0;

    let startAngle = -90;

    values.forEach((val, i) => {
      const percentage = val / total;
      const angle = percentage * 360;
      const endAngle = startAngle + angle;
      const color = colors[i % colors.length] || '#4285F4';
      const label = categories[i] || `项目${i + 1}`;

      const path = this.createPieSlice(ns, centerX, centerY, radius, innerRadius, startAngle, endAngle);
      path.setAttribute('fill', color);
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', innerRadius > 0 ? '2' : '1');
      svg.appendChild(path);

      // Percentage label on slice
      if (config.showDataLabels && percentage > 0.05) {
        const midAngle = startAngle + angle / 2;
        const midRad = (midAngle * Math.PI) / 180;
        const lblRadius = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.7;
        const lx = centerX + lblRadius * Math.cos(midRad);
        const ly = centerY + lblRadius * Math.sin(midRad);

        const lbl = document.createElementNS(ns, 'text');
        lbl.setAttribute('x', String(lx));
        lbl.setAttribute('y', String(ly));
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('dominant-baseline', 'central');
        lbl.setAttribute('font-size', innerRadius > 0 ? '11' : '10');
        lbl.setAttribute('fill', '#fff');
        lbl.setAttribute('font-weight', 'bold');
        lbl.textContent = `${Math.round(percentage * 100)}%`;
        svg.appendChild(lbl);
      }

      // External label
      const midAngle = startAngle + angle / 2;
      const midRad = (midAngle * Math.PI) / 180;
      const extRadius = radius + 18;
      const lx = centerX + extRadius * Math.cos(midRad);
      const ly = centerY + extRadius * Math.sin(midRad);

      const extLbl = document.createElementNS(ns, 'text');
      extLbl.setAttribute('x', String(lx));
      extLbl.setAttribute('y', String(ly));
      extLbl.setAttribute('text-anchor', midRad > -Math.PI / 2 && midRad < Math.PI / 2 ? 'start' : 'end');
      extLbl.setAttribute('dominant-baseline', 'central');
      extLbl.setAttribute('font-size', '9');
      extLbl.setAttribute('fill', '#555');
      extLbl.textContent = `${label} ${Math.round(percentage * 100)}%`;
      svg.appendChild(extLbl);

      startAngle = endAngle;
    });

    // Center hole for donut
    if (innerRadius > 0) {
      const donutLabel = document.createElementNS(ns, 'text');
      donutLabel.setAttribute('x', String(centerX));
      donutLabel.setAttribute('y', String(centerY - 8));
      donutLabel.setAttribute('text-anchor', 'middle');
      donutLabel.setAttribute('font-size', '14');
      donutLabel.setAttribute('fill', '#333');
      donutLabel.setAttribute('font-weight', 'bold');
      donutLabel.textContent = `总计`;
      svg.appendChild(donutLabel);

      const totalLabel = document.createElementNS(ns, 'text');
      totalLabel.setAttribute('x', String(centerX));
      totalLabel.setAttribute('y', String(centerY + 12));
      totalLabel.setAttribute('text-anchor', 'middle');
      totalLabel.setAttribute('font-size', '16');
      totalLabel.setAttribute('fill', '#4285F4');
      totalLabel.setAttribute('font-weight', 'bold');
      totalLabel.textContent = String(total);
      svg.appendChild(totalLabel);
    }
  }

  private createPieSlice(ns: string, cx: number, cy: number, r: number, ir: number, startAngle: number, endAngle: number): Element {
    const path = document.createElementNS(ns, 'path');
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    if (ir > 0) {
      const x3 = cx + ir * Math.cos(startRad);
      const y3 = cy + ir * Math.sin(startRad);
      const x4 = cx + ir * Math.cos(endRad);
      const y4 = cy + ir * Math.sin(endRad);

      const d = [
        `M${x1},${y1}`,
        `A${r},${r} 0 ${largeArc} 1 ${x2},${y2}`,
        `L${x4},${y4}`,
        `A${ir},${ir} 0 ${largeArc} 0 ${x3},${y3}`,
        'Z',
      ].join(' ');

      path.setAttribute('d', d);
    } else {
      const d = [
        `M${cx},${cy}`,
        `L${x1},${y1}`,
        `A${r},${r} 0 ${largeArc} 1 ${x2},${y2}`,
        'Z',
      ].join(' ');

      path.setAttribute('d', d);
    }

    return path;
  }

  // ==================== Axis Helpers ====================

  private getChartArea(width: number, height: number): { chartW: number; chartH: number } {
    return {
      chartW: width - this.padding.left - this.padding.right,
      chartH: height - this.padding.top - this.padding.bottom,
    };
  }

  private drawAxes(svg: SVGElement, x: number, y: number, w: number, h: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    // X axis
    const xAxis = document.createElementNS(ns, 'line');
    xAxis.setAttribute('x1', String(x));
    xAxis.setAttribute('y1', String(y + h));
    xAxis.setAttribute('x2', String(x + w));
    xAxis.setAttribute('y2', String(y + h));
    xAxis.setAttribute('stroke', '#999');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);

    // Y axis
    const yAxis = document.createElementNS(ns, 'line');
    yAxis.setAttribute('x1', String(x));
    yAxis.setAttribute('y1', String(y));
    yAxis.setAttribute('x2', String(x));
    yAxis.setAttribute('y2', String(y + h));
    yAxis.setAttribute('stroke', '#999');
    yAxis.setAttribute('stroke-width', '1');
    svg.appendChild(yAxis);
  }

  private drawYAxis(svg: SVGElement, x: number, y: number, h: number, maxVal: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = Math.round((maxVal / steps) * i);
      const yPos = y + h - (i / steps) * h;

      const tick = document.createElementNS(ns, 'line');
      tick.setAttribute('x1', String(x - 5));
      tick.setAttribute('y1', String(yPos));
      tick.setAttribute('x2', String(x));
      tick.setAttribute('y2', String(yPos));
      tick.setAttribute('stroke', '#999');
      tick.setAttribute('stroke-width', '1');
      svg.appendChild(tick);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x - 8));
      text.setAttribute('y', String(yPos + 4));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#888');
      text.textContent = String(val);
      svg.appendChild(text);
    }
  }

  private drawXAxisLabels(svg: SVGElement, x: number, y: number, w: number, categories: string[], config: ChartConfig): void {
    const ns = 'http://www.w3.org/2000/svg';
    const count = categories.length;
    const step = count > 1 ? w / (count - 1) : w / 2;
    categories.forEach((cat, i) => {
      const xPos = x + i * step;
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(xPos));
      text.setAttribute('y', String(y + 18));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#666');
      text.textContent = cat.length > 6 ? cat.slice(0, 6) + '..' : cat;

      if (count > 8) {
        text.setAttribute('transform', `rotate(-30, ${xPos}, ${y + 18})`);
      }
      svg.appendChild(text);
    });
  }

  private drawYGridLines(svg: SVGElement, x: number, y: number, w: number, h: number, maxVal: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const yPos = y + h - (i / steps) * h;

      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', String(yPos));
      line.setAttribute('x2', String(x + w));
      line.setAttribute('y2', String(yPos));
      line.setAttribute('stroke', '#eee');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4,4');
      svg.appendChild(line);
    }
  }
}
