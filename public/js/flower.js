(function() {
  var binaryTickGenerator, prevIdx, removeTooltipOnCursor, setTooltipOnCursor, suffixFormatter, timeFormatter;

  prevIdx = null;

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
        hoverable: true,
        autoHighlight: false
      },
      xaxis: {
        mode: "time",
        minTickSize: [1, "hour"],
        tickFormatter: timeFormatter
      },
      yaxis: {
        ticks: binaryTickGenerator
      },
      multihighlight: {
        mode: 'x',
        hoverMode: 'bar'
      }
    });
    $("#graph").bind("multihighlighted", function(event, pos, items) {
      var download, idx, total, upload;
      idx = items[0].dataIndex;
      if (prevIdx !== idx) {
        prevIdx = idx;
        download = data[0].data[idx][1];
        upload = data[1].data[idx][1];
        total = upload + download;
        return setTooltipOnCursor(("" + (total.toFixed(2)) + " MiB<br/>") + ("<i class='icon-download'></i> " + (download.toFixed(2)) + " MiB<br/>") + ("<i class='icon-upload'></i> " + (upload.toFixed(2)) + " MiB"));
      }
    });
    return $("#graph").bind("unmultihighlighted", function(event, pos, items) {
      removeTooltipOnCursor();
      return prevIdx = null;
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
    if (val >= 1) return "" + val + "M";
    if (val >= 1 / 1024) return "" + (val * 1024) + "k";
    return "" + (val * 1048576) + "B";
  };

  timeFormatter = function(val) {
    return new Date(val).getHours();
  };

  setTooltipOnCursor = function(content) {
    if ($("#tooltipCursorTracker").length === 0) {
      $("<div id='tooltipCursorTracker' />").css({
        'position': 'absolute',
        'background': '#eee',
        'padding': '5px',
        'font-size': '16px',
        'border-radius': '5px',
        'border': '2px solid #ccc'
      }).appendTo("body");
      $(document).mousemove(function(e) {
        var atLeft, atTop, left, object, top;
        object = $('#tooltipCursorTracker');
        top = e.pageY - $(window).scrollTop();
        left = e.pageX - $(window).scrollLeft();
        atTop = (top - $(window).height() / 2) > 0;
        atLeft = (left - $(window).width() / 2) > 0;
        if (atTop) {
          object.css({
            'top': 'auto',
            'bottom': $(window).height() - e.pageY + 5
          });
        } else {
          object.css({
            'top': e.pageY + 5,
            'bottom': 'auto'
          });
        }
        if (atLeft) {
          return object.css({
            'left': 'auto',
            'right': $(window).width() - e.pageX + 5
          });
        } else {
          return object.css({
            'left': e.pageX + 5,
            'right': 'auto'
          });
        }
      });
    }
    return $("#tooltipCursorTracker").html(content);
  };

  removeTooltipOnCursor = function() {
    $("#tooltipCursorTracker").remove();
    return $(document).unbind('mousemove');
  };

}).call(this);
