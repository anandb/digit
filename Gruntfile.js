module.exports = function(grunt) {
  grunt.initConfig({
    exec: {
      build: {
        cmd: 'ng build'
      },
      serve: {
        cmd: 'ng serve'
      },
      watch: {
        cmd: 'ng build --watch --configuration development'
      },
      test: {
        cmd: 'ng test'
      },
      serveSsr: {
        cmd: 'node dist/digit/server/server.mjs'
      },
      buildSingle: {
        cmd: 'ng build && node scripts/package-single-html.js'
      }
    }
  });

  grunt.loadNpmTasks('grunt-exec');

  grunt.registerTask('default', ['exec:serve']);
  grunt.registerTask('build', ['exec:build']);
  grunt.registerTask('serve', ['exec:serve']);
  grunt.registerTask('watch', ['exec:watch']);
  grunt.registerTask('test', ['exec:test']);
  grunt.registerTask('serve:ssr:digit', ['exec:serveSsr']);
  grunt.registerTask('build:single', ['exec:buildSingle']);
};
