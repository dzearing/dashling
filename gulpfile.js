var gulp = require("gulp");
var concat = require("gulp-concat");
var uglify = require("gulp-uglify")
var rename = require("gulp-rename");
var qunit = require("gulp-qunit");

function inDirectory(dir, files) { 
    var newSet = [];

    for (var i = 0; i < files.length; i++) { 
        newSet.push(dir + files); 
    }

    return newSet;
}


gulp.task("scripts", function() {
    gulp.src(inDirectory(".src/", [
            "Start.js",
            "Mix.js",
            "Bind.js",
            "EventingMixin.js",
            "DashlingEvents.js",
            "Dashling.js",
            "ManifestParser.js",
            "StreamController.js",
            "Stream.js",
            "Requests.js",
            "End.js"
        ]))
        .pipe(concat("dashling.full.js"))
        .pipe(gulp.dest("./dist"))
        .pipe(uglify())
        .pipe(rename("dashling.min.js"))
        .pipe(gulp.dest("./dist"));
});

gulp.task("test", ["scripts"], function() {
    return gulp.src("./test/runner.html")
        .pipe(qunit());
});

gulp.task("default", ["scripts", "test"], function() {

});

