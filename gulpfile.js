var gulp = require('gulp');
var clean = require('gulp-clean');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify')
var rename = require('gulp-rename');
var karma = require('gulp-karma');
var coveralls = require('gulp-coveralls');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');

var paths = {
  scripts: inDirectory('src/', [
    'Utilities.js',
    'ThrottleMixin.js',
    'EventingMixin.js',
    'DashlingEnums.js',
    'Dashling.js',
    'BandwidthMonitor.js',
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
  return gulp.src(['coverage', 'dist'])
    .pipe(clean());
});

gulp.task('jshint', function() {
  return gulp.src(paths.scripts)
    .pipe(jshint())
    .pipe(jshint.reporter(stylish))
    .pipe(jshint.reporter('fail'));
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
  return gulp.src('coverage/**/lcov.info')
    .pipe(coveralls());
});

// Rerun the task when a file changes
gulp.task('watch', function() {
  return gulp.watch(paths.scripts.concat(paths.testFiles), ['scripts']);
});

gulp.task('default', ['jshint', 'scripts', 'test'], function() {

});