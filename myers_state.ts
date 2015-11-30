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

class Line {
  constructor(public start:Point, public end:Point) {}
  static make(x1:number, y1:number, x2:number, y2:number):Line {
    return new Line({x:x1, y:y1}, {x:x2, y:y2})
  }
}

class Tag {
  constructor(top:boolean, down:boolean) {}
  down:boolean = false
  top:boolean = false

  static Top = new Tag(true, false)
  static Down = new Tag(false, true)
}

class TaggedChar {
  constructor(public char:string, public tag:Tag) {}
}

class TaggedString {
  public length:number
  constructor(public text:TaggedChar[]) {
    this.length = text.length
  }

  static make(text:string, tag:Tag):TaggedString {
    let tcs:TaggedChar[]
    for (let i = 0; 0 <= text.length; i++) {
      tcs.push(new TaggedChar(text[i], tag))
    }
    return new TaggedString(tcs)
  }
}

class MyersState {
  path:Line[] = []
  candidates:Line[] = []
  highlights:Line[] = []
  diagonal:number

  constructor(diagonal:number) {
    this.diagonal = diagonal
  }
}

class MyersContext {
  public output:MyersState[] = []
  private left:TaggedString
  private top:TaggedString

  constructor(left:string, top:string) {
    this.left = TaggedString.make(left, Tag.Down)
    this.top = TaggedString.make(top, Tag.Top)
  }

  pushState(diagonal:number):MyersState {
    let result = new MyersState(diagonal)
    this.output.push(result)
    return result
  }

  // Single directional myers diff algorithm
  unidir() {
    let endpoints:number[] = []
    endpoints[1] = 0

    let topLen = this.top.length
    let downLen = this.left.length
    let MAX = topLen + downLen
    let done = false

    let path:Line[] = []

    for (let step=0; step <= MAX && ! done; step++) {
      for (let diagonal = -step; diagonal <= step; diagonal+=2) {

        function getLine(x:number, down:boolean):Line {
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

        let candidateLines:Line[] = []
        if (diagonal == -step) {
            let topX = endpoints[diagonal+1]
            goDown = true
            candidateLines.push(getLine(topX, goDown))
        } else if (diagonal == step) {
            let leftX = endpoints[diagonal-1]
            goDown = false
            candidateLines.push(getLine(leftX + 1, goDown))
        } else {
            let leftX = endpoints[diagonal-1], topX = endpoints[diagonal+1]
            goDown = leftX < topX
            candidateLines.push(getLine(leftX, true), getLine(leftX + 1, false))
        }

        // go down or right
        let x:number = goDown ? endpoints[diagonal + 1] : endpoints[diagonal - 1] + 1
        let y:number = x - diagonal

        // Skip cases that go off the grid
        // Note we check >, not >=, because we have a terminating dots at x == top_len / y == down_len
        if (x > topLen || y > downLen) {
            endpoints[diagonal] = x
            continue
        }

        // TODO: update tagged string

        let highlightLines:Line[] = []
        highlightLines.push(Line.make(x - (goDown ? 0 : 1), y - (goDown ? 1 : 0), x, y))

        let state = this.pushState(diagonal)
        state.path = path.slice(0)
        state.candidates = candidateLines
        state.highlights = highlightLines

        // Traverse the snake
        while (x < topLen && y < downLen && this.top[x].char == this.left[y].char) {
            x++, y++
            // copy and update our tagged string
            // the character at index y-1 in our string is now shared
            // new_tagged_string = new_tagged_string.slice(0)
            // remove_tag(new_tagged_string, TAG_RECENT)
            // let idx = new_tagged_string.indexOf(down_tagged_string[y-1])
            // new_tagged_string[idx] = new_tagged_string[idx].retag(TAG_DOWN | TAG_TOP | TAG_RECENT)
            //
            highlightLines = highlightLines.concat([Line.make(x-1, y-1, x, y)])
            let state = this.pushState(diagonal)
            state.path = path.slice(0)
            state.candidates = candidateLines
            state.highlights = highlightLines

            endpoints[diagonal] = x

            if (x >= topLen && y >= downLen) {
                done = true
                break
            }
        }
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
