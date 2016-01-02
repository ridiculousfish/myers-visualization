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

  lastSnake():Path {
    assert(this.points.length > 0, "Last snake of empty path")
    const lastPoint = this.points[this.points.length - 1]
    const diagonal = lastPoint.x - lastPoint.y
    // Count the suffix of points on this diagonal
    // idx will be the last point on a different diagonal,
    // or -1 if all points are on the same diagonal
    let idx = this.points.length - 1
    while (idx--) {
      const p = this.points[idx]
      if (p.x - p.y != diagonal) {
        break
      }
    }
    return new Path(this.points.slice(idx+1))
  }
}

/* Myers-style path "array" that may be indexed positive or negative */
interface PathArray {
  [index:number]:Path
}

function pathArrayKeys(paths:PathArray):number[] {
  // Have to map strings to numbers
  let result:number[] = Object.keys(paths).map(val => +val)
  result.sort(function(a, b) { return a-b; })
  return result
}

function pathArrayValues(paths:PathArray):Path[] {
  return pathArrayKeys(paths).map(key => paths[key])
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

interface Snake {
  length:number,
  path:Path
}

class MyersState {
  pathCollection:Path[] = []
  path:Path = new Path([])
  text:TaggedString = new TaggedString([])
  candidates:Line[] = []
  highlights:Line[] = []
  topLevel:boolean = true
  reverse:boolean = false
  diagonal:number

  constructor(diagonal:number) {
    this.diagonal = diagonal
  }

  static EmptyState() {
    return new MyersState(0)
  }
}

function append<T>(toArray:T[], fromArray:T[]) {
  for (let val of fromArray) {
    toArray.push(val)
  }
}

class MyersContext {
  private left:string
  private top:string

  endpoints:PathArray = {}

  constructor(left:string, top:string) {
    this.left = left
    this.top = top

    // preload endpoints
    this.endpoints[1] = new Path([{x:0, y:-1}])
  }

  leftAt(idx:number) {
    assert(idx >= 0 && idx < this.left.length, "Left index " + idx + " out of bounds")
    return this.left[idx]
  }

  topAt(idx:number) {
    assert(idx >= 0 && idx < this.top.length, "Top index " + idx + " out of bounds")
    return this.top[idx]
  }

  // Remove any points outside of our range
  trim1Path(path:Path): Path {
    let points = path.points.filter((p:Point)=>
      p.x <= this.top.length && p.y <= this.left.length
    )
    return new Path(points)
  }

  trimPaths(paths:PathArray): Path[] {
    return pathArrayValues(paths).map((path:Path) => this.trim1Path(path))
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

  extend1Diagonal(step:number, diagonal:number, output:MyersState[]):boolean {
    const tthis = this // workaround https://github.com/Microsoft/TypeScript/issues/6021

    let topLen = tthis.top.length
    let downLen = tthis.left.length

    let endpoints:PathArray = this.endpoints // alias to avoid typing 'this'
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

    let highlightLines:Line[] = []
    highlightLines.push(Line.make(x - (goDown ? 0 : 1), y - (goDown ? 1 : 0), x, y))

    let state = new MyersState(diagonal)
    state.pathCollection = tthis.trimPaths(endpoints)
    state.path = tthis.trim1Path(cursorPath)
    state.text = tthis.taggedStringForPath(state.path)
    state.candidates = candidateLines
    state.highlights = highlightLines
    output.push(state)

    // Traverse the snake
    while (x < topLen && y < downLen && tthis.topAt(x) == tthis.leftAt(y)) {
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
        let state = new MyersState(diagonal)
        state.pathCollection = tthis.trimPaths(endpoints)
        state.path = tthis.trim1Path(cursorPath)
        state.text = tthis.taggedStringForPath(state.path)
        state.candidates = candidateLines
        state.highlights = highlightLines
        state.topLevel = false
        output.push(state)

        if (x >= topLen && y >= downLen) {
            break
        }
    }
    endpoints[diagonal] = cursorPath
    return x >= topLen && y >= downLen // whether we're done
  }

  // Single directional myers diff algorithm
  unidir():MyersState[] {
    let result:MyersState[] = []

    // maximum number of steps required to find the shortest script
    const MAX = this.top.length + this.left.length
    let done = false
    for (let step=0; step <= MAX && ! done; step++) {
      for (let diagonal = -step; diagonal <= step && ! done; diagonal+=2) {
        done = this.extend1Diagonal(step, diagonal, result)
      }
    }
    return result
  }

  // Middle snake algorithm
  middleSnake(output:MyersState[]):Snake {
    const tthis = this // workaround https://github.com/Microsoft/TypeScript/issues/6021
    // N is horizontal, M is vertical
    const N = this.top.length
    const M = this.left.length
    const delta = N - M
    const deltaOdd = delta%2 == 1
    const MAX = Math.ceil((M+N)/2)

    // forwards and reverse contexts
    function reverseString(s:string):string {
      return s.split('').reverse().join('')
    }

    function flipPoint(p:Point):Point {
      return {x:N-p.x, y:M-p.y}
    }

    function flipPath(p:Path):Path {
      return new Path(p.points.map(flipPoint))
    }

    function flipLine(line:Line):Line {
      return new Line(flipPoint(line.end), flipPoint(line.start))
    }

    function flipState(st:MyersState):MyersState {
      let result = new MyersState(delta - st.diagonal)
      result.pathCollection = st.pathCollection.map(flipPath)
      result.path = flipPath(st.path)
      //result.text = ??
      result.candidates = st.candidates.map(flipLine)
      result.highlights = st.highlights.map(flipLine)
      result.topLevel = st.topLevel
      result.diagonal = delta - st.diagonal
      return result
    }

    const forwardsContext = new MyersContext(this.left, this.top)
    const reverseContext = new MyersContext(reverseString(this.left), reverseString(this.top))

    for (let step = 0; step <= MAX; step++) {
      for (let diagonal = -step; diagonal <= step; diagonal+=2) {

        // Check for overlap either forwards or backwards
        function checkOverlap(forwards:boolean, otherStep:number):boolean {
          const thisContext = forwards ? forwardsContext : reverseContext
          const otherContext = forwards ? reverseContext : forwardsContext
          const otherDiagonal = delta - diagonal
          let overlaps = false
          if (otherDiagonal >= -otherStep && otherDiagonal <= otherStep) {
            const thisEndpoint = thisContext.endpoints[diagonal].end()
            const otherEndpoint = flipPoint(otherContext.endpoints[otherDiagonal].end())
            assert(thisEndpoint.x - thisEndpoint.y == otherEndpoint.x - otherEndpoint.y, "Endpoints on different diagonals")
            overlaps = thisEndpoint.x >= otherEndpoint.x
          }
          return overlaps
        }

        // Forwards
        let forwardsOutput : MyersState[] = []
        forwardsContext.extend1Diagonal(step, diagonal, forwardsOutput)

        // Tell the forwards output about the reverse paths
        for (let state of forwardsOutput) {
          append(state.pathCollection,
                 tthis.trimPaths(reverseContext.endpoints).map(flipPath))
          output.push(state)
        }

        // Check for overlap
        if (deltaOdd && checkOverlap(true, step-1)) {
          return {
            length:2*step-1,
            path:forwardsContext.endpoints[diagonal].lastSnake()
          }
        }

        // Reverse
        // Flip the diagonal
        let reversedOutput : MyersState[] = []
        reverseContext.extend1Diagonal(step, diagonal, reversedOutput)

        // Tell the reverse output about the forwards paths
        for (let state of reversedOutput.map(flipState)) {
          append(state.pathCollection,
                 tthis.trimPaths(forwardsContext.endpoints))
          state.reverse = true
          output.push(state)
        }

        // Check for overlap
        if (!deltaOdd && checkOverlap(false, step)) {
          return {
            length:2*step,
            path:flipPath(reverseContext.endpoints[diagonal].lastSnake())
          }
        }
      }
    }
    assert(false, "Unreachable code reached")
    return undefined
  }
}

class MyersInput {
  constructor(public left:string, public top:string) {}
}

function MyersUnidir(input:MyersInput): MyersState[] {
  let ctx = new MyersContext(input.left, input.top)
  return ctx.unidir()
}

function MyersMiddleSnake(input:MyersInput): MyersState[] {
  let ctx = new MyersContext(input.left, input.top)
  let output:MyersState[] = []
  ctx.middleSnake(output)
  return output
}
