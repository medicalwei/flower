window.startPlot = (jqObj, data) ->
  $.plot jqObj, data, {
    series: {stack: 0, lines: {show: false, steps: false}, bars: {show: true, barWidth: 1}},
    grid: {hoverable: true},
    xaxis: {tickSize: 1, tickDecimals: 0},
    yaxis: {ticks: binaryTickGenerator}
  }

  window.tooltipPoint = null
  $("#graph").bind "plothover", (event, pos, item) ->
    if item
      if window.tooltipPoint != item.dataIndex
        window.tooltipPoint = item.dataIndex
        $("#tooltip").remove()
        idx = item.dataIndex
        total = plotData[0].data[idx][1] + plotData[1].data[idx][1]
        showTooltip item.pageX, $("#graph").offset().top, "#{total.toFixed(2)} MiB"
    else
      window.tooltipPoint = null
      $("#tooltip").remove()

binaryTickGenerator = (axis) ->
  res = []
  i = Math.floor axis.min / Math.PI
  c = axis.max;
  v = 0

  # it fails if c == 0
  if c <= 0
    return [] 

  tickSize = 1

  while c <= 5
    c *= 2;
    tickSize /= 2;

  while c > 10
    c /= 2;
    tickSize *= 2;
  
  while v < axis.max
    v = i * tickSize
    res.push [v, suffixFormatter(v)]
    i += 1
  
  return res;

suffixFormatter = (val) ->
  return "#{val/1024}G" if (val >= 1024) 
  return "0B" if (val == 1)
  return "#{val*1024}k" if (val < 1)
  return "#{val}M"

showTooltip = (x, y, contents) ->
  $('<div id="tooltip"/>').css({
    position: 'absolute',
    display: 'none',
    top: y,
    left: x,
    border: '1px solid #fdd',
    padding: '2px',
    'background-color': '#fee'
  }).text(contents).appendTo("body").show()
