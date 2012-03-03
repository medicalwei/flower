prevIdx = null
window.startPlot = (jqObj, data) ->
  $.plot jqObj, data, {
    series: {stack: 0, lines: {show: false, steps: false}, bars: {show: true, barWidth: 1}},
    grid: {hoverable: true, autoHighlight: false},
    xaxis: {tickSize: 1, tickDecimals: 0},
    yaxis: {ticks: binaryTickGenerator},
    multihighlight: {mode: 'x', hoverMode: 'bar'}
  }


  $("#graph").bind "multihighlighted", (event, pos, items) ->
    idx = items[0].dataIndex
    if prevIdx != idx
      prevIdx = idx
      download = data[0].data[idx][1]
      upload = data[1].data[idx][1]
      total = upload + download
      setTooltipOnCursor "#{total.toFixed(2)} MiB<br/>"+
                         "<i class='icon-download'></i> #{download.toFixed(2)} MiB<br/>"+
                         "<i class='icon-upload'></i> #{upload.toFixed(2)} MiB"

  $("#graph").bind "unmultihighlighted", (event, pos, items) ->
    removeTooltipOnCursor()
    prevIdx = null

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
  return "#{val/1024}G" if val >= 1024
  return "#{val}M" if val >= 1
  return "#{val*1024}k" if val >= 1/1024
  return "#{val*1048576}B"

setTooltipOnCursor = (content) ->
  if $("#tooltipCursorTracker").length == 0
    $("<div id='tooltipCursorTracker' />").appendTo("body")
    $(document).mousemove (e) -> 
      object = $('#tooltipCursorTracker')
      top  = e.pageY - $(window).scrollTop();
      left = e.pageX - $(window).scrollLeft();
      atTop = (top - $(window).height()/2) > 0
      atLeft  = (left - $(window).width()/2) > 0
      if atTop
        object.css {'top': 'auto', 'bottom': $(window).height()-e.pageY+5}
      else
        object.css {'top': e.pageY+5, 'bottom': 'auto'}
      if atLeft
        object.css {'left': 'auto', 'right': $(window).width()-e.pageX+5}
      else
        object.css {'left': e.pageX+5, 'right': 'auto'}
  $("#tooltipCursorTracker").html(content)

removeTooltipOnCursor = () ->
  $("#tooltipCursorTracker").remove()
  $(document).unbind 'mousemove'
