(function() {
  var binaryTickGenerator, showTooltip, suffixFormatter;

  window.startPlot = function(jqObj, data) {
    $.plot(jqObj, data, {
      series: {
        stack: 0,
        lines: {
          show: false,
          steps: false
        },
        bars: {
          show: true,
          barWidth: 1
        }
      },
      grid: {
        hoverable: true
      },
      xaxis: {
        tickSize: 1,
        tickDecimals: 0
      },
      yaxis: {
        ticks: binaryTickGenerator
      }
    });
    window.previousPoint = null;
    return $("#graph").bind("plothover", function(event, pos, item) {
      var idx, total;
      if (item) {
        if (window.previousPoint !== item.dataIndex) {
          window.previousPoint = item.dataIndex;
          $("#tooltip").remove();
          idx = item.dataIndex;
          total = plotData[0].data[idx][1] + plotData[1].data[idx][1];
          return showTooltip(item.pageX, $("#graph").offset().top, "" + (total.toFixed(2)) + " MiB");
        }
      } else {
        window.previousPoint = null;
        return $("#tooltip").remove();
      }
    });
  };

  binaryTickGenerator = function(axis) {
    var c, i, res, tickSize, v;
    res = [];
    i = Math.floor(axis.min / Math.PI);
    c = axis.max;
    v = 0;
    if (c <= 0) return [];
    tickSize = 1;
    while (c <= 5) {
      c *= 2;
      tickSize /= 2;
    }
    while (c > 10) {
      c /= 2;
      tickSize *= 2;
    }
    while (v < axis.max) {
      v = i * tickSize;
      res.push([v, suffixFormatter(v)]);
      i += 1;
    }
    return res;
  };

  suffixFormatter = function(val) {
    if (val >= 1024) return "" + (val / 1024) + "G";
    if (val === 1) return "0B";
    if (val < 1) return "" + (val * 1024) + "k";
    return "" + val + "M";
  };

  showTooltip = function(x, y, contents) {
    return $('<div id="tooltip"/>').css({
      position: 'absolute',
      display: 'none',
      top: y,
      left: x,
      border: '1px solid #fdd',
      padding: '2px',
      'background-color': '#fee'
    }).text(contents).appendTo("body").show();
  };

}).call(this);
