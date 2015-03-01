var program = require('commander')
  , Handlebars = require('handlebars')
  , fs = require('fs')
  , path = require('path')
  , async = require('async')

fs.existsSync || (fs.existsSync = path.existsSync);

var pkgPath = path.resolve('package.json');

function defaultName () {
  if (fs.existsSync(pkgPath)) return require(pkgPath).name;
  return path.basename(process.cwd());
}

function defaultDesc () {
  if (fs.existsSync(pkgPath)) return require(pkgPath).description;
  return 'generated by node-syno-upstarter';
}

program
  .version(require('./package').version)
  .usage('[options] [ -- <cmd> [args...] ]')
  .option('--no-ask', 'Run in non-interactive mode')
  .option('-n, --name <name>', 'Upstart service name (must be alpha-numeric/dashes)', defaultName())
  .option('-d, --description <desc>', 'Upstart service description', defaultDesc())
  .option('--no-log', 'Don\'t log output to /var/log/upstart')
  .option('-u, --user <user>', 'System user to run under (default: root)', 'root')
  .option('-f, --files <num>', 'Set max file descriptors (default: 1000000)', Number, 1000000)
  .option('-c, --cwd <dir>', 'Working directory for process (default: cwd)', process.cwd())
  .option('--no-respawn', 'Don\'t respawn automatically')

var idx = process.argv.indexOf('--');

if (~idx) {
  program.cmd = process.argv.splice(idx + 1).join(' ');
  process.argv.pop();
}

program.parse(process.argv);

program.start = 'syno.share.ready and syno.network.ready';
program.stop = 'runlevel [06]';

var template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'service.hbs'), 'utf8'));

if (program.cmd) {
  confirmOk();
}
else {
  if (!program.ask) {
    console.error('must supply <cmd> for non-interactive mode');
    process.exit(1);
  } 
  var prompts = {
    name: 'Upstart service name: ',
    cmd: 'Command(s) to run: (hit enter twice when done)',
    description: 'Upstart service description: ',
    log: 'Log output to /var/log/upstart? (y/n): ',
    user: 'System user to run under: ',
    files: 'Set max file descriptors: ',
    cwd: 'Working directory for process: ',
    respawn: 'Respawn automatically? (y/n): '
  }, tasks = [];
  Object.keys(prompts).forEach(function (k) {
    tasks.push(function (cb) {
      var label = prompts[k];
      if (typeof program[k] !== 'boolean' && typeof program[k] !== 'undefined') label = label.replace(/: /, ' (' + program[k] + '): ');
      var fn = ~label.indexOf('y/n') ? program.confirm : program.prompt;
      fn.call(program, label, function (val) {
        if ((typeof val === 'string' && val.length) || typeof val === 'boolean') program[k] = val;
        cb();
      });
    });
  });
  async.series(tasks, confirmOk);
}

function confirmOk () {
  if (program.user === 'root') delete program.user;
  var p = '/etc/init/' + program.name + '.conf';
  var data = template(program);
  if (program.ask) {
    console.log('\033[31m', data, '\033[0m');
    program.confirm('about to write this to \033[31m' + p + '\033[0m. is this ok? (y/n) ', function (ok) {
      if (ok) writeConf(p, data);
      else { console.log('cancelled.'); process.exit() }
    });
  }
  else {
    writeConf(p, data);
  }
}

function writeConf (p, data) {
  fs.writeFile(p, data, function(err) {
    if (err) {
      console.error('error writing file! (did you forget to `sudo`?)');
      console.error(err);
      process.exit(1);
    }
    console.log('wrote ' + p);
    process.exit();
  });
}
