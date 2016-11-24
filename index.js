var debug = require('debug')('kdpromise');

var id = function (x) {
  return x;
};

var promiseRetry = function (max, fn, context) {
  return function () {
    var args = [].slice.apply(arguments);
    var run = function (cnt) {
        cnt = cnt || 1;
        debug('running %s', cnt);

        return fn.apply(context, args)
        .then(id, function (err) {
            debug(err.stack);

            if (cnt < max) {
                return run(cnt + 1);
            }

            debug('tried %s times, but still failed', max);
            throw new Error('exceed max retry count');
        });
    };

    return run();
  };
};

var rateLimit = function (_cnt, _interval) {
  var cnt = _cnt || 1;
  var interval = _interval || 5000;
  var sid  = null;
  var tids = [];

  return function (fn) {
    if (fn === undefined) {
        if (sid)                clearTimeout(sid);
        for (var i = 0, l= tids.length; i < l; i ++) {
          clearTimeout(tids[i]);
        }
        return;
    }

    var schedule = function () {
      for (var i = 0; i < cnt; i ++) {
        tids.push(setTimeout(function () {
          fn();
        }, (Math.random() + i) * (interval / cnt)));
      }
    };
    var run = function () {
        schedule();
        sid = setTimeout(run, interval);
    };

    run();
  };
};

// rate 表示每秒多少个请求
var limit = function (rate) {
  var interval = 1000 / rate;

  return function (fn) {
    var queue = [];
    var timer = null;
    var checkRun = function () {
      if (queue.length === 0) {
        clearInterval(timer);
        timer = null;
      }

      var item = queue.shift();

      fn.apply(null, item.args)
      .then(
        function (data) {
          item.resolve(data);
        },
        function (err) {
          item.reject(err);
        }
      );
    };

    return function () {
      if (!timer) {
        timer = setInterval(checkRun, interval);
      }

      var args = [].slice.apply(arguments);

      return new Promise(function (resolve, reject) {
        queue.push({
          args: args,
          resolve: resolve,
          reject: reject
        });
      });
    }
  };
};

var queue = function (cnt, interval) {
  var queue = [];
  var throttle = rateLimit(cnt, interval);
  var cancel = throttle;
  var awake = function (tuple) {
    var resolve = tuple[0];
    resolve(true);
  };
  var wait = function () {
    return new Promise(function (resolve, reject) {
      queue.push([resolve, reject]);
    });
  };

  wait.cancel = function () {
    cancel();
  };

  throttle(function () {
    if (queue && queue.length >= 1) {
      awake(queue.shift());
    }
  });

  return wait;
};

var concurrent = function (max) {
  var queue   = [];
  var running = 0;
  var free    = function () {
    running --;
    check();
  };
  var check   = function () {
    if (running >= max || queue.length <= 0)  return;

    var tuple = queue.shift();
    var resolve = tuple[0];
    running ++;
    resolve(free);
  };
  var wait = function () {
    return new Promise(function (resolve, reject) {
      queue.push([resolve, reject]);
      check();
    });
  };
  var wrap = function (fn, context) {
    return function () {
      var args = [].slice.apply(arguments);

      return wait()
      .then(function (done) {
        return fn.apply(context, args)
        .then(function (ret) {
          done();
          return ret;
        })
      });
    };
  };

  return wrap;
};

var promisify = function (fn, context) {
  return function () {
    var args = [].slice.apply(arguments) || [];

    return new Promise(function (resolve, reject) {
      var cb = function (err, data) {
        if (err)  return reject(err);
        return resolve(data);
      };
      fn.apply(context, args.concat([cb]));
    });

  };
};

module.exports = {
  retry: promiseRetry,
  rateLimit: rateLimit,
  limit: limit,
  queue: queue,
  concurrent: concurrent,
  promisify: promisify
};
