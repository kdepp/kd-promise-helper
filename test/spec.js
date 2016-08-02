var expect = require('chai').expect;
var h = require('../index');
var retry = h.retry;
var rateLimit = h.rateLimit;
var queue = h.queue;
var concurrent = h.concurrent;
var promisify = h.promisify

describe('promise-helper', function () {

  describe('Promise retry', function () {
    it('retry succeed', function (done) {
      var i = 0;
      var f = function () {
        return new Promise(function (resolve, reject) {
          if (i ++  < 2) {
              throw new Error('need more');
          } else {
              return resolve(true);
          }
        });
      };
      var g = retry(3, f);

      g()
      .then(function (data) {
        expect(data).to.be.true;
        done();
      })
      .catch(function (e) {
        console.log(e.stack);
      });
    });

    it('exceed max retry', function (done) {
      var i = 0;
      var f = function () {
        return new Promise(resolve => {
            if (i ++  < 2) {
                throw new Error('need more');
            } else {
                return resolve(true);
            }
        });
      };
      var g = retry(2, f);

      g()
      .catch(function (e) {
        //console.log(e.stack);
        done();
      });
    });
  });

  describe('Rate Limit', function () {
    it('simple', function (done) {
      this.timeout(7000);

      var throttle = rateLimit(3, 900);
      var list = [];

      throttle(function () {
        list.push(1);
      });

      for (var i = 0; i < 6; i ++) {
        setTimeout((function (i) {
          return function () {
            expect(list.length).to.equal(i + 1);
            if (i == 5) done();
          };
        })(i), 300 * (i + 1));
      }
    });
  });

  describe('Queue', function () {
    it('simple', function (done) {
      this.timeout(7000);

      var list = [];
      var q = queue(3, 900);
      var f = function () {
        return q()
        .then(function () {
          list.push(1);
          return list.length;
        });
      };
      var g = function () {
        return q();
      };

      for (var i = 0; i < 6; i ++) {
        if (i < 3) {
          g();
        } else {
          f().then((function (i) {
            return function (len) {
              expect(len).to.equal(i + 1);
            };
          })(i));
        }

        setTimeout((function (i) {
          return function () {
            if (i < 3) {
                expect(list.length).to.equal(0);
            } else {
                expect(list.length).to.equal(i - 2);
            }
            if (i == 5) done();
          };
        })(i), 300 * (i + 1));
      }
    });
});

describe('Concurrent', function () {
    it('simple', function (done) {
        var con     = concurrent(2);
        var base    = 100;
        var start   = new Date() * 1;
        var fns     = [1,2,3,4,5].map(function (i) {
          return function () {
            return new Promise(function (resolve) {
              setTimeout(function () {
                  var end = new Date() * 1;
                  resolve(Math.round((end - start) / base));
              }, i * base);
            });
          };
        });

        this.timeout(base * 10);

        Promise.all(fns.map(function (fn) {
          return con(fn)(1, 2);
        }))
        .then(function (ret) {
          expect(ret).to.eql([1, 2, 4, 6, 9]);
          done();
        })
        .catch(function (e) {
          console.log(e.stack);
        });
    });

    it('with promisify', function (done) {
        this.timeout(10000);

        var con = concurrent(2);
        var f   = promisify(function (a, b, cb) {
          setTimeout(function () {
            cb(null, a * b);
          }, 500);
        });
        var g   = con(f);
        var ret = [];

        var ps = [1,2,3,4,5].map(function (a) {
          return g(a, a)
              .then(function (n) {
                ret.push(n);
                return n;
              }, function (e) {
                console.log('err', e);
              })
        });

        setTimeout(function () {
          expect(ret.length).to.equal(2);
        }, 800);

        setTimeout(function () {
          expect(ret.length).to.equal(4);
        }, 1200);

        Promise.all(ps)
        .then(function (data) {
          expect(data).to.eql([1,4,9,16,25]);
          done();
        });
    });
});
});
