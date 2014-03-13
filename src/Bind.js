function bind(obj, func) {
    return function() { return func.apply(obj, arguments); };
}
