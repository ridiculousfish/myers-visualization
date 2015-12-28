class Dictionary<Value> {

    _keys: string[] = [];
    _values: Value[] = [];

    constructor() {
    }

    add(key: string, value: Value) {
        this[key] = value;
        this._keys.push(key);
        this._values.push(value);
    }

    remove(key: string) {
        var index = this._keys.indexOf(key, 0);
        this._keys.splice(index, 1);
        this._values.splice(index, 1);

        delete this[key];
    }

    keys(): string[] {
        return this._keys;
    }

    values(): Value[] {
        return this._values;
    }

    containsKey(key: string) {
        if (typeof this[key] === "undefined") {
            return false;
        }
        return true;
    }
}

class StringSet {

    _values: Dictionary<boolean> = new Dictionary<boolean>();

    constructor() {
    }

    add(key: string) {
      this._values.add(key, true)
    }

    remove(key: string) {
      this._values.remove(key)
    }

    values(): string[] {
        return this._values.keys();
    }

    contains(key: string) {
      return this._values.containsKey(key)
    }
}
