'use strict';

module.exports = Extract;

var Parse = require("../unzip").Parse;
var Writer = require("fstream").Writer;
var Writable = require('stream').Writable;
var fs = require('fs');
var path = require('path');
var inherits = require('util').inherits;

if (!Writable) {
  Writable = require('readable-stream/writable');
}

var S_IFREG = 0x8000;     // #define S_IFREG  0100000  /* regular file */

inherits(Extract, Writable);

function Extract (opts) {
  var self = this;
  if (!(this instanceof Extract)) {
    return new Extract(opts);
  }

  Writable.apply(this);
  this._opts = opts || { verbose: false };

  this._parser = Parse(this._opts);
  this._parser.on('error', function(err) {
    self.emit('error', err);
  });
  var externalFileAttributes = [];
  this._parser.on('metadata', function(e) {
    if (e.type === 'centralDirectoryFileHeader') {
      externalFileAttributes.push({
        path: e.path,
        mode: e.mode,
      });
    }
  });
  this.on('finish', function() {
    self._parser.end();
  });

  var writer = Writer({
    type: 'Directory',
    path: opts.path
  });
  writer.on('error', function(err) {
    self.emit('error', err);
  });
  writer.on('close', function() {
    var dirPath = self._opts && self._opts.path;
    if (dirPath) {
      externalFileAttributes.forEach(function(attr) {
        // Apply the permissions from the original "externalFileAttributes".
        if (attr.mode & S_IFREG) {
          var mode = (attr.mode & 0x1ff);
          var filePath = path.join(dirPath, attr.path);
          if (self._opts.verbose) {
            console.log('Applying mode: 0' + mode.toString(8) + " to file " + filePath);
          }
          fs.chmod(filePath, mode, function(err) {
            if (err) {
              console.error('Unable to apply mode: 0' + mode.toString(8) + " to file " + filePath);
            }
          });
        }

      });
    }
    self.emit('close')
  });

  this.on('pipe', function(source) {
    if (opts.verbose && source.path) {
      console.log('Archive: ', source.path);
    }
  });

  this._parser.pipe(writer);
}

Extract.prototype._write = function (chunk, encoding, callback) {
  if (this._parser.write(chunk)) {
    return callback();
  }

  return this._parser.once('drain', callback);
};
