var gulp = require('gulp');
var clean = require('gulp-clean');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify')
var rename = require('gulp-rename');
var karma = require('gulp-karma');
var coveralls = require('gulp-coveralls');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var ts = require('gulp-typescript');
var merge = require('merge2');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');

var paths = {
    scripts: inDirectory('src/', [
        'Utilities.js',
        'ThrottleMixin.js',
        'EventingMixin.js',
        'DashlingEnums.js',
        'Dashling.js',
        'Settings.js',
        'ManifestParser.js',
        'StreamController.js',
        'Stream.js',
        'RequestManager.js'
    ]),
    testFiles: ['test/src/*.js']
};

paths.wrappedScripts = ['src/Start.js'].concat(paths.scripts, ['src/End.js']);

// Comment!
function inDirectory(dir, files) {
    var newSet = [];

    for (var i = 0; i < files.length; i++) {
        newSet.push(dir + files[i]);
    }

    return newSet;
}

gulp.task('clean', function() {
    gulp.src(['coverage', 'dist'])
        .pipe(clean());
});

gulp.task('jshint', function() {
    return gulp.src(paths.scripts)
        .pipe(jshint())
        .pipe(jshint.reporter(stylish))
        .pipe(jshint.reporter('fail'));
});

gulp.task('typescript', ['clean'], function(cb) {
    var tsResult = gulp.src('src/*.ts')
        .pipe(ts({
            module: 'amd',
            declaration: true,
            target: 'ES5'
        }));

    return merge([
      tsResult.dts.pipe(gulp.dest('dist/amd')),
      tsResult.js.pipe(gulp.dest('dist/amd'))
    ]);
});

gulp.task('browserify', ['typescript'], function() {
  var b = browserify({
    entries: './dist/amd/Dashling.js',
    debug: true
  });

  b.require('./dist/amd/Dashling.js', { expose: 'Dashling'});

  return b.bundle()
    .pipe(source('dashling.js'))
    .pipe(buffer())
    .pipe(gulp.dest('./dist/'));
});

gulp.task('scripts', ['clean', 'jshint', 'testscripts'], function(cb) {
    return gulp.src(paths.wrappedScripts)
        .pipe(concat('dashling.full.js', {
            newLine: '\r\n'
        }))
        .pipe(gulp.dest('dist'))
        .pipe(uglify())
        .pipe(rename('dashling.min.js'))
        .pipe(gulp.dest('dist'));
});

gulp.task('testscripts', ['clean', 'jshint'], function() {
    return gulp.src(paths.scripts)
        .pipe(concat('dashling.test.js'))
        .pipe(gulp.dest('dist'));
});

gulp.task('test', ['clean', 'scripts'], function(cb) {
    return gulp.src(paths.wrappedScripts.concat(paths.testFiles))
        .pipe(karma({
            configFile: 'karma.config.js',
            action: 'run'
        }));
});

gulp.task('covertest', ['scripts', 'test'], function() {
    gulp.src('coverage/**/lcov.info')
        .pipe(coveralls());
});

// Rerun the task when a file changes
gulp.task('watch', function() {
    gulp.watch(paths.scripts, ['scripts']);
    gulp.watch(paths.testFiles, ['scripts']);
});

// gulp.task('default', ['jshint', 'scripts', 'test'], function() {
gulp.task('default', ['typescript'], function() {

});
