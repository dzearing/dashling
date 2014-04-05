var gulp = require('gulp');
var clean = require('gulp-clean');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify')
var rename = require('gulp-rename');
var karma = require('gulp-karma');
var coveralls = require('gulp-coveralls');

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

function inDirectory(dir, files) {
  var newSet = [];

  for (var i = 0; i < files.length; i++) {
    newSet.push(dir + files[i]);
  }

  return newSet;
}

gulp.task('scripts', function() {

  gulp.src(paths.scripts)
    .pipe(concat('dashling.test.js'))
    .pipe(gulp.dest('./dist'));

  gulp.src(paths.wrappedScripts)
    .pipe(concat('dashling.full.js'))
    .pipe(gulp.dest('./dist'))
    .pipe(uglify())
    .pipe(rename('dashling.min.js'))
    .pipe(gulp.dest('./dist'));

});

gulp.task('test', ['scripts'], function(cb) {
  gulp.src('coverage')
    .pipe(clean());

  return gulp.src(paths.wrappedScripts.concat(paths.testFiles))
    .pipe(karma({
      configFile: 'karma.config.js',
      action: 'run'
    }))
    .on('error', function(err) {
      // Make sure failed tests cause gulp to exit non-zero
      throw err;
    });
});

gulp.task('covertest', ['scripts', 'test'], function() {
  gulp.src('coverage/**/lcov.info')
    .pipe(coveralls());
});

// Rerun the task when a file changes
gulp.task('watch', function() {
  gulp.watch(paths.scripts, ['scripts']);
  gulp.watch(paths.testFiles, ['test']);
});

gulp.task('default', ['scripts', 'test'], function() {

});