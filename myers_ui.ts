/// <reference path='./collections.ts'/>
/// <reference path='./myers_state.ts'/>
/// <reference path='./snapsvg.d.ts'/>
/// <reference path='./jquery.d.ts'/>

class GridLocation {
  constructor(public x:number, public y:number) {}

  offset(dx:number, dy:number):GridLocation {
    return new GridLocation(this.x + dx, this.y + dy)
  }
}

function hypot(dx:number, dy:number):number {
  return Math.sqrt(dx * dx + dy * dy)
}

class Cursor {
  current:Point
  points:Point[] = []
  strokes:Line[] = []

  tryStroke() {
    let pointCount = this.points.length
    if (pointCount >= 2) {
      this.strokes.push(new Line(this.points[pointCount-2], this.points[pointCount-1]))
    }
  }

  move(dx:number, dy:number, addStroke:boolean = true):Cursor {
    if (dx != 0 || dy != 0) {
      this.current = {x:this.current.x + dx, y:this.current.y + dy}
      this.points.push(this.current)
      if (addStroke) {
        this.tryStroke()
      }
    }
    return this
  }

  moveX(dx:number, addStroke:boolean = true):Cursor {
    return this.move(dx, 0, addStroke)
  }

  moveY(dy:number, addStroke:boolean = true):Cursor {
    return this.move(0, dy, addStroke)
  }

  close(addStroke:boolean = true):Cursor {
    this.current = this.points[0]
    this.points.push(this.current)
    if (addStroke) {
      this.tryStroke()
    }
    return this
  }

  // returns alternating x, y coordinates, suitable for SVG
  coordinates():number[] {
    let result:number[] = []
    for (let i = 0; i < this.points.length; i++) {
      result.push(this.points[i].x, this.points[i].y)
    }
    return result
  }

  reset(p:Point) {
    this.current = p
    this.points = []
    this.strokes = []
  }

  constructor(p:Point) {
    this.current = p
    this.points = []
  }
}

interface Ordinals {
  north?:boolean
  east?:boolean
  south?:boolean
  west?:boolean
}

function assert(condition, message) {
    if (!condition) {
        throw message || "Assertion failed";
    }
}

function ewidth(svg:Snap.Element):number {
  let result = <number>svg.attr('width')
  assert(!isNaN(result), "width is NaN")
  return result
}

function eheight(svg:Snap.Element):number {
  let result = <number>svg.attr('height')
  assert(!isNaN(result), "height is NaN")
  return result
}

/* Maintains a list of SVG lines corresponding to a list of paths */
class PathSet {
  components = new Dictionary<Snap.Element>()

  setPaths(pathList:Path[], elementFactory:(line:Line, isLast:boolean) => Snap.Element) {
    let lines = new Dictionary<Line>()
    for (let path of pathList) {
      let currentPoint:Point = {x:0, y:-1}
      for (let i=0; i < path.points.length; i++) {
        let newPoint = path.at(i)
        let line = new Line(currentPoint, newPoint)
        let compKey = currentPoint.x + "," + currentPoint.y + " - " + newPoint.x + "," + newPoint.y
        lines.add(compKey, line)
        currentPoint = newPoint
      }
    }

    let existingKeys = this.components.keys()
    let newKeys = lines.keys()

    // Remove elements from components no longer present
    let keysToRemove = setDifference(existingKeys, newKeys)
    for (let keyToRemove of keysToRemove) {
      this.components[keyToRemove].remove()
      this.components.remove(keyToRemove)
    }

    // Add elements from allPathComponents now in path
    let keysToAdd = setDifference(newKeys, existingKeys)
    for (let i=0; i < keysToAdd.length; i++) {
      let key = keysToAdd[i]
      let isLast = (i + 1 == keysToAdd.length)
      let elem = elementFactory(lines[key], isLast)
      this.components.add(key, elem)
    }

  }
}

class MyersStateVisualization {
  svg:Paper
  grid: MyersGrid
  diagonal:Snap.Element

  allPaths = new PathSet()
  mainPath = new PathSet()

  allPathGroup:Snap.Element
  mainPathGroup:Snap.Element

  constructor(svg:Paper, grid:MyersGrid) {
    this.svg = svg
    this.grid = grid

    let diagonalAttr = { stroke: "#FFFF00", 'strokeWidth': 5.5, opacity:.5, strokeLinecap:"round"}
    this.diagonal = this.svg.line(0, 0, 0, 0).attr(diagonalAttr)

    this.allPathGroup = this.svg.group()
    this.mainPathGroup = this.svg.group()
  }

  setState(state:MyersState, animate:boolean = false) {
    //this.svg.clear()
    this.setDiagonal(state.diagonal)

    this.allPaths.setPaths(pathValues(state.pathCollection),
      (line:Line, isLast:boolean) => {
        return this.addPathLine(line, .5)
      })

    this.mainPath.setPaths([state.path],
      (line:Line, isLast:boolean) => {
        let animate = isLast
        return this.addPathLine(line, 1.0, animate)
      })
  }

  // Adds a line corresponding to the given Line
  addPathLine(line:Line, opacity:number, animate:boolean = false):Snap.Element {
    let start = this.grid.pointForLocation(line.start.x, line.start.y)
    let end = this.grid.pointForLocation(line.end.x, line.end.y)
    let lineAttr = {
      stroke: "#0000FF",
      strokeWidth: 3.5,
      opacity:opacity,
      fill:'none'}
    let initialEnd = animate ? start : end
    let cline = this.svg.line(start.x, start.y, initialEnd.x, initialEnd.y).attr(lineAttr)
    if (animate) {
      cline.animate({x2:end.x, y2:end.y}, .5 * 1000)
    }
    return cline
  }

  setDiagonal(diagonal:number) {
    let startX = diagonal >= 0 ? diagonal : 0
    let startY = diagonal <= 0 ? -diagonal : 0

    // blech
    let endX = startX + 1
    let endY = startY + 1
    while (endX+1 < this.grid.cols && endY+1 < this.grid.rows) {
      endX++
      endY++
    }

    let startPoint = this.grid.pointForLocation(startX, startY)
    let endPoint = this.grid.pointForLocation(endX, endY)

    this.diagonal.attr({x1:startPoint.x, y1:startPoint.y, x2:endPoint.x, y2:endPoint.y})
  }


}

class MyersGrid {
  input:MyersInput

  width:number
  height:number

  rows:number
  cols:number

  xSpacing:number
  ySpacing:number

  xPadding:number
  yPadding:number

  floodColor = '#AAA'
  gridColor = '#777'
  fillColor = '#B6DCFF'
  snakeFillColor = '#CCDDFF'


  crosses:Snap.Element[] = []
  snakes:Snap.Element[] = []

  svg:Paper

  constructor(svg:Paper, input:MyersInput) {
    this.svg = svg
    this.input = input
    this.rows = input.left.length + 1
    this.cols = input.top.length + 1

    this.width = ewidth(svg)
    this.height = eheight(svg)

    this.xSpacing = this.width / (this.cols)
    this.ySpacing = this.height / (this.rows)

    this.xPadding = this.xSpacing/2
    this.yPadding = this.ySpacing/2

    this.svg.rect(0, 0, this.width, this.height).attr({ fill: this.floodColor})
    this.makeGrid()

    // make crosses
    for (let y = 0; y < this.rows; y++) {
      for (let x=0; x < this.cols; x++) {
        let dirs = {
          north: y > 0 || (y==0 && x==0),
          east: x+1 < this.cols,
          south: y+1 < this.rows,
          west: x > 0
        }
        this.makeCross(new GridLocation(x, y), dirs, false)
      }
    }

    // make snakes
    for (let y = 0; y+1 < this.rows; y++) {
      for (let x=0; x+1 < this.rows; x++) {
        if (this.input.left[y] == this.input.top[x]) {
          this.makeSnake(new GridLocation(x, y))
        }
      }
    }
  }

  pointForLocation(columnX:number, rowY:number):CPoint {
    return new CPoint(this.xPadding + this.xSpacing * columnX, this.yPadding + this.ySpacing * rowY)
  }

  addStrokes(c:Cursor):Snap.Element {
    let group:any = this.svg.group()
    for (let i=0; i < c.strokes.length; i++) {
      let line = c.strokes[i]
      group.add(this.svg.line(line.start.x, line.start.y, line.end.x, line.end.y))
    }
    return group
  }

  makeGrid() {
    let attrs = { stroke: this.gridColor, 'strokeWidth': 0.5}
    // horizontal lines
    for (let r=0; r<this.rows; r++) {
      let y = this.pointForLocation(0, r).y
      this.svg.line(0, y, this.width, y).attr(attrs)
    }
    // vertical lines
    for (let c=0; c < this.cols; c++) {
      let x = this.pointForLocation(c, 0).x
      this.svg.line(x, 0, x, this.height).attr(attrs)
    }
  }

  makeCross(center:GridLocation, extend:Ordinals, snake:boolean) {
    let north = extend.north, east = extend.east
    let south = extend.south, west = extend.west

    let fillAttrs = { stroke: 'none', fill: this.fillColor}
    let strokeAttrs = { fill: 'none', stroke: 'black', 'strokeWidth': 1.25}
    let centerFraction = .7
    let centerPoint = this.pointForLocation(center.x, center.y)
    let rx = this.xSpacing * centerFraction/2.0
    let ry = this.ySpacing * centerFraction/2.0

    // how wide the bridges are
    let bridgeFraction = .25
    // width of a horizontally/vertically oriented bridge
    let bridgeWidthH = bridgeFraction * this.xSpacing
    let bridgeWidthV = bridgeFraction * this.ySpacing

    // length of a horizontally / vertically oriented bridge
    let bridgeLengthH = this.xSpacing/2 - rx
    let bridgeLengthV = this.ySpacing/2 - ry

    let makeCenterEllipse = () => {
      return this.svg.ellipse(centerPoint.x, centerPoint.y, rx, ry)
    }

    let makeBridge = (dir:Ordinals, stroke:boolean) => {
      // exactly one of the ordinals should be set
      // always describe the rectangle clockwise from upper left
      let horizontal = dir.east || dir.west
      let dx = horizontal ? bridgeLengthH : bridgeWidthV
      let dy = horizontal ? bridgeWidthH : bridgeLengthV
      let startX = centerPoint.x, startY = centerPoint.y
      if (horizontal) {
        startX += dir.east ? rx : -(rx + dx)
        startY += -dy/2
      } else { // vertical
        startX += -dx/2
        startY += dir.north ? -(ry + bridgeLengthV) : ry
      }

      // extend it by a little bit in its length direction
      let overlap = 2
      if (horizontal) {
        startX -= overlap
        dx += 2*overlap
      } else {
        startY -= overlap
        dy += 2*overlap
      }

      if (stroke) {
        let group:any = this.svg.group()
        if (horizontal) {
          group.add(this.svg.line(startX, startY, startX + dx, startY))
          group.add(this.svg.line(startX, startY + dy, startX + dx, startY + dy))
        } else {
          group.add(this.svg.line(startX, startY, startX, startY + dy))
          group.add(this.svg.line(startX + dx, startY, startX + dx, startY + dy))
        }
        return group
      } else {
        return this.svg.rect(startX, startY, dx, dy)
      }
    }

    // fraction of a square taken up by the center
    this.crosses.push(makeCenterEllipse().attr(fillAttrs))
    this.crosses.push(makeCenterEllipse().attr(strokeAttrs))

    let dirs:Ordinals[] = []
    if (extend.north) dirs.push({north:true})
    if (extend.east) dirs.push({east:true})
    if (extend.south) dirs.push({south:true})
    if (extend.west) dirs.push({west:true})

    for (var i=0; i < dirs.length; i++) {
      this.crosses.push(makeBridge(dirs[i], false).attr(fillAttrs))
      this.crosses.push(makeBridge(dirs[i], true).attr(strokeAttrs))
    }
  }

  makeSnake(centerGL:GridLocation)  {
    let center = this.pointForLocation(centerGL.x, centerGL.y)
    let rectFraction = .3
    let rectThickness = rectFraction * (this.xSpacing + this.ySpacing) / 2.0

    let start = center
    let target = this.pointForLocation(centerGL.x + 1, centerGL.y+1)
    let distance = hypot(target.x - start.x, target.y - start.y)

    // rotate a rectangle centered at the origin
    // conceptually the width of the rectangle is the line that connects the
    // start and target points, and the height is perpindicular
    let angle = Math.atan2(target.y - start.y, target.x - start.x)
    function rotate(x:number, y:number):Point {
      return {
        x:x * Math.cos(angle) - y * Math.sin(angle),
        y:x * Math.sin(angle) + y * Math.cos(angle)
      }
    }
    let short = rotate(0, rectThickness)
    short.x = Math.abs(short.x)
    short.y = Math.abs(short.y)

    let long = rotate(distance, 0)
    long.x = Math.abs(long.x)
    long.y = Math.abs(long.y)

    let c = new Cursor(center)
    c.move(short.x/2, -short.y/2) //northwest
    c.move(-short.x, short.y) //southwest
    c.move(long.x, long.y) //southeast
    c.move(short.x, -short.y) //northeast
    c.close()

    let colors = [this.fillColor, this.snakeFillColor, this.fillColor]
    let grad = this.svg.gradient("l(.2, .2, .8, .8)" + colors.join('-'))

    let pathAttrs = { fill: grad /*this.snakeFillColor*/ }
    let borderAttrs = { fill: 'none', stroke: 'black', strokeWidth: 1.25 }
    this.snakes.push(this.svg.polygon(c.coordinates()).attr(pathAttrs))

    // do something hacky
    let squish = .6
    let slideRatio = .6
    let slideX = (long.x * (1-squish)) * slideRatio
    let slideY = (long.y * (1-squish)) * slideRatio
    let squishCenter = {x:center.x + slideX, y:center.y + slideY}
    long.x *= squish
    long.y *= squish

    c.reset(squishCenter)
    c.move(short.x/2, -short.y/2) //northwest
    c.move(long.x, long.y) //northeast
    this.snakes.push(this.addStrokes(c).attr(borderAttrs))

    c.reset(squishCenter)
    c.move(-short.x/2, short.y/2) //southwest
    c.move(long.x, long.y) //southeast
    this.snakes.push(this.addStrokes(c).attr(borderAttrs))
  }
}

class MyersUI {
  ids:MyersIDs
  input:MyersInput
  svg:Paper
  timer:number = 0

  grid:MyersGrid
  stateVisualization:MyersStateVisualization
  events:MyersEvents
  stateIndex:number = -1
  states:MyersState[] = []
  topLevelStateIndexes:number[]

  // Metrics
  labelXOffset = -15
  labelYOffset = -12
  labelFontSize = 20

  constructor(ids:MyersIDs) {
    this.ids = ids
    this.events = new MyersEvents(ids)
    this.events.install()
    this.events.addObserver(this)
    this.svg = Snap(this.ids.svg)
  }

  sliderChanged(newValue:number) {
    assert(newValue >= 0 && newValue < this.topLevelStateIndexes.length, "Wrong newValue")
    let stateIndex = this.topLevelStateIndexes[newValue]
    this.stateVisualization.setState(this.states[stateIndex])
  }

  stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = 0
    }
  }

  startTimer() {
    let tthis = this
    this.stopTimer()
    this.timer = setTimeout(function() {tthis.timerGo()}, 1000)
  }

  timerGo() {
    let newIdx = this.stateIndex + 1
    if (newIdx < this.states.length) {
      this.setStateIndex(newIdx, true)

      // Find the number of top level states at or before newIdx
      var topLevelCount = 0;
      for (var cursor = newIdx; cursor >= 0; cursor--) {
        if (this.states[cursor].topLevel) {
          topLevelCount++;
        }
      }
      let slider = <HTMLInputElement>$(this.ids.slider)[0]
      slider.value = "" + (topLevelCount - 1)

    }
    this.startTimer()
  }

  mouseDown() {
    this.stopTimer()
  }

  mouseUp() {
    this.startTimer()
  }

  setStateIndex(idx:number, animate:boolean = false) {
    assert(idx >= 0 && idx < this.states.length, "Bad state index")
    this.stateVisualization.setState(this.states[idx], animate)
    this.stateIndex = idx
  }

  makeLabel(isVertical:boolean, row:number, column:number, text:string) {
    let offset = this.grid.pointForLocation(column, row)
    // Need unary + to convert to force conversion to number
    // because this is JavaScript
    let x = +this.grid.svg.attr("x") + offset.x
    let y = +this.grid.svg.attr("y") + offset.y
    // X and Y are the positions of the center of the text
    // For vertical, we subtract half of the xSpacing to bring us to the left edge
    // and then add half of the ySpacing to center us vertically
    // Similarly for horizontal
    if (isVertical) {
      x += this.labelXOffset - this.grid.xSpacing / 2
      y += this.grid.ySpacing / 2
    } else {
      y += this.labelYOffset - this.grid.ySpacing / 2
      x += this.grid.xSpacing / 2
    }
    let textObj = this.svg.text(0, 0, text)

    // The textObj x and y are of its baseline
    // To center it vertically, center y, and then add baselineOffsetFromCenter
    let bbox:any = textObj.getBBox()
    let baselineOffsetFromCenter = bbox.cy // is negative
    textObj.attr({
      x: x,
      y: y - baselineOffsetFromCenter,
      fontFamily:"Times New Roman",
      fontSize: this.labelFontSize + "px",
      textAnchor: "middle"
    })

    // this.svg.circle(x, y, 2)
    // bbox = textObj.getBBox()
    // this.svg.rect(bbox.x, bbox.y, bbox.width, bbox.height).attr({stroke: "#FFFF00", 'strokeWidth': 1, fill:"none"})

    return textObj
  }

  resetWithInput(input:MyersInput, states:MyersState[]) {
    this.input = input
    this.states = states
    if (this.states.length == 0) {
      this.states = [MyersState.EmptyState()]
    }
    this.svg.clear()

    // populate topLevelStateIndexes
    this.topLevelStateIndexes = [0]
    for (let i=1; i < states.length; i++) {
      if (states[i].topLevel) {
        this.topLevelStateIndexes.push(i)
      }
    }

    let offsets = {x:30, y:30}

    // Create the grid
    let gridSvg = Snap(380, 380).attr(offsets)
    this.grid = new MyersGrid(gridSvg, this.input)
    this.svg.append(gridSvg.attr(offsets))

    // Create the labels
    for (let x=0; x < this.input.top.length; x++) {
      this.makeLabel(false, 0, x, this.input.top[x])
    }
    for (let y=0; y < this.input.left.length; y++) {
      this.makeLabel(true, y, 0, this.input.left[y])
    }

    // Create the dynamic visualization
    let visualizationSvg = Snap(380, 380).attr(offsets)
    this.stateVisualization = new MyersStateVisualization(visualizationSvg, this.grid)
    this.svg.append(visualizationSvg)

    assert(this.states.length > 0, "Internal error: should not have empty state")

    // Configure the slider
    let jslider = $(this.ids.slider)
    let slider = <HTMLInputElement>jslider[0]
    slider.min = "0"
    slider.max = "" + (this.topLevelStateIndexes.length-1)
    slider.value = "0"

    this.setStateIndex(0)
    this.startTimer()
  }
}
