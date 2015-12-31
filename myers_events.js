var MyersIDs = (function () {
    function MyersIDs(svg, slider, diff, text_input_1, text_input_2) {
        this.svg = svg;
        this.slider = slider;
        this.diff = diff;
        this.text_input_1 = text_input_1;
        this.text_input_2 = text_input_2;
    }
    return MyersIDs;
})();
var MyersEvents = (function () {
    function MyersEvents(ids) {
        this.observers = [];
        this.ids = ids;
    }
    MyersEvents.prototype.tellObservers = function (f) {
        var localObservers = this.observers.slice();
        localObservers.forEach(f);
    };
    MyersEvents.prototype.addObserver = function (obs) {
        this.observers.push(obs);
    };
    MyersEvents.prototype.install = function () {
        var _this = this;
        var jslider = $(this.ids.slider);
        jslider.mousedown(function () {
            _this.tellObservers(function (o) {
                o.mouseDown();
            });
            console.log("Mouse down");
        });
        jslider.mouseup(function () {
            _this.tellObservers(function (o) {
                o.mouseUp();
            });
            console.log("Mouse up");
        });
        jslider.on("input", function (evt) {
            var newValue = evt.target.value;
            console.log("Input " + newValue);
            _this.tellObservers(function (o) {
                o.sliderChanged(newValue);
            });
        });
    };
    return MyersEvents;
})();
