window.bind = function(obj, func) {
    return function() { return func.apply(obj, arguments); };
};
