interface Point {
  x:number,
  y:number
}

class CPoint {
  constructor(public x:number, public y:number) {}

  moved(dx:number=0, dy:number=0):CPoint {
    return new CPoint(this.x + dx, this.y + dy)
  }
}

function moved(p:Point, dx:number=0, dy:number=0):CPoint {
  return new CPoint(p.x + dx, p.y + dy)
}

class Line {
  constructor(public start:Point, public end:Point) {}
  static make(x1:number, y1:number, x2:number, y2:number):Line {
    return new Line({x:x1, y:y1}, {x:x2, y:y2})
  }
}

class Path {
  points:Point[]

  constructor(points:Point[]) {
    this.points = points.slice(0)
  }

  end():Point {
    assert(this.points.length > 0, "Empty path")
    return this.points[this.points.length-1]
  }

  copy():Path {
    return new Path(this.points)
  }

  plus(p:Point):Path {
    let result = this.copy()
    result.points.push(p)
    return result
  }

  at(idx:number):Point {
    assert(idx >= 0 && idx < this.points.length, "Index out of bounds")
    return this.points[idx]
  }

  description():string {
    let result = ""
    for (let i=0; i < this.points.length; i++) {
      let point = this.points[i]
      if (i > 0) {
        result += " - "
      }
      result += point.x + "," + point.y
    }
    return result
  }

  static Empty = new Path([])
}

function pathIndexes(paths:Path[]): number[] {
  let result : number[] = []
  for (var k in paths) {
    if (paths.hasOwnProperty(k)) {
      result.push(k)
    }
  }
  result.sort(function(a, b) { return a-b; })
  return result
}

// Accounts for negative indices
function pathValues(paths:Path[]) : Path[] {
  let result : Path[] = []
  for (var idx of pathIndexes(paths)) {
    result.push(paths[idx])
  }
  return result
}

class Tag {
  recent:boolean = false
  constructor(public top:boolean, public down:boolean, public deleted:boolean) {}
}

class TaggedChar {
  constructor(public char:string, public tag:Tag) {}
}

class TaggedString {
  length:number
  constructor(public text:TaggedChar[]) {
    this.length = text.length
  }

  static make(text:string, tag:Tag):TaggedString {
    let tcs:TaggedChar[] = []
    for (let i = 0; i <= text.length; i++) {
      tcs.push(new TaggedChar(text[i], tag))
    }
    return new TaggedString(tcs)
  }

  at(offset:number):TaggedChar {
    assert(offset >= 0 && offset < this.length, "Offset out of bounds " + offset)
    return this.text[offset]
  }
}

class MyersState {
  pathCollection:Path[] = []
  path:Path = Path.Empty
  text:TaggedString = new TaggedString([])
  candidates:Line[] = []
  highlights:Line[] = []
  topLevel:boolean = true
  diagonal:number

  constructor(diagonal:number) {
    this.diagonal = diagonal
  }

  static EmptyState() {
    return new MyersState(0)
  }
}

class MyersContext {
  public output:MyersState[] = []
  private left:string
  private top:string

  endpoints:Path[] = []

  constructor(left:string, top:string) {
    this.left = left
    this.top = top
  }

  leftAt(idx:number) {
    assert(idx >= 0 && idx < this.left.length, "Left index " + idx + " out of bounds")
    return this.left[idx]
  }

  topAt(idx:number) {
    assert(idx >= 0 && idx < this.top.length, "Top index " + idx + " out of bounds")
    return this.top[idx]
  }

  pushState(diagonal:number):MyersState {
    let result = new MyersState(diagonal)
    this.output.push(result)
    return result
  }

  // Remove any points outside of our range
  trim1Path(path:Path): Path {
    let result = Path.Empty.copy()
    for (let point of path.points) {
      if (point.x <= this.top.length && point.y <= this.left.length) {
        result.points.push(point)
      }
    }
    return result
  }

  trimPaths(paths:Path[]): Path[] {
    let result : Path[] = []
    for (var idx of pathIndexes(paths)) {
      result[idx] = this.trim1Path(paths[idx])
    }
    return result
  }

  taggedStringForPath(path:Path):TaggedString {
    if (path.points.length < 2) {
      return new TaggedString([])
    }
    let tchars : TaggedChar[] = []
    // Skip the point at idx 0, since that doesn't correspond to a character
    let last = path.points[1]
    let idx = 2
    for (; idx < path.points.length; idx++) {
      let current = path.points[idx]
      assert(current.x > last.x || current.y > last.y, "Corrupt path")
      let goesRight = current.x > last.x, goesDown = current.y > last.y
      let deleted = goesDown && !goesRight
      let tag = new Tag(goesRight, goesDown, deleted)
      let char = goesRight ? this.topAt(last.x) : this.leftAt(last.y)
      tchars.push(new TaggedChar(char, tag))
      last = current
    }
    // everything remaining is from the old string
    let remainingTag = new Tag(false, true, false)
    for (let y = last.y; y < this.left.length; y++) {
      tchars.push(new TaggedChar(this.leftAt(y), remainingTag))
    }
    return new TaggedString(tchars)
  }

  extend1Diagonal(step:number, diagonal:number) {
    const tthis = this // workaround https://github.com/Microsoft/TypeScript/issues/6021

    let topLen = tthis.top.length
    let downLen = tthis.left.length

    let endpoints = this.endpoints // alias to avoid typing 'this'
    let getLine = (where:Point, down:boolean):Line => {
      // if down is true, we are starting from the diagonal above us, which is larger
      // if down is false, we are starting from the diagonal to our left, which is smaller
      let otherDiagonal = diagonal + (down ? 1 : -1)
      let startX = x - (down ? 0 : 1)
      let startY = startX - otherDiagonal
      let start = {x:startX, y:startY}
      let end = {x:startX + (down ? 0 : 1), y:startY + (down ? 1 : 0)}
      return new Line(start, end)
    }

    // Whether we traverse down (y+1) or right (x+1)
    let goDown: boolean
    let bestPath: Path

    let candidateLines:Line[] = []
    if (diagonal == -step) {
        let top = endpoints[diagonal+1]
        goDown = true
        bestPath = top
        candidateLines.push(getLine(top.end(), goDown))
    } else if (diagonal == step) {
        let left = endpoints[diagonal-1]
        goDown = false
        bestPath = left
        candidateLines.push(getLine(moved(left.end(), 1), goDown))
    } else {
        let left = endpoints[diagonal-1], top = endpoints[diagonal+1]
        goDown = left.end().x < top.end().x
        bestPath = goDown ? top : left
        candidateLines.push(getLine(top.end(), true), getLine(moved(left.end(), 1), false))
    }

    // go down or right
    let x:number = goDown ? endpoints[diagonal + 1].end().x : endpoints[diagonal - 1].end().x + 1
    let y:number = x - diagonal

    assert(isFinite(x) && isFinite(y), "Internal error: non-finite values " + x + " / " + y)
    assert(x >= 0 && y >= 0, "Internal error: negative values " + x + " / " + y)

    var cursorPath = bestPath.plus({x:x, y:y})

    // Skip cases that go off the grid
    if (x > topLen || y > downLen) {
        endpoints[diagonal] = cursorPath
        return false
    }

    // TODO: update tagged string

    let highlightLines:Line[] = []
    highlightLines.push(Line.make(x - (goDown ? 0 : 1), y - (goDown ? 1 : 0), x, y))

    let state = tthis.pushState(diagonal)
    state.pathCollection = tthis.trimPaths(endpoints)
    state.path = tthis.trim1Path(cursorPath)
    state.text = tthis.taggedStringForPath(state.path)
    state.candidates = candidateLines
    state.highlights = highlightLines

    // Traverse the snake
    while (x < topLen && y < downLen && tthis.topAt(x) == tthis.leftAt(y)) {
      if (diagonal == -3) {
        console.log("Here: " + x + " ," + y)
      }
        x++, y++
        cursorPath = cursorPath.plus({x:x, y:y})
        // copy and update our tagged string
        // the character at index y-1 in our string is now shared
        // new_tagged_string = new_tagged_string.slice(0)
        // remove_tag(new_tagged_string, TAG_RECENT)
        // let idx = new_tagged_string.indexOf(down_tagged_string[y-1])
        // new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_TOP | TAG_RECENT)
        //
        highlightLines = highlightLines.concat([Line.make(x-1, y-1, x, y)])
        let state = tthis.pushState(diagonal)
        state.pathCollection = tthis.trimPaths(endpoints)
        state.path = tthis.trim1Path(cursorPath)
        state.text = tthis.taggedStringForPath(state.path)
        state.candidates = candidateLines
        state.highlights = highlightLines
        state.topLevel = false

        if (x >= topLen && y >= downLen) {
            break
        }
    }
    endpoints[diagonal] = cursorPath
    return x >= topLen && y >= downLen // whether we're done
  }

  // Single directional myers diff algorithm
  unidir() {
    const tthis = this // workaround https://github.com/Microsoft/TypeScript/issues/6021
    let endpoints = this.endpoints // alias to avoid having to write 'this'
    endpoints[1] = new Path([{x:0, y:-1}])

    // maximum number of steps required to find the shortest script
    const MAX = tthis.top.length + tthis.left.length
    let done = false
    for (let step=0; step <= MAX && ! done; step++) {
      for (let diagonal = -step; diagonal <= step && ! done; diagonal+=2) {
        done = this.extend1Diagonal(step, diagonal)
      }
    }
  }
}

class MyersInput {
  constructor(public left:string, public top:string) {}
}

function MyersUnidir(input:MyersInput) : MyersState[] {
  let ctx = new MyersContext(input.left, input.top)
  ctx.unidir()
  return ctx.output
}
