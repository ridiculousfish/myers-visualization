/// <reference path='./myers_state.ts'/>
/// <reference path='./jquery.d.ts'/>

class MyersIDs {
  constructor(public svg:string, public slider:string, public diff:string,
    public text_input_1:string, public text_input_2:string) {}
}

interface MyersEventObserver {
  sliderChanged(newValue:number)
  mouseDown()
  mouseUp()
}

class MyersEvents {
  sliderMouseDown:boolean

  ids:MyersIDs

  observers:MyersEventObserver[] = []

  constructor(ids:MyersIDs) {
    this.ids = ids
  }

  private tellObservers(f:(obs:MyersEventObserver) => void):void {
    var localObservers = this.observers.slice()
    localObservers.forEach(f)
  }

  addObserver(obs:MyersEventObserver) {
    this.observers.push(obs)
  }

  install() {
    let jslider = $(this.ids.slider)
    jslider.mousedown(() => {
      this.tellObservers((o:MyersEventObserver) => {
        o.mouseDown()
      })
      console.log("Mouse down")
    })
    jslider.mouseup(() => {
      this.tellObservers((o:MyersEventObserver) => {
        o.mouseUp()
      })

      console.log("Mouse up")
    })
    jslider.on("input", (evt:any) => {
      let newValue = evt.target.value
      console.log("Input " + newValue)
      this.tellObservers((o:MyersEventObserver) => {
        o.sliderChanged(newValue)
      })
    })
  }
}
