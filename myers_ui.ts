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

class MyersStateVisualization {
  svg:Paper
  grid: MyersGrid

  constructor(svg:Paper, grid:MyersGrid) {
    this.svg = svg
    this.grid = grid
  }

  setState(state:MyersState) {
    this.svg.clear()
    this.addDiagonal(state.diagonal)
    let uniquer : { [key:string]:boolean; } = {};
    for (let idx of pathIndexes(state.pathCollection)) {
      let path = state.pathCollection[idx]
      this.addPath(path, uniquer).attr({opacity: .33})
    }
    this.addPath(state.path, {})
  }

  addPath(path:Path, uniquer:{ [key:string]:boolean; }):Snap.Element {
    let tthis = this
    let cpointCoords : number[] = []
    var lastCPoint : Point = undefined
    let addPoint = function(p:Point) {
      let cpoint = tthis.grid.pointForLocation(new GridLocation(p.x, p.y))
      let key = p.x + "," + p.y
      if (!uniquer[key]) {
        uniquer[key] = true
        // hack!
        if (lastCPoint && cpointCoords.length == 0) {
          cpointCoords.push(lastCPoint.x, lastCPoint.y)
        }
        cpointCoords.push(cpoint.x, cpoint.y)
      }
      lastCPoint = cpoint
    }

    // hack!
    addPoint({x:0, y:-1})
    for (let i=0; i < path.points.length; i++) {
      addPoint(path.at(i))
    }
    let lineAttr = {
      stroke: "#0000FF",
      strokeWidth: 3.5,
      opacity:1,
//      strokeLinecap:"round",
      strokeLinejoin:"round",
      fill:'none'}
    let cline = this.svg.polyline(cpointCoords).attr(lineAttr)
    return cline
  }

  addDiagonal(diagonal:number) {
    let diagonalAttr = { stroke: "#FFFF00", 'strokeWidth': 5.5, opacity:.5, strokeLinecap:"round"}

    let startX = diagonal >= 0 ? diagonal : 0
    let startY = diagonal <= 0 ? -diagonal : 0

    // blech
    let endX = startX + 1
    let endY = startY + 1
    while (endX+1 < this.grid.cols && endY+1 < this.grid.rows) {
      endX++
      endY++
    }

    let startPoint = this.grid.pointForLocation(new GridLocation(startX, startY))
    let endPoint = this.grid.pointForLocation(new GridLocation(endX, endY))

    let line = this.svg.line(startPoint.x, startPoint.y, endPoint.x, endPoint.y)
    line.attr(diagonalAttr)
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

  pointForLocation(gl:GridLocation):CPoint {
    return new CPoint(this.xPadding + this.xSpacing * gl.x, this.yPadding + this.ySpacing * gl.y)
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
      let y = this.pointForLocation(new GridLocation(0, r)).y
      this.svg.line(0, y, this.width, y).attr(attrs)
    }
    // vertical lines
    for (let c=0; c < this.cols; c++) {
      let x = this.pointForLocation(new GridLocation(c, 0)).x
      this.svg.line(x, 0, x, this.height).attr(attrs)
    }
  }

  makeCross(center:GridLocation, extend:Ordinals, snake:boolean) {
    let north = extend.north, east = extend.east
    let south = extend.south, west = extend.west

    let fillAttrs = { stroke: 'none', fill: this.fillColor}
    let strokeAttrs = { fill: 'none', stroke: 'black', 'strokeWidth': 1.25}
    let centerFraction = .7
    let centerPoint = this.pointForLocation(center)
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
    let center = this.pointForLocation(centerGL)
    let rectFraction = .3
    let rectThickness = rectFraction * (this.xSpacing + this.ySpacing) / 2.0

    let start = center
    let target = this.pointForLocation(centerGL.offset(1, 1))
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
      this.setStateIndex(newIdx)

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

  setStateIndex(idx:number) {
    assert(idx >= 0 && idx < this.states.length, "Bad state index")
    this.stateVisualization.setState(this.states[idx])
    this.stateIndex = idx
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

    let gridSvg = Snap(380, 380)
    this.grid = new MyersGrid(gridSvg, this.input)
    this.svg.append(gridSvg)

    let visualizationSvg = Snap(380, 380)
    this.stateVisualization = new MyersStateVisualization(visualizationSvg, this.grid)
    this.svg.append(visualizationSvg)

    assert(this.states.length > 0, "Internal error: should not have empty state")

    let jslider = $(this.ids.slider)
    let slider = <HTMLInputElement>jslider[0]
    slider.min = "0"
    slider.max = "" + (this.topLevelStateIndexes.length-1)
    slider.value = "0"

    this.setStateIndex(0)
    this.startTimer()
  }
}
