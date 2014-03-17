var gulp = require("gulp");
var concat = require("gulp-concat");
var uglify = require("gulp-uglify")
var rename = require("gulp-rename");
var qunit = require("gulp-qunit");

var paths = {
    scripts: inDirectory("src/", [
        "Start.js",
        "Utilities.js",
        "EventingMixin.js",
        "DashlingEnums.js",
        "Dashling.js",
        "ManifestParser.js",
        "StreamController.js",
        "Stream.js",
        "RequestManager.js",
        "End.js"
    ]),
    testHosts: [ "test/*.html" ],
    testFiles: [ "test/src/*.js" ]
};

function inDirectory(dir, files) {
    var newSet = [];

    for (var i = 0; i < files.length; i++) {
        newSet.push(dir + files[i]);
    }

    return newSet;
}

gulp.task("scripts", function() {

    gulp.src(paths.scripts)
        .pipe(concat("dashling.full.js"))
        .pipe(gulp.dest("./dist"))
        .pipe(uglify())
        .pipe(rename("dashling.min.js"))
        .pipe(gulp.dest("./dist"));

});


gulp.task("tests", function() {
    return gulp.src(paths.testHosts)
        .pipe(qunit());
});

// Rerun the task when a file changes
gulp.task('watch', function() {
    gulp.watch(paths.scripts, [ "scripts" ]);
    gulp.watch(paths.testFiles, [ "tests" ]);
});

gulp.task("default", ["scripts", "tests"], function() {

});

