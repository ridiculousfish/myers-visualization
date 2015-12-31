/// <reference path='./collections.ts'/>
/// <reference path='./myers_state.ts'/>
/// <reference path='./myers_visualization.ts'/>
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

class MyersUI {
  ids:MyersIDs
  input:MyersInput
  svg:Paper
  timer:number = 0

  grid:MyersGrid
  stateVisualization:MyersStateVisualization
  taggedStringVisualization:MyersTaggedStringVisualization
  events:MyersEvents
  stateIndex:number = -1
  states:MyersState[] = []
  topLevelStateIndexes:number[]

  // Metrics
  labelXOffset = -15
  labelYOffset = -12
  labelFontSize = 25

  labelXColor = 'CornflowerBlue'
  labelYColor = 'Gold'

  constructor(ids:MyersIDs) {
    this.ids = ids
    this.taggedStringVisualization = new MyersTaggedStringVisualization(ids.diff)
    this.events = new MyersEvents(ids)
    this.events.install()
    this.events.addObserver(this)
    this.svg = Snap(this.ids.svg)
  }

  sliderChanged(newValue:number) {
    assert(newValue >= 0 && newValue < this.topLevelStateIndexes.length, "Wrong newValue")
    let stateIndex = this.topLevelStateIndexes[newValue]
    this.setStateIndex(stateIndex)
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
    let state = this.states[idx]
    this.stateVisualization.setState(state, animate)
    this.taggedStringVisualization.setTaggedString(state.text)
    this.stateIndex = idx
  }

  makeLabel(isVertical:boolean, row:number, column:number, text:string) {
    let shadow = this.svg.filter(Snap.filter.shadow(1, 1, 0, "#DDD"))
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
      fontFamily:"Helvetica",
      fontWeight:"bold",
      fontSize: this.labelFontSize + "px",
      textAnchor: "middle",
      fill: (isVertical ? this.labelYColor : this.labelXColor),
      filter: shadow
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
